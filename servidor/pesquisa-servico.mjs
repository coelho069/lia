// Serviço da Lia na VPS: pesquisa na Wikipedia e salva no Supabase quando
// nenhuma aba está com o ciclo rodando (heartbeat em lia_ciclo).
// Roda com: node --env-file=servidor/.env servidor/pesquisa-servico.mjs
import { createClient } from '@supabase/supabase-js';

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const EMAIL = process.env.LIA_EMAIL;
const SENHA = process.env.LIA_SENHA;
// Exit 2 = problema de configuração: o systemd não reinicia (RestartPreventExitStatus=2)
const naoPreenchido = (v) => !v || v.includes('COLOQUE_');
if (!URL || !KEY) {
  console.error('servidor/.env: falta VITE_SUPABASE_URL ou VITE_SUPABASE_PUBLISHABLE_KEY');
  process.exit(2);
}
if (naoPreenchido(EMAIL) || naoPreenchido(SENHA)) {
  console.error('servidor/.env: LIA_EMAIL ou LIA_SENHA ainda estão com o texto de exemplo. Preencha com o login da conta.');
  process.exit(2);
}

const JANELA_TEMAS_RECENTES = 20;
const HEARTBEAT_VALIDO_MS = 3 * 60 * 1000; // página avisou nos últimos 3 min => ela pesquisa
const CHECAGEM_MS = 60 * 1000;
const PAUSA_MIN_MS = 30000; // pausa curta: de 30 s a 1 min entre uma pesquisa e outra
const PAUSA_EXTRA_MS = 30000;
const TEMAS_RESERVA = ['Brasil', 'Japão', 'Egito', 'França', 'Astronomia', 'Dinossauros', 'Música',
  'Pintura', 'Culinária', 'Esportes', 'Vulcão', 'Oceano', 'Floresta amazônica',
  'Relógio', 'Bicicleta', 'Chocolate', 'Abelha', 'Lua', 'Trem', 'Violino',
  'Arquitetura', 'Cogumelo', 'Tartaruga', 'Montanha', 'Café', 'Xadrez',
  'Cinema', 'Papel', 'Lago', 'Mapa',];
// Lista espelhada de src/ciber-temas.ts (CIBER_TEMAS): mantenha as duas iguais.
const CIBER_TEMAS = ['Firewall', 'Criptografia', 'Criptografia de ponta-a-ponta', 'Senha', 'Gerenciador de senha',
  'Autenticação de dois fatores', 'Autenticação', 'Biometria', 'Certificado digital', 'HTTPS',
  'Antivírus', 'Cópia de segurança', 'Assinatura digital', 'Rede privada virtual',
  'Segurança da informação', 'Sistema de detecção de intrusos', 'Controle de acesso',
  'Função hash', 'Criptografia de chave pública', "Let's Encrypt", 'Proteção de dados',
  'Lei Geral de Proteção de Dados Pessoais', 'Cifra de César', 'Enigma (máquina)',
  'Segurança computacional', 'Anonimato',
  'Phishing', 'Malware', 'Vírus de computador', 'Ransomware', 'Spyware', 'Keylogger',
  'Rootkit', 'Botnet', 'Cavalo de Troia (computação)', 'Engenharia social (segurança)',
  'Vulnerabilidade (computação)', 'Ataque de negação de serviço', 'Ataque de força bruta',
  'Ataque de dicionário', 'Injeção de SQL', 'Hacker', 'Ética hacker', 'Hacktivismo',
  'Criptoanálise', 'Ciberataque', 'Ciberguerra',
  'WannaCry', 'Stuxnet', 'Heartbleed', 'Lazarus Group', 'Anonymous',
  'Cambridge Analytica', 'Kevin Mitnick',
  'Wireshark', 'Nmap', 'Metasploit', 'Tor (rede de anonimato)', 'Wi-Fi Protected Access',];
const PROBABILIDADE_CIBER = 0.25; // cerca de 1 em cada 4 pesquisas

const supabase = createClient(URL, KEY);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString(), ...a);

async function sortearTemas(qtd = 10) {
  const url = 'https://pt.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0' +
    `&rnlimit=${qtd}&format=json&origin=*`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Falha ao sortear temas');
  const data = await res.json();
  return (data.query?.random ?? []).map((r) => r.title);
}

async function buscarResumo(tema) {
  const slug = encodeURIComponent(tema.replace(/ /g, '_'));
  const res = await fetch(`https://pt.wikipedia.org/api/rest_v1/page/summary/${slug}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Wikipedia respondeu ${res.status}`);
  const data = await res.json();
  if (data.type === 'disambiguation' || !data.extract) throw new Error('Página sem resumo utilizável');
  return {
    tema: data.title ?? tema,
    resumo: data.extract,
    link: data.content_urls?.desktop?.page ?? `https://pt.wikipedia.org/wiki/${slug}`,
  };
}

// ---------------- Sites fora da Wikipédia (RSS aberto) ----------------
// Lista espelhada de src/pesquisa-fontes.ts: mantenha as duas iguais.
const FONTES = [
  { id: 'bbc', nome: 'BBC News Brasil', tipo: 'rss', feed: 'https://www.bbc.com/portuguese/index.xml' },
  { id: 'g1', nome: 'G1', tipo: 'rss', feed: 'https://g1.globo.com/rss/g1/' },
  { id: 'agencia-brasil-cultura', nome: 'Agência Brasil (cultura)', tipo: 'rss', feed: 'https://agenciabrasil.ebc.com.br/rss/cultura/feed.xml' },
  { id: 'wikipedia', nome: 'Wikipédia (pt)', tipo: 'wikipedia' },
];
const MIN_RESUMO = 40;
const MAX_RESUMO = 500;

function limparTexto(bruto) {
  return bruto
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

function campo(bloco, tag) {
  const m = bloco.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? limparTexto(m[1]) : '';
}

function cortar(texto) {
  if (texto.length <= MAX_RESUMO) return texto;
  const corte = texto.slice(0, MAX_RESUMO);
  return corte.slice(0, corte.lastIndexOf(' ')) + '…';
}

function lerItensRss(xml) {
  const blocos = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  return blocos
    .map((b) => ({ titulo: campo(b, 'title'), resumo: cortar(campo(b, 'description')), link: campo(b, 'link') }))
    .filter((i) => i.titulo && /^https?:\/\//i.test(i.link) && i.resumo.length >= MIN_RESUMO);
}

async function buscarFeedDireto(fonte) {
  const res = await fetch(fonte.feed, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LiaBot/1.0)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`${fonte.nome} respondeu ${res.status}`);
  return res.text();
}

// Mesma regra do app: sorteia um site (sem repetir o último); se falhar, tenta o próximo.
async function pesquisarSiteNoServidor({ ultimoNome, jaPesquisado, pesquisarWikipedia, reg }) {
  // Cibersegurança: mesma regra do app (ciber-temas.ts), nunca um dos últimos 20 temas
  if (Math.random() < PROBABILIDADE_CIBER) {
    const livres = CIBER_TEMAS.filter((t) => !jaPesquisado(t));
    if (livres.length > 0) {
      const tema = livres[Math.floor(Math.random() * livres.length)];
      try {
        return { ...(await buscarResumo(tema)), site: 'Wikipédia (pt)' };
      } catch (e) {
        log('tema de cibersegurança falhou:', tema, e.message);
      }
    }
  }
  const candidatos = FONTES.filter((f) => f.nome !== ultimoNome).sort(() => Math.random() - 0.5);
  for (const fonte of candidatos) {
    try {
      if (fonte.tipo === 'wikipedia') {
        const r = await pesquisarWikipedia();
        return { ...r, site: fonte.nome };
      }
      const itens = lerItensRss(await buscarFeedDireto(fonte));
      const novo = itens.find((i) => !jaPesquisado(i.titulo));
      if (!novo) throw new Error('nenhum item novo no feed');
      return { tema: novo.titulo, resumo: novo.resumo, link: novo.link, site: fonte.nome };
    } catch (e) {
      log('fonte falhou:', fonte.nome, e.message);
      // Sem resposta no prazo = travou; outros erros = falha (registro para o refletor)
      if (reg) anotarEtapa(reg, e.name === 'TimeoutError' ? 'travou' : 'falha', 'buscar resumo', `${fonte.nome}: ${e.message}`);
    }
  }
  // Todos falharam: tema de reserva lido na Wikipédia (página real)
  const livres = TEMAS_RESERVA.filter((t) => !jaPesquisado(t)).sort(() => Math.random() - 0.5);
  for (const tema of livres.slice(0, 5)) {
    try {
      return { ...(await buscarResumo(tema)), site: 'Wikipédia (pt)' };
    } catch { /* próximo tema de reserva */ }
  }
  return null;
}

// Mesmo critério do app: nunca repete um dos últimos 20 temas.
async function escolherTema(recentes) {
  const normal = (t) => t.trim().toLowerCase();
  const usados = new Set(recentes.slice(0, JANELA_TEMAS_RECENTES).map(normal));
  let candidatos = [];
  try { candidatos = await sortearTemas(10); } catch { /* sem internet: usa reserva */ }
  if (candidatos.length === 0) candidatos = [...TEMAS_RESERVA].sort(() => Math.random() - 0.5);
  const novo = candidatos.find((t) => !usados.has(normal(t)));
  if (!novo) throw new Error('Sem tema novo disponível');
  return novo;
}

function grafoDePesquisa(p) {
  const t = `tema-${p.id}`, f = `fonte-${p.id}`, a = `aprendido-${p.id}`;
  return {
    nos: [
      { id: t, pesquisa_id: p.id, label: p.topic, tipo: 'tema' },
      { id: f, pesquisa_id: p.id, label: 'fonte', tipo: 'fonte' },
      { id: a, pesquisa_id: p.id, label: 'aprendido', tipo: 'aprendido' },
    ],
    arestas: [
      { id: `e1-${p.id}`, origem_id: t, destino_id: f, tipo: 'liga' },
      { id: `e2-${p.id}`, origem_id: t, destino_id: a, tipo: 'liga' },
    ],
  };
}

async function pagina_fresca(userId) {
  const { data, error } = await supabase.from('lia_ciclo').select('atualizado_em, quem').eq('user_id', userId).maybeSingle();
  if (error) throw new Error('lia_ciclo: ' + error.message);
  if (!data) return false;
  const idade = Date.now() - new Date(data.atualizado_em).getTime();
  return data.quem === 'pagina' && idade < HEARTBEAT_VALIDO_MS;
}

async function baterHeartbeat(userId) {
  await supabase.from('lia_ciclo').upsert(
    { user_id: userId, atualizado_em: new Date().toISOString(), quem: 'servidor' },
    { onConflict: 'user_id' },
  );
}

// Status legível para a página: coluna lia_ciclo.status_texto (supabase-status.sql).
// Só escreve enquanto a linha ainda é do servidor (quem='servidor'), para nunca
// mexer no heartbeat da página. Vai em fila (ordem preservada) e sem await:
// erro vira log e nunca atrasa nem quebra o ciclo.
let filaStatus = Promise.resolve();
function gravarStatus(userId, texto) {
  filaStatus = filaStatus.then(async () => {
    try {
      const { error } = await supabase.from('lia_ciclo')
        .update({ status_texto: String(texto).slice(0, 200), atualizado_em: new Date().toISOString() })
        .eq('user_id', userId).eq('quem', 'servidor');
      if (error) log('status não gravado:', error.message);
    } catch (e) {
      log('status não gravado:', e instanceof Error ? e.message : e);
    }
  });
}

/* ---------------- Refletor: lição do ciclo (espelho da lógica de src/App.tsx) ----------------
   O ciclo do serviço tem outras etapas que as da página (não há levantar/passear aqui). */
const ETAPAS_SERVIDOR = ['escolher fonte', 'buscar resumo', 'salvar pesquisa', 'salvar grafo'];

function novoRegistro() {
  return { tema: '', planejou: [...ETAPAS_SERVIDOR], passos: [], funcionou: [], falhou: [], travou: [] };
}

// Anota uma etapa real, na ordem, e na lista do resultado
function anotarEtapa(reg, resultado, etapa, detalhe) {
  const linha = `${etapa}: ${detalhe}`;
  reg.passos.push(linha);
  if (resultado === 'ok') reg.funcionou.push(linha);
  else if (resultado === 'falha') reg.falhou.push(linha);
  else reg.travou.push(linha);
}

// Espelho de src/supabase-persistence.ts (palavrasDoTema, temaParecido, carregarLicoesRelacionadas): mantenha iguais
const PALAVRAS_VAZIAS = new Set(['a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na',
  'nos', 'nas', 'um', 'uma', 'para', 'por', 'com', 'sobre', 'que', 'ao', 'aos', 'the', 'of']);
const normalizarTexto = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const palavrasDoTema = (t) => normalizarTexto(t).split(/[^a-z0-9]+/).filter((p) => p.length >= 3 && !PALAVRAS_VAZIAS.has(p));
function temaParecido(a, b) {
  if (normalizarTexto(a) === normalizarTexto(b)) return true;
  const outras = new Set(palavrasDoTema(b));
  return palavrasDoTema(a).some((p) => outras.has(p));
}

async function carregarLicoesRelacionadas(userId, tema, max = 3) {
  if (!tema) return [];
  const { data: nos, error } = await supabase.from('grafo_nos')
    .select('label, pesquisa_id, created_at').eq('user_id', userId).eq('tipo', 'licao')
    .order('created_at', { ascending: false }).limit(200);
  if (error) throw new Error('grafo_nos (licoes): ' + error.message);
  if (!nos?.length) return [];
  const ids = [...new Set(nos.map((n) => n.pesquisa_id).filter(Boolean))];
  if (ids.length === 0) return [];
  const { data: pesq, error: e2 } = await supabase.from('pesquisas').select('id, tema').in('id', ids);
  if (e2) throw new Error('pesquisas (licoes): ' + e2.message);
  const temaDe = new Map((pesq ?? []).map((p) => [p.id, p.tema]));
  const escolhidas = [];
  for (const n of nos) {
    const temaPesquisa = n.pesquisa_id ? temaDe.get(n.pesquisa_id) : undefined;
    if (!temaPesquisa || !temaParecido(tema, temaPesquisa)) continue;
    escolhidas.push(String(n.label).slice(0, 200));
    if (escolhidas.length >= max) break;
  }
  return escolhidas;
}

// Chamado sem await: erro aqui só vira log e nunca atrasa o ciclo
async function refletirServico(userId, reg, pesquisaId) {
  if (reg.falhou.length === 0 && reg.travou.length === 0) return; // sem contraste: não chama
  const inicio = Date.now();
  try {
    const { refletir } = await import('./refletor.mjs'); // módulo da lia-cerebro
    const licoesAnteriores = await carregarLicoesRelacionadas(userId, reg.tema).catch(() => []);
    const resposta = await refletir({ ...reg, licoesAnteriores }, {});
    log(`refletor: ${Date.now() - inicio} ms em segundo plano (ciclo adicionado: 0 ms), origem: ${resposta?.origem ?? 'nenhuma'}`);
    const licao = typeof resposta?.licao === 'string' ? resposta.licao.trim() : '';
    if (!licao) return; // null: não salva nada
    if (!pesquisaId) { log('refletor: lição de ciclo sem pesquisa salva, não gravada'); return; }
    const id = pesquisaId;
    const { error: e1 } = await supabase.from('grafo_nos').upsert([{
      id: `licao-${id}`, user_id: userId, pesquisa_id: id, label: licao, tipo: 'licao',
    }], { onConflict: 'id' });
    if (e1) throw new Error('grafo_nos (licao): ' + e1.message);
    const { error: e2 } = await supabase.from('grafo_arestas').upsert([{
      id: `e3-${id}`, user_id: userId, origem_id: `tema-${id}`, destino_id: `licao-${id}`, tipo: 'liga',
    }], { onConflict: 'id' });
    if (e2) throw new Error('grafo_arestas (licao): ' + e2.message);
    log('refletor: lição salva para', reg.tema);
  } catch (e) {
    log('refletor falhou (o ciclo não foi afetado):', e instanceof Error ? e.message : e);
  }
}

async function pesquisarUmaVez(userId) {
  const reg = novoRegistro();
  let pesquisaId = null;
  try {
    const entry = await pesquisarESalvar(userId, reg);
    pesquisaId = entry.id;
    gravarStatus(userId, `Última pesquisa salva: ${entry.topic}`);
    return entry;
  } catch (e) {
    anotarEtapa(reg, 'falha', 'ciclo', e instanceof Error ? e.message : String(e));
    gravarStatus(userId, 'Pausa entre pesquisas (a última tentativa não salvou)');
    throw e;
  } finally {
    void refletirServico(userId, reg, pesquisaId);
  }
}

async function pesquisarESalvar(userId, reg) {
  const inicioPesquisa = Date.now();
  gravarStatus(userId, 'Pesquisando na internet');
  const { data: linhas, error: errLinhas } = await supabase
    .from('pesquisas').select('tema, site').eq('user_id', userId)
    .order('created_at', { ascending: false }).limit(JANELA_TEMAS_RECENTES);
  if (errLinhas) throw new Error('pesquisas: ' + errLinhas.message);
  const recentes = (linhas ?? []).map((l) => l.tema);
  const jaPesquisado = (t) => {
    const n = t.trim().toLowerCase();
    return recentes.slice(0, JANELA_TEMAS_RECENTES).some((x) => x.trim().toLowerCase() === n);
  };
  const r = await pesquisarSiteNoServidor({
    ultimoNome: (linhas ?? [])[0]?.site ?? null,
    jaPesquisado,
    pesquisarWikipedia: async () => buscarResumo(await escolherTema(recentes)),
    reg,
  });
  if (!r) throw new Error('Nenhuma fonte deu pesquisa nova');
  reg.tema = r.tema;
  anotarEtapa(reg, 'ok', 'buscar resumo', `${r.site}: ${r.tema}`);
  gravarStatus(userId, `Lendo o resultado de ${r.tema}`);
  const entry = { id: crypto.randomUUID(), topic: r.tema, summary: r.resumo, sources: [r.link], createdAt: Date.now(), site: r.site };

  gravarStatus(userId, `Salvando ${r.tema}`);
  const { error } = await supabase.from('pesquisas').upsert({
    id: entry.id, user_id: userId, tema: entry.topic, fontes: entry.sources,
    aprendido: entry.summary, created_at: new Date(entry.createdAt).toISOString(),
    duracao_ms: Date.now() - inicioPesquisa, site: entry.site,
  }, { onConflict: 'id' });
  if (error) throw new Error('salvar pesquisa: ' + error.message);
  anotarEtapa(reg, 'ok', 'salvar pesquisa', 'pesquisa salva');

  const g = grafoDePesquisa(entry);
  const nos = g.nos.map((n) => ({ ...n, user_id: userId }));
  const arestas = g.arestas.map((e) => ({ ...e, user_id: userId }));
  const { error: e1 } = await supabase.from('grafo_nos').upsert(nos, { onConflict: 'id' });
  if (e1) throw new Error('grafo_nos: ' + e1.message);
  const { error: e2 } = await supabase.from('grafo_arestas').upsert(arestas, { onConflict: 'id' });
  if (e2) throw new Error('grafo_arestas: ' + e2.message);
  anotarEtapa(reg, 'ok', 'salvar grafo', 'nós e arestas salvos');
  log('salvou pesquisa:', entry.topic, '· site:', entry.site);
  return entry;
}

// ---------------- Anotações da Lia (modelo local hermes3:8b na VPS) ----------------
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/chat';
const MODELO_LOCAL = process.env.MODELO_LOCAL || 'hermes3:8b';
const tentadasAnotacao = new Set(); // não tenta de novo uma pesquisa que a Lia já decidiu

function limitarFrases(texto, max = 3) {
  const frases = texto.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  return frases.slice(0, max).map((f) => f.trim()).join(' ').trim();
}

async function escreverAnotacao(tema, resumo) {
  const system =
    'Você é a Lia, que acabou de pesquisar um assunto na internet. ' +
    'Escreva uma anotação curta do que você aprendeu, com as SUAS PRÓPRIAS palavras, ' +
    'em português do Brasil, em no máximo 3 frases. Não copie trechos do texto. ' +
    'Se o texto não tiver nada que valha anotar, responda exatamente: NENHUM.';
  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(180000),
    body: JSON.stringify({
      model: MODELO_LOCAL,
      stream: false,
      keep_alive: '30m',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: 'Tema: ' + tema + '\nResumo: ' + resumo },
      ],
      options: { num_predict: 160, temperature: 0.5 },
    }),
  });
  if (!res.ok) throw new Error('Ollama respondeu ' + res.status);
  const json = await res.json();
  const bruto = (json?.message?.content ?? '').trim().replace(/^anota[cç][aã]o:\s*/i, '');
  if (!bruto || /^NENHUM\.?$/i.test(bruto)) return '';
  return limitarFrases(bruto, 3);
}

// Escreve a anotação de cada pesquisa que ainda não tem uma (id fixo: nota-<pesquisa>, não duplica)
async function anotarPendentes(userId) {
  const { data: pesq, error: e1 } = await supabase
    .from('pesquisas').select('id, tema, fontes, aprendido').eq('user_id', userId)
    .order('created_at', { ascending: false }).limit(50);
  if (e1) throw new Error('pesquisas (anotar): ' + e1.message);
  const { data: feitas, error: e2 } = await supabase
    .from('anotacoes').select('pesquisa_id').eq('user_id', userId);
  if (e2) throw new Error('anotacoes (ler): ' + e2.message);
  const comNota = new Set((feitas ?? []).map((a) => a.pesquisa_id));
  for (const p of pesq ?? []) {
    if (comNota.has(p.id) || tentadasAnotacao.has(p.id)) continue;
    tentadasAnotacao.add(p.id);
    try {
      const texto = await escreverAnotacao(p.tema, p.aprendido);
      if (!texto) { log('sem aprendizado novo, sem anotação:', p.tema); continue; }
      const agora = new Date().toISOString();
      const { error } = await supabase.from('anotacoes').upsert({
        id: 'nota-' + p.id,
        user_id: userId,
        pesquisa_id: p.id,
        autor: 'lia',
        tema: p.tema,
        fonte: (p.fontes && p.fontes[0]) || '',
        texto,
        criado_em: agora,
        atualizado_em: agora,
      }, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      log('Lia anotou:', p.tema);
    } catch (e) {
      tentadasAnotacao.delete(p.id); // erro de rede/modelo: tenta de novo na próxima volta
      log('anotação falhou:', p.tema, e instanceof Error ? e.message : e);
      break;
    }
  }
}

async function main() {
  const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: SENHA });
  if (error || !data.user) throw new Error('login falhou: ' + (error?.message ?? 'sem usuário'));
  const userId = data.user.id;
  log('logado; aguardando janela sem página pesquisando');

  while (true) {
    try {
      // Anotar nunca pode impedir a pesquisa: erro de anotação só vira log
      await anotarPendentes(userId).catch((e) => log('anotações:', e instanceof Error ? e.message : e));
      if (await pagina_fresca(userId)) {
        await dormir(CHECAGEM_MS);
        continue;
      }
      await baterHeartbeat(userId);
      await pesquisarUmaVez(userId);
    } catch (e) {
      log('erro:', e instanceof Error ? e.message : e);
    }
    await dormir(PAUSA_MIN_MS + Math.random() * PAUSA_EXTRA_MS);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
