// Agente Hermes da Lia: modelo local hermes3:8b no Ollama da VPS (via proxy /api/lia-chat).
// O modelo escolhe sozinho as ferramentas, quando usar e quantas vezes, e só depois responde.
// Sem chave de API e sem LLM externo. Se o modelo cair, o chat usa o cérebro de palavras-chave.

import type { ResearchTopic } from "./types";
import type { LifeState } from "./life";
import { buscarResumo, normalizarTema } from "./pesquisa-ciclo";
import { safeId } from "./utils/safeId";
import {
  saveResearchToSupabase,
  saveGraphToSupabase,
  grafoDePesquisa,
  type GraphNode,
  type GraphEdge,
} from "./supabase-persistence";
import { registrarEvento } from "./eventos";

export const MODELO_LOCAL = "hermes3:8b";
export const TIMEOUT_RESPOSTA_MS = 30000; // a resposta inteira (todas as rodadas) tem 30 s
export const LIMITE_TOKENS = 200;
const MAX_RODADAS = 4; // depois disso, o modelo responde sem ferramentas
const MAX_FRASES = 3;
const MAX_CARACTERES = 300; // corta antes se a frase for longa demais para a VPS gerar rápido
const PRAZO_FERRAMENTAS_MS = 15000; // depois disso, só a resposta final
const SITE_WIKIPEDIA = "Wikipédia (pt)";

export class ErroModelo extends Error {
  kind: "timeout" | "offline";
  constructor(kind: "timeout" | "offline", message: string) {
    super(message);
    this.kind = kind;
  }
}

/* ---------------- Contexto que as ferramentas usam (estado da página) ---------------- */
export type ContextoAgente = {
  pesquisas: () => ResearchTopic[];
  vida: () => LifeState;
  novaPesquisa: (p: ResearchTopic) => void;
};

export type RespostaAgente = { texto: string; aprendizado: string; ferramentas: string[] };

/* ---------------- Objetivos (criados aqui: o projeto não tinha nenhum) ---------------- */
type Objetivo = { nome: string; progresso: number; prioridade: number; motivo: string };

function listarObjetivos(ctx: ContextoAgente): Objetivo[] {
  const v = ctx.vida();
  const pesquisas = ctx.pesquisas().length;
  const necessidades: [string, number, string][] = [
    ["manter a energia", v.energia, "energia baixa pede descanso"],
    ["manter a fome sob controle", v.fome, "fome pede comida"],
    ["manter o humor", v.humor, "humor baixo pede brincadeira"],
    ["manter a convivência", v.sociability, "pouca convivência pede conversa"],
    ["manter a saúde", v.saude, "saúde pede cuidado"],
  ];
  const objetivos: Objetivo[] = necessidades.map(([nome, valor, motivo]) => ({
    nome,
    progresso: Math.round(valor),
    prioridade: Math.round(100 - valor),
    motivo,
  }));
  // Meta de pesquisa: cinco pesquisas salvas
  const progressoPesquisa = Math.min(100, Math.round((pesquisas / 5) * 100));
  objetivos.push({
    nome: "chegar a 5 pesquisas salvas",
    progresso: progressoPesquisa,
    prioridade: 100 - progressoPesquisa,
    motivo: `${pesquisas} de 5 pesquisas feitas`,
  });
  return objetivos.sort((a, b) => b.prioridade - a.prioridade);
}

/* ---------------- Ferramentas ---------------- */
type Ferramenta = {
  nome: string;
  descricao: string;
  parametros: { type: "object"; properties: Record<string, unknown>; required: string[] };
  executar: (args: Record<string, unknown>, ctx: ContextoAgente) => Promise<unknown>;
};

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "ler_pesquisas",
    descricao: "Lê as pesquisas que a Lia já salvou (tema, o que aprendeu, site e data). Use antes de falar sobre o que ela aprendeu.",
    parametros: {
      type: "object",
      properties: { limite: { type: "number", description: "quantas pesquisas ler (1 ou 2)" } },
      required: [],
    },
    executar: async (args, ctx) => {
      // Poucas e curtas: a VPS reprocessa tudo que entra no prompt, e cada token custa tempo
      const limite = Math.min(2, Math.max(1, Number(args.limite) || 2));
      return ctx.pesquisas().slice(0, limite).map((p) => ({
        tema: p.topic,
        aprendido: p.summary.length > 150 ? p.summary.slice(0, 150) + "…" : p.summary,
        site: p.site ?? "não registrado",
        data: new Date(p.createdAt).toLocaleString("pt-BR"),
      }));
    },
  },
  {
    nome: "pesquisar_tema",
    descricao: "Pesquisa um tema na Wikipédia em português e salva a pesquisa na tabela pesquisas. Use quando pedirem uma pesquisa ou quando não souber algo.",
    parametros: {
      type: "object",
      properties: { tema: { type: "string", description: "o tema a pesquisar, por exemplo: Buraco negro" } },
      required: ["tema"],
    },
    executar: async (args, ctx) => {
      const tema = texto(args.tema);
      if (!tema) return { erro: "tema vazio" };
      let r;
      try {
        r = await buscarResumo(tema);
      } catch (e) {
        return { erro: `não achei um resumo para "${tema}" (${e instanceof Error ? e.message : e})` };
      }
      const entrada: ResearchTopic = {
        id: safeId(),
        topic: r.tema,
        summary: r.resumo,
        sources: [r.link],
        createdAt: Date.now(),
        site: SITE_WIKIPEDIA,
      };
      const g = grafoDePesquisa(entrada);
      try {
        await saveResearchToSupabase(entrada);
        await saveGraphToSupabase(g.nodes, g.edges);
      } catch (e) {
        return { erro: `pesquisa achada mas não salvou: ${e instanceof Error ? e.message : e}`, tema: r.tema, resumo: r.resumo };
      }
      ctx.novaPesquisa(entrada);
      registrarEvento("pesquisa", r.tema, { fonte: r.link, aprendido: r.resumo, pesquisa_id: entrada.id, origem: "chat" });
      return { tema: r.tema, resumo: r.resumo, fonte: r.link, site: SITE_WIKIPEDIA, salvo: true };
    },
  },
  {
    nome: "salvar_aprendizado",
    descricao: "Salva no gráfico da Lia (grafo) uma frase do que ela aprendeu, ligada à pesquisa do tema. Use depois de pesquisar.",
    parametros: {
      type: "object",
      properties: {
        texto: { type: "string", description: "o que aprendeu, em uma frase curta" },
        tema: { type: "string", description: "o tema a que o aprendizado se liga" },
      },
      required: ["texto"],
    },
    executar: async (args, ctx) => {
      const frase = texto(args.texto);
      if (!frase) return { erro: "aprendizado vazio" };
      const alvo = texto(args.tema);
      const pesquisas = ctx.pesquisas();
      const pesquisa =
        (alvo && pesquisas.find((p) => normalizarTema(p.topic) === normalizarTema(alvo))) || pesquisas[0];
      if (!pesquisa) return { erro: "ainda não há pesquisa para ligar este aprendizado" };
      const id = `aprendido-chat-${safeId()}`;
      const nos: GraphNode[] = [{ id, pesquisaId: pesquisa.id, label: frase.slice(0, 300), tipo: "aprendido" }];
      const arestas: GraphEdge[] = [
        { id: `ligacao-${id}`, origemId: `tema-${pesquisa.id}`, destinoId: id, tipo: "liga" },
      ];
      try {
        await saveGraphToSupabase(nos, arestas);
      } catch (e) {
        return { erro: `não salvou no gráfico: ${e instanceof Error ? e.message : e}` };
      }
      return { salvo: true, ligado_a: pesquisa.topic };
    },
  },
  {
    nome: "ler_vida",
    descricao: "Lê como a Lia está agora: fome, energia, humor, convivência (social), saúde e XP. Use quando perguntarem como ela está.",
    parametros: { type: "object", properties: {}, required: [] },
    executar: async (_args, ctx) => {
      const v = ctx.vida();
      return {
        fome: Math.round(v.fome),
        energia: Math.round(v.energia),
        humor: Math.round(v.humor),
        social: Math.round(v.sociability),
        saude: Math.round(v.saude),
        xp: Math.round(v.xp),
        capitulo: v.chapter,
      };
    },
  },
  {
    nome: "escolher_objetivo",
    descricao: "Escolhe o objetivo próprio da Lia agora, pela prioridade (o que está mais baixo) e pelo progresso. Use quando perguntarem o que ela quer fazer ou qual é o seu objetivo.",
    parametros: { type: "object", properties: {}, required: [] },
    executar: async (_args, ctx) => {
      const lista = listarObjetivos(ctx);
      const escolhido = lista[0];
      return { objetivo: escolhido.nome, prioridade: escolhido.prioridade, progresso: escolhido.progresso, motivo: escolhido.motivo };
    },
  },
];

/* ---------------- Ollama com ferramentas ---------------- */
const SISTEMA = `Você é a Lia, uma mulher brasileira, curiosa, que pesquisa na internet e aprende.
Você tem ferramentas. Use-as ANTES de responder quando a pergunta pedir:
- o que você aprendeu ou pesquisou: chame ler_pesquisas;
- uma pesquisa sobre um tema: chame pesquisar_tema, e depois salvar_aprendizado com uma frase do que aprendeu;
- como você está, fome, energia, humor, saúde: chame ler_vida;
- o que você quer fazer ou seu objetivo: chame escolher_objetivo.
Se não souber responder algo, não invente: diga que não sabe e chame pesquisar_tema com esse tema.
Se uma ferramenta devolver erro, diga isso na resposta e não diga que salvou.
Responda sempre em português do Brasil, em no máximo 3 frases curtas, sem listas e sem falar dos nomes das ferramentas.`;

function limitarFrases(bruto: string): string {
  const semAprendizado = bruto.replace(/\n?\s*APRENDIZADO:[\s\S]*$/i, "").trim();
  const frases = semAprendizado.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [semAprendizado];
  return frases.slice(0, MAX_FRASES).map((f) => f.trim()).join(" ").trim();
}

function lerArgumentos(bruto: unknown): Record<string, unknown> {
  if (bruto && typeof bruto === "object") return bruto as Record<string, unknown>;
  if (typeof bruto === "string") {
    try {
      return JSON.parse(bruto) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

// Uma rodada com o modelo, em streaming: para assim que a resposta tem 3 frases
// (o modelo gasta tokens à toa depois disso, e a VPS gera poucos tokens por segundo).
async function rodadaDoModelo(
  mensagens: any[],
  ferramentas: unknown[] | undefined,
  controle: AbortController
): Promise<{ texto: string; chamadas: any[] }> {
  const teto = LIMITE_TOKENS;
  const parar = new AbortController();
  let cortadoPorFrases = false;
  const aoTimeout = () => parar.abort();
  controle.signal.addEventListener("abort", aoTimeout);
  let texto = "";
  const chamadas: any[] = [];
  try {
    const res = await fetch("/api/lia-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: parar.signal,
      body: JSON.stringify({
        model: MODELO_LOCAL,
        stream: true,
        keep_alive: "30m",
        messages: mensagens,
        ...(ferramentas ? { tools: ferramentas } : {}),
        options: { num_predict: teto, temperature: 0.4 },
      }),
    });
    if (!res.ok || !res.body) throw new ErroModelo("offline", `Ollama respondeu ${res.status}`);
    const leitor = res.body.getReader();
    const decodificador = new TextDecoder();
    let resto = "";
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      resto += decodificador.decode(value, { stream: true });
      let fim: number;
      while ((fim = resto.indexOf("\n")) >= 0) {
        const linha = resto.slice(0, fim).trim();
        resto = resto.slice(fim + 1);
        if (!linha) continue;
        const msg = JSON.parse(linha)?.message ?? {};
        if (Array.isArray(msg.tool_calls)) chamadas.push(...msg.tool_calls);
        if (msg.content) texto += msg.content;
      }
      const cheio = (texto.match(/[.!?](\s|$)/g) ?? []).length >= MAX_FRASES || texto.length > MAX_CARACTERES;
      if (chamadas.length === 0 && cheio) {
        cortadoPorFrases = true;
        parar.abort();
        break;
      }
    }
  } catch (e) {
    // Timeout geral: relança. Corte nosso (já tem 3 frases): segue com o texto que chegou.
    if (controle.signal.aborted) throw e;
    if (!(cortadoPorFrases && parar.signal.aborted)) throw e;
  } finally {
    controle.signal.removeEventListener("abort", aoTimeout);
  }
  return { texto, chamadas };
}

/**
 * Responde a pergunta com o agente: o modelo chama ferramentas (quantas quiser, até
 * MAX_RODADAS), recebe os resultados e só então escreve a resposta final.
 * Lança ErroModelo se o Ollama cair ou passar de 30 s.
 */
export async function perguntarModeloLocal(pergunta: string, ctx: ContextoAgente): Promise<RespostaAgente> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TIMEOUT_RESPOSTA_MS);
  const ferramentasUsadas: string[] = [];
  const ferramentasOllama = FERRAMENTAS.map((f) => ({
    type: "function",
    function: { name: f.nome, description: f.descricao, parameters: f.parametros },
  }));
  const mensagens: any[] = [
    { role: "system", content: SISTEMA },
    { role: "user", content: pergunta },
  ];
  const inicio = Date.now();
  try {
    for (let rodada = 0; rodada <= MAX_RODADAS; rodada++) {
      // Depois de metade do tempo, a próxima rodada já é a resposta final (sem ferramentas),
      // para caber nos 30 s: a VPS gera poucos tokens por segundo.
      const usarFerramentas = rodada < MAX_RODADAS && Date.now() - inicio < PRAZO_FERRAMENTAS_MS;
      const { texto, chamadas } = await rodadaDoModelo(mensagens, usarFerramentas ? ferramentasOllama : undefined, controle);

      if (chamadas.length === 0) {
        const final = limitarFrases(texto);
        if (!final) {
          if (ferramentasUsadas.length === 0) throw new ErroModelo("offline", "Resposta vazia do modelo");
          return { texto: "Não consegui formar uma resposta agora.", aprendizado: "", ferramentas: ferramentasUsadas };
        }
        return { texto: final, aprendizado: "", ferramentas: ferramentasUsadas };
      }

      mensagens.push({ role: "assistant", content: texto, tool_calls: chamadas });
      for (const chamada of chamadas) {
        const nome: string = chamada?.function?.name ?? "";
        const ferramenta = FERRAMENTAS.find((f) => f.nome === nome);
        ferramentasUsadas.push(nome);
        let resultado: unknown;
        if (!ferramenta) {
          resultado = { erro: `ferramenta desconhecida: ${nome}` };
        } else {
          try {
            resultado = await ferramenta.executar(lerArgumentos(chamada.function.arguments), ctx);
          } catch (e) {
            resultado = { erro: e instanceof Error ? e.message : String(e) };
          }
        }
        mensagens.push({ role: "tool", tool_name: nome, content: JSON.stringify(resultado) });
      }
    }
    throw new ErroModelo("offline", "Agente sem resposta final");
  } catch (e) {
    if (e instanceof ErroModelo) throw e;
    if (controle.signal.aborted) throw new ErroModelo("timeout", "Demorou mais de 30 s");
    throw new ErroModelo("offline", e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- Cérebro local (fallback quando o modelo cai) ---------------- */
export function respostaLocal(pergunta: string, pesquisas: ResearchTopic[]): string {
  const p = pergunta.toLowerCase();
  if (/\b(oi|olá|ola|bom dia|boa tarde|boa noite)\b/.test(p)) {
    return "Oi! Tudo bem por aqui. Pode perguntar o que quiser.";
  }
  if (/tudo bem|como você está|como vc está|como voce esta/.test(p)) {
    return "Estou bem! Passeando e aprendendo coisas novas.";
  }
  if (/aprendeu|pesquisou|descobriu|pesquisas/.test(p)) {
    if (pesquisas.length === 0) return "Ainda não pesquisei nada.";
    return "Pesquisei sobre: " + pesquisas.slice(0, 3).map((x) => x.topic).join(", ") + ".";
  }
  if (/o que é|oque é|o que e|explica|explique|me fala/.test(p)) {
    return "Ainda não consigo explicar isso sem o meu modelo. Veja a aba Pesquisas, lá tem o que já pesquisei.";
  }
  return "Não entendi bem. Pode perguntar de outro jeito?";
}
