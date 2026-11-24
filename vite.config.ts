import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { FONTES } from './src/pesquisa-fontes'
// @ts-ignore módulo JS do servidor, sem arquivo de tipos
import { refletir } from './servidor/refletor.mjs'
// @ts-ignore módulo JS do servidor, sem arquivo de tipos
import { obterNoticiasIA } from './servidor/noticias-ia.mjs'

// Ollama local da VPS. O navegador chama /api/lia-chat (mesma origem);
// o servidor da Lia repassa só para o /api/chat do Ollama. Sem chave de API.
// O Ollama recusa (403) requisições com cabeçalho Origin de navegador,
// então o proxy remove esse cabeçalho antes de repassar.
const ollamaProxy = {
  '/api/lia-chat': {
    target: 'http://localhost:11434',
    changeOrigin: true,
    rewrite: () => '/api/chat',
    configure: (proxy: any) => {
      proxy.on('proxyReq', (proxyReq: any, _req: any, res: any) => {
        proxyReq.removeHeader('origin')
        // Se o navegador desistir (timeout), cancela a geração no Ollama para não gastar CPU à toa
        // (evento da resposta: só dispara se o navegador fechou a conexão antes do fim)
        res.on('close', () => {
          if (!res.writableFinished) proxyReq.destroy()
        })
      })
    },
  },
}

// Feeds RSS de sites de pesquisa. O navegador não lê esses domínios (sem CORS),
// então o servidor busca só os endereços da lista em src/pesquisa-fontes.ts.
const rotaFeeds = (req: any, res: any) => {
  const id = new URL(req.url, 'http://local').searchParams.get('id')
  const fonte: any = FONTES.find((f: any) => f.id === id)
  if (!fonte || fonte.tipo !== 'rss') {
    res.statusCode = 404
    res.end('fonte desconhecida')
    return
  }
  fetch(fonte.feed, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LiaBot/1.0)' },
    signal: AbortSignal.timeout(15000),
  })
    .then(async (r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const texto = await r.text()
      res.setHeader('Content-Type', 'application/xml; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(texto)
    })
    .catch((e: any) => {
      res.statusCode = 502
      res.end('falha: ' + (e?.message ?? e))
    })
}
const feedsPlugin = {
  name: 'lia-feeds-rss',
  configureServer(server: any) {
    server.middlewares.use('/api/fonte-rss', rotaFeeds)
  },
  configurePreviewServer(server: any) {
    server.middlewares.use('/api/fonte-rss', rotaFeeds)
  },
}

// Refletor de auto-melhoria: POST /api/refletor com o registro de uma tentativa.
// Lê o corpo JSON (máx. 20 KB) e devolve a lição (ou null) em JSON. A chave fica só no servidor.
const LIMITE_CORPO_REFLETOR = 20 * 1024
const lerCorpoJson = (req: any, limite: number): Promise<any> =>
  new Promise((ok, falha) => {
    const pedacos: Buffer[] = []
    let total = 0
    let estourou = false
    req.on('data', (c: Buffer) => {
      if (estourou) return
      total += c.length
      if (total > limite) {
        estourou = true
        falha(new Error('corpo grande demais'))
        return
      }
      pedacos.push(c)
    })
    req.on('end', () => {
      if (estourou) return
      try {
        ok(JSON.parse(Buffer.concat(pedacos).toString('utf8')))
      } catch (e) {
        falha(e)
      }
    })
    req.on('error', falha)
  })
const enviarJson = (res: any, status: number, corpo: unknown) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(corpo))
}
const rotaRefletor = async (req: any, res: any) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    enviarJson(res, 405, { erro: 'use POST' })
    return
  }
  let registro: any
  try {
    registro = await lerCorpoJson(req, LIMITE_CORPO_REFLETOR)
  } catch {
    enviarJson(res, 400, { erro: 'corpo invalido' })
    return
  }
  try {
    const out = await refletir(registro, { env: process.env })
    enviarJson(res, 200, out)
  } catch (e: any) {
    console.warn('[refletor] erro inesperado:', e?.message ?? e)
    enviarJson(res, 500, { licao: null, origem: null, tokens: null, ms: 0, motivo: 'erro interno' })
  }
}
const refletorPlugin = {
  name: 'lia-refletor',
  configureServer(server: any) {
    server.middlewares.use('/api/refletor', rotaRefletor)
  },
  configurePreviewServer(server: any) {
    server.middlewares.use('/api/refletor', rotaRefletor)
  },
}

// Notícias de IA da Lia: GET /api/noticias-ia devolve as notícias lidas (cache de 1 hora)
// e o comentário do dia da Lia (gerado uma vez por dia pelo hermes3:8b local).
const rotaNoticiasIA = async (req: any, res: any) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    enviarJson(res, 405, { erro: 'use GET' })
    return
  }
  try {
    enviarJson(res, 200, await obterNoticiasIA({ fetchImpl: fetch }))
  } catch (e: any) {
    console.warn('[noticias-ia] rota falhou:', e?.message ?? e)
    enviarJson(res, 500, { erro: 'falha ao ler notícias' })
  }
}
const noticiasIaPlugin = {
  name: 'lia-noticias-ia',
  configureServer(server: any) {
    server.middlewares.use('/api/noticias-ia', rotaNoticiasIA)
  },
  configurePreviewServer(server: any) {
    server.middlewares.use('/api/noticias-ia', rotaNoticiasIA)
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), feedsPlugin, refletorPlugin, noticiasIaPlugin],
  server: { proxy: ollamaProxy },
  // Domínios públicos da Lia (atrás do Nginx). Sem isso o Vite recusa o Host do domínio.
  preview: { proxy: ollamaProxy, allowedHosts: ['liaonline.blog.br', 'www.liaonline.blog.br', 'lia.nexoralabs.dev.br'] },
})
