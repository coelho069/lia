// Refletor de auto-melhoria (versão barata): só o loop de reflexão.
// Lê um registro de uma tentativa (o que foi planejado, feito, funcionou, falhou e travou)
// e pede UMA lição a um modelo, com evidência obrigatória tirada do próprio registro.
// Nunca reescreve o prompt do sistema da Lia. Não lança erro para quem chama.

const SISTEMA_REFLETOR = `Você é um revisor de tentativas de um agente virtual de estimação.
Você recebe o registro de UMA tentativa: o tema, o que foi planejado, os passos feitos, o que funcionou, o que falhou e o que travou.
Sua tarefa: escrever UMA única lição, e só se houver contraste real (algo que funcionou ao lado de algo que falhou ou travou).
Regras:
- Use apenas fatos que estão no registro. Não invente passos, causas ou resultados.
- A evidência deve copiar um trecho literal de um passo, de "falhou" ou de "travou" do registro.
- Não repita lições já listadas em "Lições já registradas".
- Se não houver contraste ou evidência suficiente, responda exatamente: SEM LICAO
- Responda em português, em UMA linha, sem markdown, exatamente neste formato:
APRENDIZADO: [situação] | [fraqueza] | [lição] | [evidência]
- A linha inteira deve ter no máximo 300 caracteres.`

const LIMITE_LINHA = 300
const LIMITE_ITEM = 300
const LIMITE_LICOES = 10
const TIMEOUT_MS = 30000

const agora = () => Date.now()

const texto = (v) => (typeof v === 'string' ? v.trim() : '')

// Normaliza o registro: tudo vira lista de strings não vazias, com limite de tamanho por item.
function normalizarRegistro(registro) {
  const r = registro && typeof registro === 'object' ? registro : {}
  const lista = (v) =>
    (Array.isArray(v) ? v : [])
      .map((item) => texto(typeof item === 'string' ? item : JSON.stringify(item) ?? ''))
      .filter(Boolean)
      .map((item) => item.slice(0, LIMITE_ITEM))
  return {
    tema: texto(r.tema).slice(0, LIMITE_ITEM),
    planejou: lista(r.planejou),
    passos: lista(r.passos),
    funcionou: lista(r.funcionou),
    falhou: lista(r.falhou),
    travou: lista(r.travou),
    licoesAnteriores: lista(r.licoesAnteriores).slice(-LIMITE_LICOES),
  }
}

// Regra de contraste: precisa de pelo menos um problema (falhou ou travou) E um acerto (funcionou).
function temContraste(r) {
  return (r.falhou.length + r.travou.length) > 0 && r.funcionou.length > 0
}

function montarMensagemUsuario(r) {
  const linhas = []
  linhas.push(`Tema: ${r.tema || '(sem tema)'}`)
  linhas.push('Planejou:')
  linhas.push(...(r.planejou.length ? r.planejou.map((x) => `- ${x}`) : ['- (nada registrado)']))
  linhas.push('Passos (na ordem):')
  linhas.push(...r.passos.map((x, i) => `${i + 1}. ${x}`))
  linhas.push('Funcionou:')
  linhas.push(...(r.funcionou.length ? r.funcionou.map((x) => `- ${x}`) : ['- (nada)']))
  linhas.push('Falhou:')
  linhas.push(...(r.falhou.length ? r.falhou.map((x) => `- ${x}`) : ['- (nada)']))
  linhas.push('Travou:')
  linhas.push(...(r.travou.length ? r.travou.map((x) => `- ${x}`) : ['- (nada)']))
  if (r.licoesAnteriores.length) {
    linhas.push('Lições já registradas (não repita):')
    linhas.push(...r.licoesAnteriores.map((x) => `- ${x}`))
  }
  // Trecho exato para a evidência: o modelo tende a parafrasear, então o trecho vem pronto do registro.
  const origemEvidencia = r.falhou[0] ?? r.travou[0] ?? r.passos[0]
  if (origemEvidencia) {
    linhas.push(`Na última parte da linha (evidência), copie exatamente este trecho do registro, sem mudar nada: "${origemEvidencia.slice(0, 30)}"`)
  }
  return linhas.join('\n')
}

// Normaliza texto para comparar evidência: minúsculas, sem acento, espaços colapsados.
function normalizarComparacao(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// A evidência precisa citar um trecho concreto de passos, falhou ou travou.
// Usa os primeiros 30 caracteres de cada item (mínimo 8) para aceitar cortes e pequenas variações.
function evidenciaCitaRegistro(evidencia, r) {
  const ev = normalizarComparacao(evidencia)
  if (!ev) return false
  const itens = [...r.passos, ...r.falhou, ...r.travou]
  return itens.some((item) => {
    const fragmento = normalizarComparacao(item).slice(0, 30)
    return fragmento.length >= 8 && ev.includes(fragmento)
  })
}

// Lê a primeira linha que começa com APRENDIZADO: e valida os 4 campos e a evidência.
// Devolve a lição (string) ou null.
function extrairLicao(resposta, r) {
  const linha = String(resposta ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.startsWith('APRENDIZADO:'))
  if (!linha) return { licao: null, motivo: 'formato invalido' }
  if (linha.length > LIMITE_LINHA) return { licao: null, motivo: 'linha longa demais' }

  const campos = linha.slice('APRENDIZADO:'.length).split('|').map((c) => c.trim())
  if (campos.length !== 4 || campos.some((c) => !c)) return { licao: null, motivo: 'campos incompletos' }

  const evidencia = campos[3]
  if (!evidenciaCitaRegistro(evidencia, r)) return { licao: null, motivo: 'evidencia sem passo do registro' }

  return { licao: linha, motivo: null }
}

// Chamada principal: DeepSeek chat (nunca deepseek-reasoner).
async function chamarDeepseek(fetchImpl, chave, mensagens) {
  const resp = await fetchImpl('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${chave}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      temperature: 0.3,
      max_tokens: 100,
      messages: mensagens,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!resp.ok) throw new Error(`deepseek HTTP ${resp.status}`)
  const json = await resp.json()
  const tokens = typeof json?.usage?.total_tokens === 'number' ? json.usage.total_tokens : null
  return { texto: json?.choices?.[0]?.message?.content ?? '', tokens }
}

// Fallback local: Ollama com hermes3:8b. Sem header Origin (o Ollama recusa com Origin de navegador).
async function chamarLocal(fetchImpl, mensagens) {
  const resp = await fetchImpl('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'hermes3:8b',
      stream: false,
      options: { num_predict: 100, temperature: 0.3 },
      messages: mensagens,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!resp.ok) throw new Error(`ollama HTTP ${resp.status}`)
  const json = await resp.json()
  const tokens =
    typeof json?.prompt_eval_count === 'number' && typeof json?.eval_count === 'number'
      ? json.prompt_eval_count + json.eval_count
      : null
  return { texto: json?.message?.content ?? '', tokens }
}

function resultado(licao, origem, tokens, inicio, motivo) {
  const out = { licao, origem, tokens, ms: agora() - inicio }
  if (motivo) out.motivo = motivo
  return out
}

export async function refletir(registro, opts = {}) {
  const inicio = agora()
  const fetchImpl = opts.fetchImpl ?? fetch
  const env = opts.env ?? process.env

  const r = normalizarRegistro(registro)

  // Sem contraste: não chama modelo nenhum.
  if (!temContraste(r)) {
    return resultado(null, null, null, inicio, 'sem contraste')
  }

  const mensagens = [
    { role: 'system', content: SISTEMA_REFLETOR },
    { role: 'user', content: montarMensagemUsuario(r) },
  ]

  let origem = null
  let resposta = null
  let tokens = null
  const motivos = []

  // 1) DeepSeek, se houver chave.
  const chave = env.DEEPSEEK_API_KEY
  if (!chave) {
    motivos.push('sem chave DeepSeek')
  } else {
    try {
      const d = await chamarDeepseek(fetchImpl, chave, mensagens)
      origem = 'deepseek-chat'
      resposta = d.texto
      tokens = d.tokens
    } catch (e) {
      // Só a mensagem do erro: nunca a chave, nem o corpo das mensagens.
      motivos.push(`deepseek falhou: ${e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : (e?.message ?? 'erro')}`)
    }
  }

  // 2) Fallback local, se a DeepSeek não respondeu.
  if (resposta === null) {
    try {
      const l = await chamarLocal(fetchImpl, mensagens)
      origem = 'hermes3:8b'
      resposta = l.texto
      tokens = l.tokens
    } catch (e) {
      motivos.push(`local falhou: ${e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : (e?.message ?? 'erro')}`)
    }
  }

  if (resposta === null) {
    const motivo = motivos.join('; ') || 'nenhum modelo disponivel'
    console.warn(`[refletor] sem lição: ${motivo}`)
    return resultado(null, null, null, inicio, motivo)
  }

  const { licao, motivo: motivoValidacao } = extrairLicao(resposta, r)
  const ms = agora() - inicio

  if (!licao) {
    const motivo = motivoValidacao ?? 'formato invalido'
    console.warn(`[refletor] ${origem} respondeu mas a lição foi descartada: ${motivo}`)
    return resultado(null, null, tokens, inicio, motivo)
  }

  console.log(`[refletor] origem=${origem} ms=${ms}${tokens !== null ? ` tokens=${tokens}` : ''}`)
  return resultado(licao, origem, tokens, inicio, undefined)
}
