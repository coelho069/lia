// Ciclo contínuo de pesquisa da Lia na Wikipedia (pt).
// Fila de temas: nunca repete um tema de TODO o histórico já pesquisado
// (sessão atual + tudo que já foi salvo), igual ao currículo automático do
// Voyager e às listas de ideias já usadas do IDEAgent. O histórico completo
// (histórico()) já é lido do Supabase sem limite de janela (ver
// loadResearchesFromSupabase em src/supabase-persistence.ts, paginado até
// LIMITE_HISTORICO_PESQUISAS) e mantido em memória pelo App.tsx; por isso a
// fila só precisa comparar contra o array recebido, sem reconsultar o banco.

// Temas de reserva: usados só se o sorteio da Wikipedia falhar (ex.: sem internet).
export const TEMAS_RESERVA = [
  "Brasil", "Japão", "Egito", "França", "Astronomia", "Dinossauros", "Música",
  "Pintura", "Culinária", "Esportes", "Vulcão", "Oceano", "Floresta amazônica",
  "Relógio", "Bicicleta", "Chocolate", "Abelha", "Lua", "Trem", "Violino",
  "Arquitetura", "Cogumelo", "Tartaruga", "Montanha", "Café", "Xadrez",
  "Cinema", "Papel", "Lago", "Mapa",
];

export type ResultadoPesquisa = {
  tema: string;
  resumo: string;
  link: string;
};

export function normalizarTema(tema: string): string {
  return tema.trim().toLowerCase();
}

// Sorteia artigos reais da Wikipedia pt, usados como novos temas.
export async function sortearTemas(quantidade = 10): Promise<string[]> {
  const url =
    "https://pt.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0" +
    `&rnlimit=${quantidade}&format=json&origin=*`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Falha ao sortear temas");
  const data = await res.json();
  return (data.query?.random ?? []).map((r: { title: string }) => r.title);
}

// Resumo do artigo na Wikipedia pt (o que a Lia "aprendeu").
export async function buscarResumo(tema: string): Promise<ResultadoPesquisa> {
  const slug = encodeURIComponent(tema.replace(/ /g, "_"));
  const res = await fetch(`https://pt.wikipedia.org/api/rest_v1/page/summary/${slug}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Wikipedia respondeu ${res.status}`);
  const data = await res.json();
  if (data.type === "disambiguation" || !data.extract) {
    throw new Error("Página sem resumo utilizável");
  }
  return {
    tema: data.title ?? tema,
    resumo: data.extract,
    link:
      data.content_urls?.desktop?.page ??
      `https://pt.wikipedia.org/wiki/${slug}`,
  };
}

/**
 * Fila de temas. Nunca devolve um tema que já esteja em TODO o histórico
 * (sessão atual + histórico já salvo, sem janela). Quando a fila esvazia,
 * sorteia temas novos sozinha.
 */
export class FilaDeTemas {
  private fila: string[] = [];
  // Normalizados, escolhidos nesta sessão (inclusive antes de salvos no Supabase,
  // por isso ficam fora de `historico()` até o salvamento terminar). Sem limite de
  // tamanho: a sessão de uma aba não chega a ser um problema de memória.
  private recentes = new Set<string>();
  private historico: () => string[];

  constructor(historico: () => string[]) {
    this.historico = historico;
  }

  private jaPesquisado(tema: string): boolean {
    const n = normalizarTema(tema);
    if (this.recentes.has(n)) return true;
    return this.historico().some((t) => normalizarTema(t) === n);
  }

  // Marca um tema como pesquisado (ou tentado), para não repetir logo depois.
  registrar(tema: string): void {
    this.recentes.add(normalizarTema(tema));
  }

  private async reabastecer(): Promise<void> {
    let novos: string[] = [];
    try {
      novos = await sortearTemas(10);
    } catch {
      // sem internet: usa os temas de reserva
    }
    if (novos.length === 0) {
      novos = [...TEMAS_RESERVA].sort(() => Math.random() - 0.5);
    }
    for (const t of novos) {
      if (!this.jaPesquisado(t) && !this.fila.includes(t)) this.fila.push(t);
    }
  }

  async proximo(): Promise<string> {
    // Limite de tentativas: evita laço infinito se tudo já foi pesquisado.
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      while (this.fila.length > 0) {
        const tema = this.fila.shift()!;
        if (!this.jaPesquisado(tema)) return tema;
      }
      await this.reabastecer();
    }
    throw new Error("Sem tema novo disponível");
  }
}
