import { supabase } from './supabase';
import type { LifeState } from './life';
import type { ResearchTopic } from './types';

/* ============================================================================
   Persistência no Supabase (fonte da verdade).
   localStorage fica só como cache/fallback, feito no App.

   Tabelas: pesquisas, grafo_nos, grafo_arestas, vida, mensagens
   (criadas por supabase-schema.sql).

   Regras:
   - Só a chave publicável no frontend (supabase.ts).
   - Todo save é upsert por id: atualiza se existe, cria se não existe.
     Nunca duplica linha.
   - Loaders retornam null em caso de erro (para não apagar o cache local
     achando que o banco está vazio). Retornam [] / objeto só se deu certo.
   ============================================================================ */

export type ChatRow = { id: string; from: string; text: string; createdAt: number };
export type GraphNode = { id: string; pesquisaId: string; label: string; tipo: 'tema' | 'fonte' | 'aprendido' | 'licao' };
export type GraphEdge = { id: string; origemId: string; destinoId: string; tipo: string };

// Id do usuário logado, lido da sessão local (sem chamada de rede a cada save).
async function getUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

/* ---------------- VIDA (um registro por usuário) ---------------- */

type SessaoCache = { token: string; userId: string } | null;
let sessaoCache: SessaoCache = null;

// Guarda token e id do usuário em memória, para enviar ao sair da página (sem await)
export function registrarSessao(session: { access_token: string; user: { id: string } } | null): void {
  sessaoCache = session ? { token: session.access_token, userId: session.user.id } : null;
}

// ID do usuário da sessão atual (para separar o cache local por conta)
export function idUsuarioAtual(): string | null {
  return sessaoCache?.userId ?? null;
}

function linhaVida(life: LifeState, userId: string) {
  return {
    user_id: userId,
    fome: Math.round(life.fome),
    energia: Math.round(life.energia),
    humor: Math.round(life.humor),
    social: Math.round(life.sociability),
    saude: Math.round(life.saude),
    xp: Math.round(life.xp),
    chapter: Math.round(life.chapter),
    updated_at: new Date().toISOString(),
  };
}

export async function saveLifeToSupabase(life: LifeState): Promise<boolean> {
  const userId = await getUserId();
  if (!userId) return false;
  const { error } = await supabase
    .from("vida")
    .upsert(linhaVida(life, userId), { onConflict: "user_id" });
  if (error) {
    console.error("[supabase] saveLife:", error.message);
    return false;
  }
  return true;
}

// Ao fechar/sair da página: envia a vida com keepalive (o navegador termina o envio)
export function salvarVidaAoSair(life: LifeState): void {
  const s = sessaoCache;
  if (!s) return;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  void fetch(url + "/rest/v1/vida?on_conflict=user_id", {
    method: "POST",
    keepalive: true,
    headers: {
      apikey: key,
      Authorization: "Bearer " + s.token,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(linhaVida(life, s.userId)),
  }).catch(() => {});
}

/** Vida lida do banco. nasceuEm vem ISO ou null (null também se a coluna ainda não existe). */
export type VidaLida = Partial<LifeState> & { nasceuEm?: string | null };

/** Retorna null se não há registro ou se houve erro. */
export async function loadLifeFromSupabase(): Promise<VidaLida | null> {
  const userId = await getUserId();
  if (!userId) return null;
  // select('*') não falha se a coluna nasceu_em ainda não existir no banco
  const { data, error } = await supabase
    .from('vida')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[supabase] loadLife:', error.message);
    throw new Error('vida: ' + error.message);
  }
  if (!data) return null;
  const nasceu = (data as { nasceu_em?: string | null }).nasceu_em ?? null;
  return {
    fome: data.fome,
    energia: data.energia,
    humor: data.humor,
    sociability: data.social,
    saude: data.saude,
    xp: data.xp,
    chapter: data.chapter,
    nasceuEm: nasceu,
  };
}

/**
 * Data de criação da Lia (para o mostrador de dias).
 * Retorna null se não há registro, se a coluna nasceu_em ainda não existe
 * (SQL não rodado) ou se houve erro. Nunca lança.
 */
export async function ultimaDataDeNascimento(): Promise<Date | null> {
  try {
    const userId = await getUserId();
    if (!userId) return null;
    const { data, error } = await supabase
      .from('vida')
      .select('nasceu_em')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return null;
    const iso = (data as { nasceu_em?: string | null }).nasceu_em;
    if (!iso) return null;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/* ---------------- PESQUISAS (uma linha por pesquisa) ---------------- */

export async function saveResearchToSupabase(r: ResearchTopic, duracaoMs?: number): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error("Sem sessão do Supabase (usuário não logado)");
  const { error } = await supabase.from('pesquisas').upsert(
    {
      id: r.id,
      user_id: userId,
      tema: r.topic,
      fontes: r.sources,
      aprendido: r.summary,
      created_at: new Date(r.createdAt).toISOString(),
      duracao_ms: duracaoMs ?? null,
      site: r.site ?? null,
    },
    { onConflict: 'id' }
  );
  if (error) {
    console.error('[supabase] saveResearch:', error.code, error.message, error.details);
    throw new Error(`pesquisas: ${error.message} (${error.code ?? "sem código"})`);
  }
}

/** Retorna null se houve erro. Lista vazia = banco realmente sem pesquisas. */
export async function loadResearchesFromSupabase(): Promise<ResearchTopic[] | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from('pesquisas')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[supabase] loadResearches:', error.message);
    throw new Error('pesquisas: ' + error.message);
  }
  if (!data) return null;
  return data.map((r) => ({
    id: r.id,
    topic: r.tema,
    summary: r.aprendido,
    sources: Array.isArray(r.fontes) ? r.fontes : [],
    createdAt: new Date(r.created_at).getTime(),
    site: r.site ?? undefined,
  }));
}

/* ---------------- GRAFO (nós e arestas, upsert por id) ---------------- */

export async function saveGraphToSupabase(
  nodes: GraphNode[],
  edges: GraphEdge[]
): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error("Sem sessão do Supabase (usuário não logado)");
  const errors: string[] = [];
  if (nodes.length) {
    const { error } = await supabase.from('grafo_nos').upsert(
      nodes.map((n) => ({
        id: n.id,
        user_id: userId,
        pesquisa_id: n.pesquisaId,
        label: n.label,
        tipo: n.tipo,
      })),
      { onConflict: 'id' }
    );
    if (error) errors.push(`grafo_nos: ${error.message} (${error.code ?? "sem código"})`);
  }
  if (edges.length) {
    const { error } = await supabase.from('grafo_arestas').upsert(
      edges.map((e) => ({
        id: e.id,
        user_id: userId,
        origem_id: e.origemId,
        destino_id: e.destinoId,
        tipo: e.tipo,
      })),
      { onConflict: 'id' }
    );
    if (error) errors.push(`grafo_arestas: ${error.message} (${error.code ?? "sem código"})`);
  }
  if (errors.length) {
    console.error('[supabase] saveGraph:', errors.join(', '));
    throw new Error(errors.join('; '));
  }
}

/* ---------------- MENSAGENS DO CHAT (upsert por id) ---------------- */

export async function saveMessagesToSupabase(messages: ChatRow[]): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error("Sem sessão do Supabase (usuário não logado)");
  if (messages.length === 0) return;
  const { error } = await supabase.from("mensagens").upsert(
    messages.map((m) => ({
      id: m.id,
      user_id: userId,
      role: m.from === "person" ? "person" : "user",
      text: m.text,
      created_at: new Date(m.createdAt).toISOString(),
    })),
    { onConflict: "id" }
  );
  if (error) {
    console.error("[supabase] saveMessages:", error.code, error.message, error.details);
    throw new Error(`mensagens: ${error.message} (${error.code ?? "sem código"})`);
  }
}

/** Retorna null se houve erro. */
export async function loadMessagesFromSupabase(): Promise<ChatRow[] | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from('mensagens')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[supabase] loadMessages:', error.message);
    throw new Error('mensagens: ' + error.message);
  }
  if (!data) return null;
  return data.map((m) => ({
    id: m.id,
    from: m.role,
    text: m.text,
    createdAt: new Date(m.created_at).getTime(),
  }));
}

/* ---------------- Grafo derivado de uma pesquisa ----------------
   IDs estáveis (derivados do id da pesquisa), então o mesmo nó nunca é duplicado.
   Ordem: nós antes das arestas (FK), pesquisa antes do grafo (FK). */
export function grafoDePesquisa(p: ResearchTopic): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const t = `tema-${p.id}`;
  const f = `fonte-${p.id}`;
  const a = `aprendido-${p.id}`;
  return {
    nodes: [
      { id: t, pesquisaId: p.id, label: p.topic, tipo: 'tema' },
      { id: f, pesquisaId: p.id, label: 'fonte', tipo: 'fonte' },
      { id: a, pesquisaId: p.id, label: 'aprendido', tipo: 'aprendido' },
    ],
    edges: [
      { id: `e1-${p.id}`, origemId: t, destinoId: f, tipo: 'liga' },
      { id: `e2-${p.id}`, origemId: t, destinoId: a, tipo: 'liga' },
    ],
  };
}

/* ---------------- LIÇÕES (nó tipo 'licao' ligado ao tema da pesquisa) ----------------
   Uma lição por ciclo, no máximo. Só existe se a pesquisa foi salva (o nó usa pesquisa_id). */
export function grafoDaLicao(pesquisaId: string, licao: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  return {
    nodes: [{ id: `licao-${pesquisaId}`, pesquisaId, label: licao, tipo: 'licao' }],
    edges: [{ id: `e3-${pesquisaId}`, origemId: `tema-${pesquisaId}`, destinoId: `licao-${pesquisaId}`, tipo: 'liga' }],
  };
}

const PALAVRAS_VAZIAS = new Set(['a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na',
  'nos', 'nas', 'um', 'uma', 'para', 'por', 'com', 'sobre', 'que', 'ao', 'aos', 'the', 'of']);

function normalizarTexto(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Palavras com sentido do tema (sem acento, sem palavras curtas nem de ligação). */
export function palavrasDoTema(t: string): string[] {
  return normalizarTexto(t).split(/[^a-z0-9]+/).filter((p) => p.length >= 3 && !PALAVRAS_VAZIAS.has(p));
}

/** Mesmo tema ou tema parecido: igual depois de normalizar, ou pelo menos uma palavra em comum. */
export function temaParecido(a: string, b: string): boolean {
  if (normalizarTexto(a) === normalizarTexto(b)) return true;
  const outras = new Set(palavrasDoTema(b));
  return palavrasDoTema(a).some((p) => outras.has(p));
}

/** Até `max` lições (mais recentes primeiro) de temas parecidos com `tema`, cortadas em 200 caracteres.
    Retorna [] se não há sessão ou não há lições. Lança erro só se a leitura do banco falhar. */
export async function carregarLicoesRelacionadas(tema: string, max = 3): Promise<string[]> {
  const userId = await getUserId();
  if (!userId || !tema.trim()) return [];
  const { data: nos, error } = await supabase
    .from('grafo_nos')
    .select('label, pesquisa_id, created_at')
    .eq('user_id', userId)
    .eq('tipo', 'licao')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error('grafo_nos (licoes): ' + error.message);
  if (!nos?.length) return [];
  const ids = [...new Set(nos.map((n) => n.pesquisa_id).filter((x): x is string => !!x))];
  if (ids.length === 0) return [];
  const { data: pesq, error: erroPesq } = await supabase.from('pesquisas').select('id, tema').in('id', ids);
  if (erroPesq) throw new Error('pesquisas (licoes): ' + erroPesq.message);
  const temaDe = new Map((pesq ?? []).map((p) => [p.id, p.tema as string]));
  const escolhidas: string[] = [];
  for (const n of nos) {
    const temaPesquisa = n.pesquisa_id ? temaDe.get(n.pesquisa_id) : undefined;
    if (!temaPesquisa || !temaParecido(tema, temaPesquisa)) continue;
    escolhidas.push(String(n.label).slice(0, 200));
    if (escolhidas.length >= max) break;
  }
  return escolhidas;
}

/* ---------------- CICLO (quem está pesquisando agora) ---------------- */
// A página avisa que o ciclo dela está rodando; o serviço da VPS espera.
// O serviço avisa com quem='servidor'; a página não pesquisa enquanto ele estiver ativo.
const JANELA_HEARTBEAT_MS = 3 * 60 * 1000;

export async function marcarPaginaPesquisando(): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  await supabase.from('lia_ciclo').upsert(
    { user_id: userId, atualizado_em: new Date().toISOString(), quem: 'pagina' },
    { onConflict: 'user_id' },
  );
}

/** true se o serviço da VPS avisou nos últimos 3 min que está pesquisando. */
export async function servidorPesquisando(): Promise<boolean> {
  const userId = await getUserId();
  if (!userId) return false;
  const { data, error } = await supabase
    .from('lia_ciclo').select('atualizado_em, quem').eq('user_id', userId).maybeSingle();
  if (error || !data) return false;
  const idade = Date.now() - new Date(data.atualizado_em).getTime();
  return data.quem === 'servidor' && idade < JANELA_HEARTBEAT_MS;
}

/* ---------------- ESTADO DO SERVIDOR (o que o serviço da VPS está fazendo agora) ----------------
   Lê a mesma linha de lia_ciclo (coluna status_texto, criada por supabase-status.sql).
   Quando o servidor não está pesquisando, a página mostra "Sem pesquisa rodando"
   e a última pesquisa salva vem de loadResearchesFromSupabase(). */
export type EstadoServidor = {
  pesquisando: boolean;
  status: string;
  quando: number | null; // ms: última vez que o serviço avisou
};

/** Retorna null sem sessão. Lança erro se a leitura falhar (ex.: coluna status_texto ainda não criada). */
export async function lerEstadoServidor(): Promise<EstadoServidor | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from('lia_ciclo').select('atualizado_em, quem, status_texto').eq('user_id', userId).maybeSingle();
  if (error) throw new Error('lia_ciclo (status): ' + error.message);
  if (!data) return { pesquisando: false, status: 'Sem pesquisa rodando', quando: null };
  const quando = new Date(data.atualizado_em).getTime();
  const pesquisando = data.quem === 'servidor' && Date.now() - quando < JANELA_HEARTBEAT_MS;
  return {
    pesquisando,
    status: pesquisando ? (data.status_texto || 'Pesquisando') : 'Sem pesquisa rodando',
    quando,
  };
}
