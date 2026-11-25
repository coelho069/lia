// Diário da Lia no Supabase (tabela `eventos`).
// Supabase é a fonte da verdade. A fila local (localStorage) só guarda eventos
// que ainda não chegaram ao banco, e é esvaziada quando o upsert dá certo.
// Tudo é upsert por id: reenviar um evento nunca cria linha duplicada.
import { supabase } from "./supabase";
import { safeId } from "./utils/safeId";

export type TipoEvento =
  | "pesquisa" | "chat" | "vida" | "decisao" | "movimento" | "grafo" | "erro" | "login";

export type Evento = {
  id: string;
  tipo: TipoEvento;
  titulo: string;
  detalhes: Record<string, unknown>;
  ocorridoEm: string; // ISO, data e hora de quando aconteceu
};

const FILA_KEY = "lia-fila-eventos";
const LIMITE_MS = 5000;
const MAX_FILA = 2000;

let tabelaAusente = false;
let enviando = false;

export function tabelaEventosAusente(): boolean {
  return tabelaAusente;
}

export function tamanhoFila(): number {
  return lerFila().length;
}

function lerFila(): Evento[] {
  try {
    const v = JSON.parse(localStorage.getItem(FILA_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function gravarFila(fila: Evento[]): void {
  try {
    localStorage.setItem(FILA_KEY, JSON.stringify(fila.slice(-MAX_FILA)));
  } catch {
    // localStorage cheio: o evento segue na memória até o próximo envio
  }
}

// Tempo limite de 5 s: nunca segura a tela esperando o Supabase
function comLimite<T>(p: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error("eventos: sem resposta em 5 s")), LIMITE_MS);
  });
  return Promise.race([Promise.resolve(p), limite]).finally(() => clearTimeout(timer));
}

// Registra um evento: entra na fila local e é enviado em segundo plano.
export function registrarEvento(
  tipo: TipoEvento,
  titulo: string,
  detalhes: Record<string, unknown> = {},
): void {
  const evento: Evento = {
    id: safeId(),
    tipo,
    titulo: titulo.slice(0, 300),
    detalhes,
    ocorridoEm: new Date().toISOString(),
  };
  gravarFila([...lerFila(), evento]);
  void enviarFila();
}

// Envia a fila ao Supabase. Se falhar, os eventos ficam na fila para a próxima tentativa.
export async function enviarFila(): Promise<void> {
  if (enviando) return;
  const fila = lerFila();
  if (fila.length === 0) return;
  enviando = true;
  try {
    const { data } = await comLimite(supabase.auth.getSession());
    const userId = data.session?.user.id;
    if (!userId) return; // sem sessão: fica na fila
    const linhas = fila.map((e) => ({
      id: e.id,
      user_id: userId,
      tipo: e.tipo,
      titulo: e.titulo,
      detalhes: e.detalhes,
      ocorrido_em: e.ocorridoEm,
    }));
    const { error } = await comLimite(supabase.from("eventos").upsert(linhas, { onConflict: "id" }));
    if (error) {
      // Tabela ainda não criada no Supabase (rodar supabase-evolucao.sql)
      if (error.code === "42P01" || error.code === "PGRST205") tabelaAusente = true;
      throw new Error(error.message);
    }
    tabelaAusente = false;
    const enviados = new Set(fila.map((e) => e.id));
    gravarFila(lerFila().filter((e) => !enviados.has(e.id)));
  } catch (e) {
    console.warn("[eventos] guardado na fila local, envio tenta de novo:", e instanceof Error ? e.message : e);
  } finally {
    enviando = false;
  }
}

// Liga o envio periódico e ao fechar/esconder a aba. Devolve a função de limpeza.
export function iniciarEnvioEventos(): () => void {
  const timer = setInterval(() => void enviarFila(), 10000);
  const aoEsconder = () => {
    if (document.visibilityState === "hidden") void enviarFila();
  };
  document.addEventListener("visibilitychange", aoEsconder);
  window.addEventListener("online", () => void enviarFila());
  void enviarFila();
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", aoEsconder);
  };
}

// Lê do Supabase (não do localStorage), do mais recente para o mais antigo.
export async function lerEventos(limite = 300): Promise<Evento[]> {
  const { data: s } = await comLimite(supabase.auth.getSession());
  const userId = s.session?.user.id;
  if (!userId) return [];
  const { data, error } = await comLimite(
    supabase
      .from("eventos")
      .select("id, tipo, titulo, detalhes, ocorrido_em")
      .eq("user_id", userId)
      .order("ocorrido_em", { ascending: false })
      .limit(limite),
  );
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    tipo: r.tipo as TipoEvento,
    titulo: r.titulo,
    detalhes: (r.detalhes ?? {}) as Record<string, unknown>,
    ocorridoEm: r.ocorrido_em,
  }));
}

// Totais para a aba Evolução: contagem no banco, com filtro por tipo.
export async function contarEventos(tipo: TipoEvento, extra?: [string, string]): Promise<number> {
  const { data: s } = await comLimite(supabase.auth.getSession());
  const userId = s.session?.user.id;
  if (!userId) return 0;
  let q = supabase.from("eventos").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("tipo", tipo);
  if (extra) q = q.eq(extra[0], extra[1]);
  const { count, error } = await comLimite(q);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// Último evento de vida: traz XP e capítulo atuais.
export async function ultimaVida(): Promise<Record<string, unknown> | null> {
  const { data: s } = await comLimite(supabase.auth.getSession());
  const userId = s.session?.user.id;
  if (!userId) return null;
  const { data, error } = await comLimite(
    supabase.from("eventos").select("detalhes").eq("user_id", userId).eq("tipo", "vida")
      .order("ocorrido_em", { ascending: false }).limit(1),
  );
  if (error) throw new Error(error.message);
  return (data?.[0]?.detalhes as Record<string, unknown>) ?? null;
}
