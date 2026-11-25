// Sites de pesquisa da Lia: notícias, ciência e cultura fora da Wikipédia (RSS aberto).
// A Wikipédia continua na lista, mas nunca é o único site.
// Lista espelhada em servidor/pesquisa-servico.mjs: mantenha as duas iguais.

import { buscarResumo, normalizarTema, TEMAS_RESERVA, type ResultadoPesquisa } from "./pesquisa-ciclo";
import { sortearTemaCiber } from "./ciber-temas";

export type FonteRss = { id: string; nome: string; tipo: "rss"; feed: string };
export type FonteWikipedia = { id: string; nome: string; tipo: "wikipedia" };
export type Fonte = FonteRss | FonteWikipedia;

// Testadas na VPS: respondem 200 e trazem itens com link e descrição.
// National Geographic Brasil: sem feed RSS nos endereços testados, por isso fica de fora.
export const FONTES: Fonte[] = [
  { id: "bbc", nome: "BBC News Brasil", tipo: "rss", feed: "https://www.bbc.com/portuguese/index.xml" },
  { id: "g1", nome: "G1", tipo: "rss", feed: "https://g1.globo.com/rss/g1/" },
  { id: "agencia-brasil-cultura", nome: "Agência Brasil (cultura)", tipo: "rss", feed: "https://agenciabrasil.ebc.com.br/rss/cultura/feed.xml" },
  { id: "wikipedia", nome: "Wikipédia (pt)", tipo: "wikipedia" },
];

export type PesquisaComSite = ResultadoPesquisa & { siteId: string; site: string };
export type ItemFeed = { titulo: string; resumo: string; link: string };

const MIN_RESUMO = 40; // item sem descrição de verdade não vira pesquisa
const MAX_RESUMO = 500;

function limparTexto(bruto: string): string {
  return bruto
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function campo(bloco: string, tag: string): string {
  const m = bloco.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? limparTexto(m[1]) : "";
}

function cortar(texto: string): string {
  if (texto.length <= MAX_RESUMO) return texto;
  const corte = texto.slice(0, MAX_RESUMO);
  return corte.slice(0, corte.lastIndexOf(" ")) + "…";
}

// Lê os itens de um RSS (sem DOMParser, para funcionar também no servidor).
export function lerItensRss(xml: string): ItemFeed[] {
  const blocos = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  return blocos
    .map((b) => ({
      titulo: campo(b, "title"),
      resumo: cortar(campo(b, "description")),
      link: campo(b, "link"),
    }))
    .filter((i) => i.titulo && /^https?:\/\//i.test(i.link) && i.resumo.length >= MIN_RESUMO);
}

export function siteIdPorNome(nome: string | null | undefined): string | null {
  return FONTES.find((f) => f.nome === nome)?.id ?? null;
}

// Como o navegador não lê RSS de outros domínios, pede ao próprio Vite (que busca no servidor).
export async function buscarFeedNoNavegador(fonte: FonteRss): Promise<string> {
  const res = await fetch("/api/fonte-rss?id=" + encodeURIComponent(fonte.id));
  if (!res.ok) throw new Error(`${fonte.nome} respondeu ${res.status}`);
  return res.text();
}

/**
 * Escolhe um site (sorteado, sem repetir o último) e tenta até achar uma pesquisa.
 * Se um site falhar, passa para o próximo. Se todos falharem, usa um tema de reserva
 * lido na Wikipédia (página real, nunca fonte inventada). Devolve null se nada der certo.
 */
export async function pesquisarSite(opcoes: {
  ultimoSiteId: string | null;
  jaPesquisado: (tema: string) => boolean;
  buscarFeed: (fonte: FonteRss) => Promise<string>;
  pesquisarWikipedia: () => Promise<ResultadoPesquisa>;
}): Promise<PesquisaComSite | null> {
  // Cibersegurança: cerca de 1 em cada 4 pesquisas (ciber-temas.ts). Tema de Wikipédia; se falhar, segue o fluxo normal.
  const ciber = sortearTemaCiber(opcoes.jaPesquisado);
  if (ciber) {
    try {
      const r = await buscarResumo(ciber);
      return { ...r, siteId: "wikipedia", site: "Wikipédia (pt)" };
    } catch (e) {
      console.warn(`[pesquisa] tema de cibersegurança "${ciber}" falhou:`, e instanceof Error ? e.message : e);
    }
  }
  const candidatos = FONTES.filter((f) => f.id !== opcoes.ultimoSiteId).sort(() => Math.random() - 0.5);
  for (const fonte of candidatos) {
    try {
      if (fonte.tipo === "wikipedia") {
        const r = await opcoes.pesquisarWikipedia();
        return { ...r, siteId: fonte.id, site: fonte.nome };
      }
      const itens = lerItensRss(await opcoes.buscarFeed(fonte));
      // jaPesquisado cobre todo o histórico: se o feed (10 a 100 itens) já foi
      // todo pesquisado, cai no catch abaixo e troca de fonte na mesma hora,
      // sem esperar e sem reusar item antigo.
      const novo = itens.find((i) => !opcoes.jaPesquisado(i.titulo));
      if (!novo) throw new Error("nenhum item novo no feed");
      return { tema: novo.titulo, resumo: novo.resumo, link: novo.link, siteId: fonte.id, site: fonte.nome };
    } catch (e) {
      console.warn(`[pesquisa] ${fonte.nome} falhou:`, e instanceof Error ? e.message : e);
    }
  }
  const livres = TEMAS_RESERVA.filter((t) => !opcoes.jaPesquisado(t)).sort(() => Math.random() - 0.5);
  for (const tema of livres.slice(0, 5)) {
    try {
      const r = await buscarResumo(tema);
      return { ...r, siteId: "wikipedia", site: "Wikipédia (pt)" };
    } catch {
      // tenta o próximo tema de reserva
    }
  }
  return null;
}

// Compara contra TODO o histórico recebido (sem janela): historico já vem
// completo do Supabase (loadResearchesFromSupabase, paginado até
// LIMITE_HISTORICO_PESQUISAS em src/supabase-persistence.ts).
export function jaFoiPesquisado(tema: string, historico: { topic: string }[]): boolean {
  const n = normalizarTema(tema);
  return historico.some((p) => normalizarTema(p.topic) === n);
}
