// Linha do tempo "enquanto você estava fora". Só leitura: não grava nada no banco.
// A última visita fica no localStorage (por usuário). Quem chama é a aba do navegador.
import { supabase } from "./supabase";
import { idUsuarioAtual } from "./supabase-persistence";

export type TipoItemLinhaDoTempo = "pesquisa" | "licao" | "vida" | "atividade";

export type ItemLinhaDoTempo = {
  quando: number; // ms desde a época
  tipo: TipoItemLinhaDoTempo;
  titulo: string;
  detalhe: string;
};

export type ResultadoLinhaDoTempo = {
  itens: ItemLinhaDoTempo[]; // do mais recente para o mais antigo
  avisos: string[]; // textos curtos; vazio se tudo deu certo
};

export type VisitaAberta = {
  desde: number; // ms: data de corte da linha do tempo
  primeiraVez: boolean; // true quando não havia data guardada
  aviso?: string;
};

const PREFIXO_VISITA = "lia-ultima-visita:";
const JANELA_PRIMEIRA_VEZ_MS = 24 * 60 * 60 * 1000;
const LIMITE_ITENS = 200;

function chaveVisita(): string {
  return PREFIXO_VISITA + (idUsuarioAtual() ?? "sem-usuario");
}

function resumir(texto: unknown, max: number): string {
  const s = String(texto ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

function ms(iso: unknown): number {
  const t = typeof iso === "string" ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : NaN;
}

/** Lê a última visita guardada no navegador. ms = null quando não há data (ou ela é inválida). */
export function lerUltimaVisita(): { ms: number | null; aviso?: string } {
  try {
    const raw = localStorage.getItem(chaveVisita());
    if (raw === null) return { ms: null };
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      return { ms: null, aviso: "Data da última visita inválida; mostrando as últimas 24 h." };
    }
    return { ms: n };
  } catch {
    return { ms: null, aviso: "Não consegui ler a última visita do navegador; mostrando as últimas 24 h." };
  }
}

/**
 * Chamar UMA vez quando a aba abre. Devolve a data de corte (última visita, ou 24 h na primeira vez)
 * e grava a visita atual. Guarde o resultado: não chame de novo para atualizar a lista.
 * Chamar depois que a sessão do Supabase estiver registrada, para a chave ser do usuário certo.
 */
export function abrirVisita(agora: number = Date.now()): VisitaAberta {
  const lida = lerUltimaVisita();
  let aviso = lida.aviso;
  try {
    localStorage.setItem(chaveVisita(), String(agora));
  } catch {
    aviso = aviso ?? "Não consegui gravar esta visita no navegador; a próxima abertura pode repetir o período.";
  }
  if (lida.ms === null) {
    return { desde: agora - JANELA_PRIMEIRA_VEZ_MS, primeiraVez: true, aviso };
  }
  return { desde: lida.ms, primeiraVez: false, aviso };
}

/**
 * Lê do Supabase, só leitura, tudo que aconteceu desde `desde` (ms).
 * Cada fonte é lida à parte: se uma falhar, as outras aparecem e o aviso diz qual.
 */
export async function carregarLinhaDoTempo(desde: number): Promise<ResultadoLinhaDoTempo> {
  const itens: ItemLinhaDoTempo[] = [];
  const avisos: string[] = [];
  const corte = new Date(desde).toISOString();

  let userId: string | undefined;
  try {
    const { data } = await supabase.auth.getSession();
    userId = data.session?.user.id;
  } catch {
    userId = undefined;
  }
  if (!userId) {
    return { itens, avisos: ["Sem sessão: a linha do tempo não pode ser lida agora."] };
  }

  // 1. Pesquisas (tabela pesquisas)
  try {
    const { data, error } = await supabase
      .from("pesquisas")
      .select("id, tema, aprendido, site, created_at")
      .eq("user_id", userId)
      .gte("created_at", corte)
      .order("created_at", { ascending: false })
      .limit(LIMITE_ITENS);
    if (error) throw new Error(error.message);
    for (const p of data ?? []) {
      const quando = ms(p.created_at);
      if (Number.isNaN(quando)) continue;
      const partes = [resumir(p.aprendido, 160), p.site ? `Fonte: ${resumir(p.site, 60)}` : ""].filter(Boolean);
      itens.push({
        quando,
        tipo: "pesquisa",
        titulo: `Pesquisou sobre ${resumir(p.tema, 120)}`,
        detalhe: partes.join(" · "),
      });
    }
  } catch (e) {
    avisos.push("Pesquisas indisponíveis agora: " + (e instanceof Error ? e.message : String(e)));
  }

  // 2. Lições do refletor (grafo_nos tipo 'licao')
  try {
    const { data, error } = await supabase
      .from("grafo_nos")
      .select("id, label, created_at")
      .eq("user_id", userId)
      .eq("tipo", "licao")
      .gte("created_at", corte)
      .order("created_at", { ascending: false })
      .limit(LIMITE_ITENS);
    if (error) throw new Error(error.message);
    for (const n of data ?? []) {
      const quando = ms(n.created_at);
      if (Number.isNaN(quando)) continue;
      itens.push({
        quando,
        tipo: "licao",
        titulo: "Nova lição",
        detalhe: resumir(n.label, 200),
      });
    }
  } catch (e) {
    avisos.push("Lições indisponíveis agora: " + (e instanceof Error ? e.message : String(e)));
  }

  // 3. Comentários diários sobre notícia de IA (grafo_nos tipo 'aprendido', id 'comentario-ia-AAAA-MM-DD').
  // Não entram aqui os demais nós 'aprendido' (são cópias de pesquisas).
  try {
    const { data, error } = await supabase
      .from("grafo_nos")
      .select("id, label, created_at")
      .eq("user_id", userId)
      .eq("tipo", "aprendido")
      .like("id", "comentario-ia-%")
      .gte("created_at", corte)
      .order("created_at", { ascending: false })
      .limit(LIMITE_ITENS);
    if (error) throw new Error(error.message);
    for (const c of data ?? []) {
      const quando = ms(c.created_at);
      if (Number.isNaN(quando)) continue;
      // O label traz o comentário e, depois de "Notícia:", o título e o link: fica só o comentário
      const texto = String(c.label ?? "")
        .replace(/^[^:]*:\s*/, "")
        .split(" Notícia:")[0];
      itens.push({
        quando,
        tipo: "atividade",
        titulo: "Comentário do dia sobre notícia de IA",
        detalhe: resumir(texto, 200),
      });
    }
  } catch (e) {
    avisos.push("Comentários do dia indisponíveis agora: " + (e instanceof Error ? e.message : String(e)));
  }

  // 4. Vida. A tabela eventos (tipo 'vida') é o histórico, se existir e tiver registros.
  // Sem histórico, usa só o último estado da tabela vida (sem eventos de vida no banco).
  let temHistoricoVida = false;
  try {
    const { data, error } = await supabase
      .from("eventos")
      .select("detalhes, ocorrido_em")
      .eq("user_id", userId)
      .eq("tipo", "vida")
      .gte("ocorrido_em", corte)
      .order("ocorrido_em", { ascending: false })
      .limit(LIMITE_ITENS);
    if (error) {
      // Tabela ausente: segue para o último estado da vida
      if (error.code !== "42P01" && error.code !== "PGRST205") throw new Error(error.message);
    } else {
      for (const v of data ?? []) {
        const quando = ms(v.ocorrido_em);
        if (Number.isNaN(quando)) continue;
        temHistoricoVida = true;
        const d = (v.detalhes ?? {}) as Record<string, unknown>;
        itens.push({
          quando,
          tipo: "vida",
          titulo: "Estado da Lia",
          detalhe: `Capítulo ${Number(d.capitulo ?? 1)} · XP ${Number(d.xp ?? 0)}`,
        });
      }
    }
  } catch (e) {
    avisos.push("Vida indisponível agora: " + (e instanceof Error ? e.message : String(e)));
  }

  if (!temHistoricoVida) {
    try {
      const { data, error } = await supabase
        .from("vida")
        .select("updated_at, xp, chapter")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const quando = ms(data?.updated_at);
      if (data && !Number.isNaN(quando) && quando >= desde) {
        itens.push({
          quando,
          tipo: "vida",
          titulo: "Último estado da Lia salvo",
          detalhe: `Capítulo ${Number(data.chapter ?? 1)} · XP ${Number(data.xp ?? 0)} (estado atual, sem histórico de eventos de vida)`,
        });
      }
    } catch (e) {
      avisos.push("Vida indisponível agora: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  itens.sort((a, b) => b.quando - a.quando);
  return { itens: itens.slice(0, LIMITE_ITENS), avisos };
}
