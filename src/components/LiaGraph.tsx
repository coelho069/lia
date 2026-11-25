import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { ResearchTopic } from "../types";
import { carregarGrafoSupabase, type DadosGrafo, type NoGrafo } from "../grafo-dados";

// Desenha o grafo REAL do Supabase (grafo_nos + grafo_arestas), sem nós inventados.
// A lista de pesquisas só serve de gatilho para recarregar (nova pesquisa = novo cluster).
// O layout usa a largura real do contêiner: no celular fica uma coluna de clusters, no desktop várias.
// Rótulos não ficam fixos: aparecem só no nó ou na ligação em foco (mouse ou toque).

type NoDesenhado = { id: string; label: string; tipo: string; pesquisaId: string | null; x: number; y: number };
type ArestaDesenhada = { id: string; from: string; to: string; ligacao: string; tipoAlvo: string };
type Layout = { nos: NoDesenhado[]; arestas: ArestaDesenhada[]; altura: number };
type Foco = { kind: "no" | "aresta"; id: string } | null;

const CORES: Record<string, string> = {
  tema: "#7c3aed",
  fonte: "#2563eb",
  aprendido: "#059669",
  licao: "#d97706",
};
const NOMES: Record<string, string> = { tema: "Tema", fonte: "Fonte", aprendido: "Aprendido", licao: "Lição" };
const ORDEM_TIPO = ["tema", "fonte", "aprendido", "licao"];

const RAIO = 20; // bolinha visível
const RAIO_TOQUE = 24; // área de toque (48 px de diâmetro)
const CARTAO = 240; // largura de cada cluster (uma pesquisa)
const ESPACO = 16; // entre clusters, na horizontal
const ESPACO_V = 28; // entre linhas de clusters
const PASSO_X = 96; // distância horizontal entre nós irmãos
const PASSO_Y = 76; // distância vertical entre linhas de nós
const TOPO = 56; // folga para o balão acima do primeiro nó
const CABECALHO = 40; // do topo do cluster até o tema
const POR_LINHA = 3;
const CARACTERE_PX = 6.6; // largura média aproximada de um caractere a 12 px

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.5;
const ATUALIZA_MS = 15000; // as lições chegam depois da pesquisa, então recarrega de tempos em tempos

function ordemTipo(t: string): number {
  const i = ORDEM_TIPO.indexOf(t);
  return i === -1 ? 99 : i;
}

// Quebra o texto completo em linhas (usado no balão de foco, sem cortar o rótulo sem necessidade)
function quebrar(texto: string, porLinha: number, maxLinhas: number): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const teste = atual ? `${atual} ${p}` : p;
    if (teste.length > porLinha && atual) {
      linhas.push(atual);
      atual = p;
    } else {
      atual = teste;
    }
  }
  if (atual) linhas.push(atual);
  if (linhas.length > maxLinhas) {
    const cortadas = linhas.slice(0, maxLinhas);
    cortadas[maxLinhas - 1] = cortadas[maxLinhas - 1].slice(0, porLinha - 1).trimEnd() + "…";
    return cortadas;
  }
  return linhas.length > 0 ? linhas : ["Sem nome"];
}

function montarLayout(dados: DadosGrafo, larguraTela: number): Layout {
  const largura = Math.max(280, larguraTela);
  const margem = largura < 480 ? 12 : 24;
  const util = largura - margem * 2;
  const colunas = Math.max(1, Math.floor((util + ESPACO) / (CARTAO + ESPACO)));

  // Um cluster por pesquisa (ordem de aparição); nós sem pesquisa formam o cluster "sem-pesquisa"
  const grupos = new Map<string, NoGrafo[]>();
  for (const n of dados.nos) {
    const chave = n.pesquisaId ?? "sem-pesquisa";
    const lista = grupos.get(chave) ?? [];
    lista.push(n);
    grupos.set(chave, lista);
  }

  type Cluster = { tema: NoGrafo | null; filhos: NoGrafo[]; altura: number; yFilhos: number };
  const clusters: Cluster[] = [...grupos.values()].map((ns) => {
    const ordenados = [...ns].sort((a, b) => ordemTipo(a.tipo) - ordemTipo(b.tipo));
    const tema = ordenados.find((n) => n.tipo === "tema") ?? null;
    const filhos = ordenados.filter((n) => n !== tema);
    const yFilhos = CABECALHO + (tema ? PASSO_Y : 0);
    const linhas = Math.ceil(filhos.length / POR_LINHA);
    const altura = linhas > 0 ? yFilhos + (linhas - 1) * PASSO_Y + 36 : CABECALHO + 36;
    return { tema, filhos, altura, yFilhos };
  });

  // Altura de cada linha de clusters = a maior altura entre os clusters dela
  const alturasLinha: number[] = [];
  clusters.forEach((c, i) => {
    const r = Math.floor(i / colunas);
    alturasLinha[r] = Math.max(alturasLinha[r] ?? 0, c.altura);
  });
  const topoLinha: number[] = [];
  let y = TOPO;
  alturasLinha.forEach((h, r) => {
    topoLinha[r] = y;
    y += h + ESPACO_V;
  });
  const alturaTotal = y - ESPACO_V + 24;

  const colsUsadas = Math.min(colunas, clusters.length);
  const larguraConteudo = colsUsadas * CARTAO + (colsUsadas - 1) * ESPACO;
  const deslocX = margem + Math.max(0, (util - larguraConteudo) / 2);

  const nos: NoDesenhado[] = [];
  const posicao = new Map<string, { x: number; y: number }>();
  const colocar = (n: NoGrafo, x: number, yNo: number) => {
    nos.push({ id: n.id, label: n.label, tipo: n.tipo, pesquisaId: n.pesquisaId, x, y: yNo });
    posicao.set(n.id, { x, y: yNo });
  };

  clusters.forEach((c, i) => {
    const r = Math.floor(i / colunas);
    const col = i % colunas;
    const cx = deslocX + col * (CARTAO + ESPACO) + CARTAO / 2;
    const yBase = topoLinha[r];
    if (c.tema) colocar(c.tema, cx, yBase + CABECALHO);
    c.filhos.forEach((n, j) => {
      const linha = Math.floor(j / POR_LINHA);
      const naLinha = Math.min(POR_LINHA, c.filhos.length - linha * POR_LINHA);
      const posNaLinha = j - linha * POR_LINHA;
      const x = cx + (posNaLinha - (naLinha - 1) / 2) * PASSO_X;
      colocar(n, x, yBase + c.yFilhos + linha * PASSO_Y);
    });
  });

  // Só arestas reais: origem e destino já foram checados em carregarGrafoSupabase
  const arestas: ArestaDesenhada[] = dados.arestas
    .filter((a) => posicao.has(a.origem) && posicao.has(a.destino))
    .map((a) => {
      const partes = a.ligacao.split("-");
      return {
        id: a.id,
        from: a.origem,
        to: a.destino,
        ligacao: a.ligacao,
        tipoAlvo: partes.find((p) => p !== "tema") ?? partes[0] ?? "",
      };
    });

  return { nos, arestas, altura: alturaTotal };
}

export function LiaGraph({
  pesquisas,
  onAbrirPesquisa,
}: {
  pesquisas: ResearchTopic[];
  onAbrirPesquisa: (pesquisaId: string) => void;
}) {
  const [dados, setDados] = useState<DadosGrafo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [medida, setMedida] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [foco, setFoco] = useState<Foco>(null);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const arrasteRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const arrastouRef = useRef(false); // true se o gesto virou arrasto (então não é toque em nó)

  const carregar = useCallback(async () => {
    try {
      const g = await carregarGrafoSupabase();
      if (g === null) throw new Error("sem sessão do Supabase");
      setDados(g);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Carrega ao entrar, quando a lista de pesquisas muda e a cada 15 s enquanto a aba estiver aberta
  useEffect(() => {
    void carregar();
    const timer = setInterval(() => void carregar(), ATUALIZA_MS);
    return () => clearInterval(timer);
  }, [carregar, pesquisas.length, pesquisas[0]?.id]);

  // Mede a largura real do contêiner (o wrapper sempre existe, mesmo durante o carregamento)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const medir = () => setMedida(el.clientWidth);
    medir();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", medir);
      return () => window.removeEventListener("resize", medir);
    }
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const largura = medida > 0 ? medida : 320;
  const layout = useMemo(
    () => (dados && dados.nos.length > 0 ? montarLayout(dados, largura) : null),
    [dados, largura],
  );
  const porId = useMemo(() => new Map((layout?.nos ?? []).map((n) => [n.id, n])), [layout]);

  // Altura da janela: cabe o grafo até 560 px; acima disso, arrasta para ver o resto
  const altoJanela = layout ? Math.min(Math.max(layout.altura, 300), 560) : 300;
  const alturaConteudo = layout?.altura ?? altoJanela;

  // Pan limitado para não perder o grafo de vista
  const limitar = (x: number, y: number, kk: number) => ({
    x: Math.min(0, Math.max(Math.min(0, largura * (1 - kk)), x)),
    y: Math.min(0, Math.max(Math.min(0, altoJanela - alturaConteudo * kk), y)),
  });
  const { x: px, y: py } = limitar(pan.x, pan.y, zoom);

  const aplicarZoom = (novo: number) => {
    const kNovo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, novo));
    // Mantém o centro da janela parado enquanto muda o zoom
    const mundoX = (largura / 2 - px) / zoom;
    const mundoY = (altoJanela / 2 - py) / zoom;
    const proximo = limitar(largura / 2 - mundoX * kNovo, altoJanela / 2 - mundoY * kNovo, kNovo);
    setPan(proximo);
    setZoom(kNovo);
  };

  const aoApertarFundo = (e: ReactPointerEvent<SVGSVGElement>) => {
    arrastouRef.current = false;
    arrasteRef.current = { x: e.clientX, y: e.clientY, px, py };
  };
  const aoMoverFundo = (e: ReactPointerEvent<SVGSVGElement>) => {
    const a = arrasteRef.current;
    if (!a) return;
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    if (!arrastouRef.current) {
      if (Math.hypot(dx, dy) < 6) return; // tolerância para não confundir toque com arrasto
      arrastouRef.current = true;
      svgRef.current?.setPointerCapture(e.pointerId);
    }
    setPan(limitar(a.px + dx, a.py + dy, zoom));
  };
  const aoSoltarFundo = () => {
    arrasteRef.current = null;
  };

  const ativarNo = (n: NoDesenhado) => {
    if (arrastouRef.current) return;
    setFoco({ kind: "no", id: n.id });
    if (n.pesquisaId) onAbrirPesquisa(n.pesquisaId);
  };
  const ativarAresta = (id: string) => {
    if (arrastouRef.current) return;
    setFoco({ kind: "aresta", id });
  };

  // Quem fica em destaque: o nó (com suas ligações) ou a ligação (com seus dois nós)
  const idsNosFoco = new Set<string>();
  const idsArestasFoco = new Set<string>();
  if (layout && foco) {
    if (foco.kind === "no") {
      idsNosFoco.add(foco.id);
      for (const a of layout.arestas) {
        if (a.from === foco.id || a.to === foco.id) {
          idsArestasFoco.add(a.id);
          idsNosFoco.add(a.from);
          idsNosFoco.add(a.to);
        }
      }
    } else {
      const a = layout.arestas.find((x) => x.id === foco.id);
      if (a) {
        idsArestasFoco.add(a.id);
        idsNosFoco.add(a.from);
        idsNosFoco.add(a.to);
      }
    }
  }
  const temFoco = idsNosFoco.size > 0;

  // Balão com o texto completo do nó ou da ligação em foco
  const renderBalao = () => {
    if (!layout || !foco) return null;
    if (foco.kind === "no") {
      const n = porId.get(foco.id);
      if (!n) return null;
      const linhas = quebrar(n.label, 34, 3);
      const tipoNome = NOMES[n.tipo] ?? n.tipo;
      const sub = n.pesquisaId ? `${tipoNome} · abre a pesquisa` : `${tipoNome} · sem pesquisa`;
      const maxLen = Math.max(sub.length, ...linhas.map((l) => l.length));
      const bw = Math.min(260, maxLen * CARACTERE_PX + 20);
      const bh = linhas.length * 15 + 29;
      let topo = n.y - RAIO_TOQUE - 10 - bh;
      if (topo < 4) topo = n.y + RAIO_TOQUE + 10;
      const bx = Math.min(Math.max(n.x - bw / 2, 4), largura - bw - 4);
      return (
        <g pointerEvents="none">
          <rect x={bx} y={topo} width={bw} height={bh} rx={8} fill="#fff" stroke="#7c3aed" strokeWidth={1} />
          {linhas.map((l, i) => (
            <text key={i} x={bx + 10} y={topo + 20 + i * 15} fontSize={12} fontWeight={600} fill="#1a1a2e">
              {l}
            </text>
          ))}
          <text x={bx + 10} y={topo + 19 + linhas.length * 15} fontSize={11} fill="#7c3aed">
            {sub}
          </text>
        </g>
      );
    }
    const a = layout.arestas.find((x) => x.id === foco.id);
    const de = a ? porId.get(a.from) : undefined;
    const para = a ? porId.get(a.to) : undefined;
    if (!a || !de || !para) return null;
    const partes = a.ligacao.split("-").map((p) => NOMES[p] ?? p);
    const texto = partes.join(" ↔ ");
    const pw = texto.length * CARACTERE_PX + 20;
    const mx = (de.x + para.x) / 2;
    const my = (de.y + para.y) / 2;
    return (
      <g pointerEvents="none">
        <rect x={mx - pw / 2} y={my - 11} width={pw} height={22} rx={11} fill="#fff" stroke="#7c3aed" strokeWidth={1} />
        <text x={mx} y={my + 4} textAnchor="middle" fontSize={12} fontWeight={600} fill="#1a1a2e">
          {texto}
        </text>
      </g>
    );
  };

  let conteudo: ReactNode;
  if (dados === null && erro === null) {
    conteudo = <p style={{ color: "#666", fontSize: 15, margin: 16 }}>Carregando o grafo do Supabase...</p>;
  } else if (dados === null) {
    conteudo = (
      <div style={{ margin: 16, color: "#666", fontSize: 15 }}>
        <p style={{ margin: 0 }}>Não consegui ler o grafo do Supabase: {erro}.</p>
        <button type="button" onClick={() => void carregar()} style={{ marginTop: 8, minHeight: 40, padding: "0 12px", cursor: "pointer" }}>
          Tentar de novo
        </button>
      </div>
    );
  } else if (!layout) {
    conteudo = (
      <p style={{ color: "#666", fontSize: 15, margin: 16 }}>
        O grafo ainda não tem nós. Pesquisas aparecem aqui assim que a Lia fizer uma.
      </p>
    );
  } else {
    const botao: CSSProperties = {
      minWidth: 44,
      height: 40,
      padding: "0 12px",
      border: "1px solid #ddd",
      borderRadius: 8,
      background: "#fff",
      color: "#1a1a2e",
      fontSize: 16,
      cursor: "pointer",
    };
    conteudo = (
      <>
        {erro !== null && (
          <p style={{ color: "#b45309", fontSize: 13, padding: "8px 12px", margin: 0 }}>
            Não consegui atualizar o grafo agora ({erro}). Mostrando a última leitura.
          </p>
        )}

        {/* Legenda pequena no topo */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "6px 14px",
            padding: "8px 12px",
            fontSize: 12,
            color: "#555",
            borderBottom: "1px solid #eee",
          }}
        >
          {ORDEM_TIPO.map((t) => (
            <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: CORES[t], display: "inline-block" }} />
              {NOMES[t]}
            </span>
          ))}
          <span>· cor da ligação = tipo ligado ao tema · tracejada = lição</span>
        </div>

        <svg
          ref={svgRef}
          width="100%"
          height={altoJanela}
          viewBox={`0 0 ${largura} ${altoJanela}`}
          style={{ display: "block", background: "#fdfdfd", touchAction: "none", userSelect: "none", cursor: "grab" }}
          onPointerDown={aoApertarFundo}
          onPointerMove={aoMoverFundo}
          onPointerUp={aoSoltarFundo}
          onPointerCancel={aoSoltarFundo}
          onPointerLeave={aoSoltarFundo}
          onClick={() => {
            if (!arrastouRef.current) setFoco(null);
          }}
        >
          <g transform={`translate(${px},${py}) scale(${zoom})`}>
            {/* Ligações (a área transparente e mais larga facilita o toque) */}
            {layout.arestas.map((a) => {
              const de = porId.get(a.from);
              const para = porId.get(a.to);
              if (!de || !para) return null;
              const cor = CORES[a.tipoAlvo] ?? "#9e9e9e";
              const ativa = idsArestasFoco.has(a.id);
              const apagada = temFoco && !ativa;
              return (
                <g key={a.id}>
                  <line
                    x1={de.x}
                    y1={de.y}
                    x2={para.x}
                    y2={para.y}
                    stroke={cor}
                    strokeWidth={ativa ? 3.5 : 2}
                    strokeDasharray={a.tipoAlvo === "licao" ? "6 4" : undefined}
                    opacity={apagada ? 0.2 : 1}
                    pointerEvents="none"
                  />
                  <line
                    x1={de.x}
                    y1={de.y}
                    x2={para.x}
                    y2={para.y}
                    stroke="transparent"
                    strokeWidth={18}
                    style={{ cursor: "pointer" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      ativarAresta(a.id);
                    }}
                    onPointerEnter={(e) => {
                      if (e.pointerType === "mouse") setFoco({ kind: "aresta", id: a.id });
                    }}
                    onPointerLeave={(e) => {
                      if (e.pointerType === "mouse") setFoco((f) => (f?.id === a.id ? null : f));
                    }}
                  />
                </g>
              );
            })}

            {/* Nós: sem texto fixo; o nome aparece no balão de foco */}
            {layout.nos.map((n) => {
              const cor = CORES[n.tipo] ?? "#6b7280";
              const ativo = foco?.kind === "no" && foco.id === n.id;
              const apagado = temFoco && !idsNosFoco.has(n.id);
              const tocavel = n.pesquisaId !== null;
              return (
                <g
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${NOMES[n.tipo] ?? n.tipo}: ${n.label}`}
                  transform={`translate(${n.x},${n.y})`}
                  opacity={apagado ? 0.3 : 1}
                  style={{ cursor: tocavel ? "pointer" : "default", outline: "none" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    ativarNo(n);
                  }}
                  onKeyDown={(e: ReactKeyboardEvent<SVGGElement>) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      ativarNo(n);
                    }
                  }}
                  onPointerEnter={(e) => {
                    if (e.pointerType === "mouse") setFoco({ kind: "no", id: n.id });
                  }}
                  onPointerLeave={(e) => {
                    if (e.pointerType === "mouse") setFoco((f) => (f?.id === n.id ? null : f));
                  }}
                >
                  <circle r={RAIO_TOQUE} fill="transparent" />
                  {ativo && <circle r={RAIO + 5} fill="none" stroke={cor} strokeWidth={2} opacity={0.35} />}
                  <circle r={RAIO} fill={cor} stroke="#fff" strokeWidth={2} />
                  <title>{n.label}</title>
                </g>
              );
            })}

            {renderBalao()}
          </g>
        </svg>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            padding: "8px 12px",
            fontSize: 12,
            color: "#555",
            borderTop: "1px solid #eee",
          }}
        >
          <span style={{ flex: "1 1 220px" }}>
            Toque ou passe o mouse num nó ou ligação para ver o nome. Toque no nó de uma pesquisa para abrir os detalhes. Arraste para mover.
          </span>
          <span style={{ display: "inline-flex", gap: 6 }}>
            <button type="button" aria-label="Diminuir zoom" style={botao} onClick={() => aplicarZoom(zoom / 1.25)}>
              −
            </button>
            <button type="button" aria-label="Aumentar zoom" style={botao} onClick={() => aplicarZoom(zoom * 1.25)}>
              +
            </button>
            <button
              type="button"
              style={{ ...botao, fontSize: 13 }}
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
                setFoco(null);
              }}
            >
              Ajustar
            </button>
          </span>
        </div>
      </>
    );
  }

  return (
    <div
      ref={wrapRef}
      style={{
        width: "100%",
        boxSizing: "border-box",
        background: "#fff",
        borderRadius: 8,
        border: "1px solid #ddd",
        overflow: "hidden",
        fontFamily: "sans-serif",
      }}
    >
      {conteudo}
    </div>
  );
}
