// Ciclo contínuo de pesquisa da Lia na Wikipedia (pt).
// Fila de temas, janela dos últimos 20 temas e busca de resumo.

export const JANELA_TEMAS_RECENTES = 20;

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
 * Fila de temas. Nunca devolve um tema que esteja entre os últimos 20
 * (sessão atual + histórico já salvo). Quando a fila esvazia, sorteia
 * temas novos sozinha.
 */
export class FilaDeTemas {
  private fila: string[] = [];
  private recentes: string[] = []; // normalizados, mais recente primeiro
  private historico: () => string[];

  constructor(historico: () => string[]) {
    this.historico = historico;
  }

  private jaPesquisado(tema: string): boolean {
    const n = normalizarTema(tema);
    if (this.recentes.includes(n)) return true;
    return this.historico().slice(0, JANELA_TEMAS_RECENTES).some((t) => normalizarTema(t) === n);
  }

  // Marca um tema como pesquisado (ou tentado), para não repetir logo depois.
  registrar(tema: string): void {
    const n = normalizarTema(tema);
    this.recentes = [n, ...this.recentes.filter((t) => t !== n)].slice(0, JANELA_TEMAS_RECENTES);
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
