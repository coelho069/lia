import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  abrirVisita,
  carregarLinhaDoTempo,
  type ItemLinhaDoTempo,
  type TipoItemLinhaDoTempo,
  type VisitaAberta,
} from "../linha-do-tempo";

// Aba "Linha do tempo": o que aconteceu enquanto a pessoa estava fora.
// Só leitura (abrirVisita grava apenas a marca de "última visita" no navegador,
// não no banco). Não muda life.ts, a Lia, o ciclo de pesquisa, o chat ou o login.
//
// Visual: diagrama interativo no modelo do grafo do Obsidian — nós ligados em
// cadeia (um por evento, na ordem cronológica), com zoom/pan de câmera, nó
// arrastável com mola de volta ao repouso, balão ao passar o mouse/tocar,
// painel de detalhe ao clicar e filtro por tipo. O padrão de zoom/pan/balão é
// o mesmo de LiaGraph.tsx; a física da mola e a cadeia cronológica são novas.
//
// A leitura de dados (abrirVisita/carregarLinhaDoTempo) não muda: continua
// devolvendo do mais recente para o mais antigo; aqui só invertemos a ORDEM
// DE EXIBIÇÃO (mais antigo à esquerda, mais recente à direita).

const VISIVEIS_INICIAL = 50; // nós renderizados com física/zoom na primeira tela (entre os 40-60 pedidos)
const POR_PAGINA = 30; // quantos nós "Ver mais no passado" revela por clique

const RAIO = 16; // bolinha visível
const RAIO_TOQUE = 24; // área de toque (48 px de diâmetro, igual ao LiaGraph)
const PASSO_X = 108; // distância horizontal (mundo) entre nós vizinhos na cadeia
const MARGEM_X = 70; // folga antes do nó mais antigo
const ALTO_JANELA = 260; // altura fixa do canvas
const BASE_Y = 142; // centro vertical em repouso
const AMPLITUDE_Y = 38; // ondulação vertical (só estética; a ordem é dada pelo X)
const MARGEM_VIEW = 44; // folga mínima do conteúdo dentro da janela, ao limitar o pan
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const SPRING_SEGUNDOS = 0.7; // tempo até ~99% de volta ao repouso (dentro de 0.5-1 s pedido)
const CARACTERE_PX = 6.6; // largura média de um caractere a 12 px, para dimensionar o balão

const INFO_TIPO: Record<TipoItemLinhaDoTempo, { icone: string; cor: string; rotulo: string }> = {
  pesquisa: { icone: "🔎", cor: "#2563eb", rotulo: "Pesquisa" },
  licao: { icone: "💡", cor: "#d97706", rotulo: "Lição" },
  vida: { icone: "❤", cor: "#dc2626", rotulo: "Vida" },
  atividade: { icone: "📰", cor: "#0d9488", rotulo: "Atividade" },
};
const ORDEM_TIPOS: TipoItemLinhaDoTempo[] = ["pesquisa", "licao", "vida", "atividade"];

type NoDesenhado = { chave: string; item: ItemLinhaDoTempo; restX: number; restY: number };
type Ponto = { x: number; y: number };
type ArrasteNo = { chave: string; moved: boolean; startClientX: number; startClientY: number; startX: number; startY: number };
type ArrasteFundo = { x: number; y: number; px: number; py: number };

function contagem(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function horaMin(ms: number): string {
  const d = new Date(ms);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function diaHora(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  const hhmm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const ddmm = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${hhmm} de ${ddmm}`;
}

function truncar(texto: string, max: number): string {
  return texto.length > max ? texto.slice(0, max - 1).trimEnd() + "…" : texto;
}

function montarResumo(itens: ItemLinhaDoTempo[]): string[] {
  const porTipo: Record<TipoItemLinhaDoTempo, number> = { pesquisa: 0, licao: 0, vida: 0, atividade: 0 };
  for (const it of itens) porTipo[it.tipo] = (porTipo[it.tipo] ?? 0) + 1;
  const partes: string[] = [];
  if (porTipo.pesquisa > 0) partes.push(contagem(porTipo.pesquisa, "pesquisa", "pesquisas"));
  if (porTipo.licao > 0) partes.push(contagem(porTipo.licao, "lição", "lições"));
  if (porTipo.atividade > 0) partes.push(contagem(porTipo.atividade, "atividade", "atividades"));
  if (porTipo.vida > 0) partes.push(contagem(porTipo.vida, "novidade da vida", "novidades da vida"));
  return partes;
}

// Identidade estável de um item (mantém física/foco corretos mesmo quando
// "ver mais no passado" insere itens mais antigos sem recriar os existentes).
function chaveItem(it: ItemLinhaDoTempo): string {
  return `${it.tipo}|${it.quando}|${it.titulo}`;
}

function PainelFoco({ item }: { item: ItemLinhaDoTempo | null }) {
  if (!item) {
    return (
      <div style={{ marginTop: 10, fontSize: 12, color: "#999", fontStyle: "italic" }}>
        Toque ou clique em um nó do diagrama para ver os detalhes.
      </div>
    );
  }
  const info = INFO_TIPO[item.tipo] ?? INFO_TIPO.atividade;
  return (
    <div
      style={{
        marginTop: 10,
        padding: 10,
        background: "white",
        border: `1px solid ${info.cor}40`,
        borderRadius: 8,
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 6 }}>
        <span aria-hidden style={{ fontSize: 15 }}>{info.icone}</span>
        <span style={{ fontWeight: "bold", fontSize: 14, color: "#1a1a2e" }}>{item.titulo}</span>
        <span style={{ fontSize: 11, color: info.cor, fontWeight: "bold", textTransform: "uppercase" }}>
          {info.rotulo}
        </span>
        <span style={{ fontSize: 12, color: "#888" }}>{diaHora(item.quando)}</span>
      </div>
      {item.detalhe && (
        <div style={{ marginTop: 4, fontSize: 13, color: "#444", overflowWrap: "anywhere" }}>{item.detalhe}</div>
      )}
    </div>
  );
}

export function LinhaDoTempo() {
  const visitaRef = useRef<VisitaAberta | null>(null);
  const [visita, setVisita] = useState<VisitaAberta | null>(null);
  const [itens, setItens] = useState<ItemLinhaDoTempo[] | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [visiveis, setVisiveis] = useState(VISIVEIS_INICIAL);
  const [focoChave, setFocoChave] = useState<string | null>(null);
  const [hoverChave, setHoverChave] = useState<string | null>(null);
  const [ocultos, setOcultos] = useState<Set<TipoItemLinhaDoTempo>>(() => new Set());
  const [medida, setMedida] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Ponto>({ x: 0, y: 0 });
  const [, forcarRender] = useState(0);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const posRef = useRef<Map<string, Ponto>>(new Map());
  const arrasteNoRef = useRef<ArrasteNo | null>(null);
  const arrasteFundoRef = useRef<ArrasteFundo | null>(null);
  const arrastouFundoRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const ultimoTempoRef = useRef(0);
  const layoutNosRef = useRef<NoDesenhado[]>([]);
  const cameraProntaRef = useRef(false);

  async function carregar(desde: number) {
    setCarregando(true);
    setErro(null);
    try {
      const resultado = await carregarLinhaDoTempo(desde);
      setItens(resultado.itens);
      setAvisos(resultado.avisos);
      setFocoChave(null);
      setHoverChave(null);
      posRef.current.clear();
      cameraProntaRef.current = false;
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }

  // Abre a visita UMA única vez (grava a marca de "última visita" no navegador) e carrega a lista.
  useEffect(() => {
    if (visitaRef.current) return;
    const v = abrirVisita();
    visitaRef.current = v;
    setVisita(v);
    void carregar(v.desde);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mede a largura real do contêiner, para o zoom/pan usar o tamanho real da tela.
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

  const resumoPartes = itens ? montarResumo(itens) : [];
  const semNovidade = itens !== null && itens.length === 0;
  // itens vem do mais recente para o mais antigo (contrato de carregarLinhaDoTempo, inalterado).
  // visiveisItens = os N mais recentes já revelados; itensCronologicos inverte só a EXIBIÇÃO
  // (mais antigo à esquerda, mais recente à direita).
  const visiveisItens = itens ? itens.slice(0, visiveis) : [];
  const faltam = itens ? itens.length - visiveisItens.length : 0;
  const itensCronologicos = useMemo(() => [...visiveisItens].reverse(), [visiveisItens]);

  // Índice cronológico GLOBAL (0 = mais antigo de todo o `itens` já carregado), estável mesmo
  // quando "ver mais no passado" revela mais itens: a posição de repouso de um nó já visível
  // nunca muda, os novos só aparecem mais à esquerda.
  const indiceGlobalPorChave = useMemo(() => {
    const m = new Map<string, number>();
    if (!itens) return m;
    const n = itens.length;
    itens.forEach((it, i) => m.set(chaveItem(it), n - 1 - i));
    return m;
  }, [itens]);

  const layoutNos: NoDesenhado[] = useMemo(
    () =>
      itensCronologicos.map((item) => {
        const chave = chaveItem(item);
        const g = indiceGlobalPorChave.get(chave) ?? 0;
        return { chave, item, restX: MARGEM_X + g * PASSO_X, restY: BASE_Y + Math.sin(g * 0.7) * AMPLITUDE_Y };
      }),
    [itensCronologicos, indiceGlobalPorChave],
  );
  layoutNosRef.current = layoutNos;

  const porChave = useMemo(() => new Map(layoutNos.map((n) => [n.chave, n])), [layoutNos]);

  // Cadeia de conexão: liga cada nó visível ao próximo nó visível, pulando os ocultados pelo filtro.
  const arestas = useMemo(() => {
    const visiveisNaCadeia = layoutNos.filter((n) => !ocultos.has(n.item.tipo));
    const pares: [NoDesenhado, NoDesenhado][] = [];
    for (let i = 1; i < visiveisNaCadeia.length; i++) pares.push([visiveisNaCadeia[i - 1], visiveisNaCadeia[i]]);
    return pares;
  }, [layoutNos, ocultos]);

  const contentBounds = useMemo(() => {
    if (layoutNos.length === 0) return null;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const n of layoutNos) {
      minX = Math.min(minX, n.restX);
      maxX = Math.max(maxX, n.restX);
    }
    return { minX: minX - RAIO_TOQUE - 10, maxX: maxX + RAIO_TOQUE + 10 };
  }, [layoutNos]);

  const limitar = useCallback(
    (x: number, y: number, k: number): Ponto => {
      if (!contentBounds) return { x, y };
      const contentMinY = BASE_Y - AMPLITUDE_Y - RAIO_TOQUE - 10;
      const contentMaxY = BASE_Y + AMPLITUDE_Y + RAIO_TOQUE + 10;
      const panXa = MARGEM_VIEW - contentBounds.maxX * k;
      const panXb = largura - MARGEM_VIEW - contentBounds.minX * k;
      const panYa = MARGEM_VIEW - contentMaxY * k;
      const panYb = ALTO_JANELA - MARGEM_VIEW - contentMinY * k;
      const xmin = Math.min(panXa, panXb);
      const xmax = Math.max(panXa, panXb);
      const ymin = Math.min(panYa, panYb);
      const ymax = Math.max(panYa, panYb);
      return { x: Math.min(xmax, Math.max(xmin, x)), y: Math.min(ymax, Math.max(ymin, y)) };
    },
    [contentBounds, largura],
  );

  // Câmera inicial (uma vez por carregamento de dados): mostra o nó mais recente à direita,
  // centrado na vertical — não se move de novo quando "ver mais no passado" adiciona nós à esquerda.
  useEffect(() => {
    if (cameraProntaRef.current || !contentBounds || largura <= 0) return;
    const def = limitar(largura - MARGEM_VIEW - contentBounds.maxX, ALTO_JANELA / 2 - BASE_Y, 1);
    setPan(def);
    setZoom(1);
    cameraProntaRef.current = true;
  }, [contentBounds, largura, limitar]);

  const { x: px, y: py } = limitar(pan.x, pan.y, zoom);

  const aplicarZoom = (novo: number) => {
    const kNovo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, novo));
    const mundoX = (largura / 2 - px) / zoom;
    const mundoY = (ALTO_JANELA / 2 - py) / zoom;
    const proximo = limitar(largura / 2 - mundoX * kNovo, ALTO_JANELA / 2 - mundoY * kNovo, kNovo);
    setPan(proximo);
    setZoom(kNovo);
  };

  const reenquadrar = () => {
    if (!contentBounds) return;
    const def = limitar(largura - MARGEM_VIEW - contentBounds.maxX, ALTO_JANELA / 2 - BASE_Y, 1);
    setPan(def);
    setZoom(1);
    setFocoChave(null);
    setHoverChave(null);
  };

  // --- Física da mola: a cada quadro, todo nó que não está sendo arrastado é atraído
  // (easing exponencial, independente da taxa de quadros) de volta à sua posição de repouso.
  // Converge em ~SPRING_SEGUNDOS (0.7 s): dentro da janela de 0.5-1 s pedida.
  const passoFisica = useCallback((agora: number) => {
    const dt = ultimoTempoRef.current ? Math.min(0.05, (agora - ultimoTempoRef.current) / 1000) : 1 / 60;
    ultimoTempoRef.current = agora;
    const k = 1 - Math.pow(0.01, dt / SPRING_SEGUNDOS);
    let movendo = false;
    for (const n of layoutNosRef.current) {
      if (arrasteNoRef.current?.chave === n.chave) continue;
      const atual = posRef.current.get(n.chave);
      if (!atual) {
        posRef.current.set(n.chave, { x: n.restX, y: n.restY });
        continue;
      }
      const nx = atual.x + (n.restX - atual.x) * k;
      const ny = atual.y + (n.restY - atual.y) * k;
      posRef.current.set(n.chave, { x: nx, y: ny });
      if (Math.abs(n.restX - nx) > 0.4 || Math.abs(n.restY - ny) > 0.4) movendo = true;
    }
    forcarRender((t) => t + 1);
    if (movendo || arrasteNoRef.current) {
      rafRef.current = requestAnimationFrame(passoFisica);
    } else {
      rafRef.current = null;
    }
  }, []);

  const garantirFisicaRodando = useCallback(() => {
    if (rafRef.current != null) return;
    ultimoTempoRef.current = 0;
    rafRef.current = requestAnimationFrame(passoFisica);
  }, [passoFisica]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function posAtual(n: NoDesenhado): Ponto {
    return posRef.current.get(n.chave) ?? { x: n.restX, y: n.restY };
  }

  // --- Pan do fundo (arrastar a câmera), mesmo padrão do LiaGraph ---
  const aoApertarFundo = (e: ReactPointerEvent<SVGSVGElement>) => {
    arrastouFundoRef.current = false;
    arrasteFundoRef.current = { x: e.clientX, y: e.clientY, px, py };
  };
  const aoMoverFundo = (e: ReactPointerEvent<SVGSVGElement>) => {
    const a = arrasteFundoRef.current;
    if (!a) return;
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    if (!arrastouFundoRef.current) {
      if (Math.hypot(dx, dy) < 6) return;
      arrastouFundoRef.current = true;
      svgRef.current?.setPointerCapture(e.pointerId);
    }
    setPan(limitar(a.px + dx, a.py + dy, zoom));
  };
  const aoSoltarFundo = () => {
    arrasteFundoRef.current = null;
  };

  // --- Arrastar um nó individual (com mola ao soltar) ---
  const aoApertarNo = (e: ReactPointerEvent<SVGGElement>, n: NoDesenhado) => {
    e.stopPropagation();
    const atual = posAtual(n);
    arrasteNoRef.current = { chave: n.chave, moved: false, startClientX: e.clientX, startClientY: e.clientY, startX: atual.x, startY: atual.y };
    try {
      (e.currentTarget as unknown as Element).setPointerCapture(e.pointerId);
    } catch {
      /* alguns navegadores não suportam captura em <g>; o arrasto ainda funciona pelo pointermove */
    }
    setHoverChave(n.chave); // prévia imediata (cobre o toque no celular)
  };
  const aoMoverNo = (e: ReactPointerEvent<SVGGElement>, n: NoDesenhado) => {
    const d = arrasteNoRef.current;
    if (!d || d.chave !== n.chave) return;
    const dxTela = e.clientX - d.startClientX;
    const dyTela = e.clientY - d.startClientY;
    if (!d.moved) {
      if (Math.hypot(dxTela, dyTela) < 6) return;
      d.moved = true;
    }
    const nx = d.startX + dxTela / zoom;
    const ny = d.startY + dyTela / zoom;
    posRef.current.set(n.chave, { x: nx, y: ny });
    forcarRender((t) => t + 1);
  };
  const aoSoltarNo = (e: ReactPointerEvent<SVGGElement>, n: NoDesenhado) => {
    const d = arrasteNoRef.current;
    if (!d || d.chave !== n.chave) {
      arrasteNoRef.current = null;
      return;
    }
    const moveu = d.moved;
    arrasteNoRef.current = null;
    try {
      (e.currentTarget as unknown as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* ignorado */
    }
    if (!moveu) {
      setFocoChave((v) => (v === n.chave ? null : n.chave));
    }
    if (e.pointerType !== "mouse") {
      setHoverChave((v) => (v === n.chave ? null : v));
    }
    garantirFisicaRodando(); // volta à posição de repouso com mola, se foi arrastado
  };

  const alternarTipo = (tipo: TipoItemLinhaDoTempo) => {
    const estavaVisivel = !ocultos.has(tipo);
    setOcultos((prev) => {
      const next = new Set(prev);
      if (next.has(tipo)) next.delete(tipo);
      else next.add(tipo);
      return next;
    });
    if (estavaVisivel) {
      // o tipo vai ficar oculto: limpa foco/hover se apontavam para um item desse tipo
      setFocoChave((v) => (v && porChave.get(v)?.item.tipo === tipo ? null : v));
      setHoverChave((v) => (v && porChave.get(v)?.item.tipo === tipo ? null : v));
    }
  };

  const chaveFoco = hoverChave ?? focoChave;
  const noFoco = chaveFoco ? porChave.get(chaveFoco) ?? null : null;
  const itemFoco = noFoco ? noFoco.item : null;

  const renderBalao = (): ReactNode => {
    if (!noFoco || ocultos.has(noFoco.item.tipo)) return null;
    const info = INFO_TIPO[noFoco.item.tipo] ?? INFO_TIPO.atividade;
    const p = posAtual(noFoco);
    const texto = `${info.icone} ${truncar(noFoco.item.titulo, 40)}`;
    const sub = `${horaMin(noFoco.item.quando)} · ${info.rotulo}`;
    const bw = Math.min(260, Math.max(texto.length, sub.length) * CARACTERE_PX + 20);
    const bh = 42;
    let topo = p.y - RAIO_TOQUE - 10 - bh;
    if (topo < 4) topo = p.y + RAIO_TOQUE + 10;
    const bx = Math.min(Math.max(p.x - bw / 2, 4), largura - bw - 4);
    return (
      <g pointerEvents="none">
        <rect x={bx} y={topo} width={bw} height={bh} rx={8} fill="#fff" stroke={info.cor} strokeWidth={1} />
        <text x={bx + 10} y={topo + 18} fontSize={12} fontWeight={600} fill="#1a1a2e">
          {texto}
        </text>
        <text x={bx + 10} y={topo + 33} fontSize={11} fill={info.cor}>
          {sub}
        </text>
      </g>
    );
  };

  const botao: CSSProperties = {
    minWidth: 40,
    height: 40,
    padding: "0 12px",
    border: "1px solid #ddd",
    borderRadius: 8,
    background: "#fff",
    color: "#1a1a2e",
    fontSize: 16,
    cursor: "pointer",
  };

  const filtroBotao = (tipo: TipoItemLinhaDoTempo): ReactNode => {
    const info = INFO_TIPO[tipo];
    const visivel = !ocultos.has(tipo);
    return (
      <button
        key={tipo}
        type="button"
        onClick={() => alternarTipo(tipo)}
        aria-pressed={visivel}
        aria-label={`${visivel ? "Ocultar" : "Mostrar"} ${info.rotulo.toLowerCase()}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          minHeight: 36,
          padding: "6px 10px",
          borderRadius: 18,
          border: `1.5px solid ${info.cor}`,
          background: visivel ? info.cor + "1a" : "#f3f3f3",
          color: visivel ? info.cor : "#999",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          opacity: visivel ? 1 : 0.6,
        }}
      >
        <span aria-hidden>{info.icone}</span>
        {info.rotulo}
      </button>
    );
  };

  return (
    <div style={{ maxWidth: "100%", boxSizing: "border-box", overflowWrap: "anywhere" }}>
      <h2 style={{ margin: "0 0 4px 0", fontSize: 20, color: "#1a1a2e" }}>Linha do tempo — enquanto você estava fora</h2>

      {visita?.primeiraVez && (
        <p style={{ margin: "0 0 8px 0", fontSize: 13, color: "#555" }}>
          Primeira vez por aqui: mostrando as últimas 24 horas.
        </p>
      )}

      {erro && (
        <div style={{ marginBottom: 12, padding: 10, background: "#fff3f3", border: "1px solid #e94560", borderRadius: 6, color: "#8a1c2e", fontSize: 13 }}>
          Não consegui ler a linha do tempo: {erro}.
          <button
            type="button"
            onClick={() => visita && void carregar(visita.desde)}
            style={{ marginLeft: 10, padding: "4px 10px", background: "#7c3aed", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}
          >
            Tentar de novo
          </button>
        </div>
      )}

      {carregando && itens === null && !erro && <p style={{ color: "#666" }}>Lendo o que aconteceu desde a sua última visita...</p>}

      {itens !== null && !erro && (
        <>
          {visita && (
            <p style={{ margin: "0 0 12px 0", fontSize: 14, color: "#333" }}>
              {semNovidade
                ? `Nada de novo desde a sua última visita (desde ${diaHora(visita.desde)}).`
                : `Enquanto você esteve fora: ${resumoPartes.join(", ")}, desde ${diaHora(visita.desde)}.`}
            </p>
          )}

          {(visita?.aviso || avisos.length > 0) && (
            <div style={{ marginBottom: 12, fontSize: 12, color: "#888", fontStyle: "italic" }}>
              {visita?.aviso && <div>{visita.aviso}</div>}
              {avisos.map((a, i) => (
                <div key={i}>{a}</div>
              ))}
            </div>
          )}

          {!semNovidade && (
            <div style={{ maxWidth: "100%", boxSizing: "border-box" }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 8 }}>
                {faltam > 0 && (
                  <button
                    type="button"
                    onClick={() => setVisiveis((v) => v + POR_PAGINA)}
                    style={{ padding: "6px 14px", background: "white", color: "#7c3aed", border: "1px solid #7c3aed", borderRadius: 6, cursor: "pointer", fontWeight: "bold", fontSize: 13 }}
                  >
                    ← Ver mais no passado ({Math.min(faltam, POR_PAGINA)} de {faltam})
                  </button>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginLeft: "auto" }}>
                  {ORDEM_TIPOS.map((t) => filtroBotao(t))}
                </div>
              </div>

              {/* Diagrama: canvas SVG com zoom/pan de câmera e nós ligados em cadeia cronológica */}
              <div
                ref={wrapRef}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: "#fff",
                  borderRadius: 10,
                  border: "1px solid #eee",
                  overflow: "hidden",
                }}
              >
                <svg
                  ref={svgRef}
                  width="100%"
                  height={ALTO_JANELA}
                  viewBox={`0 0 ${largura} ${ALTO_JANELA}`}
                  style={{ display: "block", background: "#fdfdfd", touchAction: "none", userSelect: "none", cursor: "grab" }}
                  onPointerDown={aoApertarFundo}
                  onPointerMove={aoMoverFundo}
                  onPointerUp={aoSoltarFundo}
                  onPointerCancel={aoSoltarFundo}
                  onPointerLeave={aoSoltarFundo}
                  onClick={() => {
                    if (!arrastouFundoRef.current) {
                      setFocoChave(null);
                      setHoverChave(null);
                    }
                  }}
                >
                  <g transform={`translate(${px},${py}) scale(${zoom})`}>
                    {/* Cadeia: liga cada nó visível ao próximo visível, pulando os ocultados pelo filtro */}
                    {arestas.map(([a, b]) => {
                      const pa = posAtual(a);
                      const pb = posAtual(b);
                      return (
                        <line
                          key={`${a.chave}->${b.chave}`}
                          x1={pa.x}
                          y1={pa.y}
                          x2={pb.x}
                          y2={pb.y}
                          stroke="#d8d8ea"
                          strokeWidth={2}
                          pointerEvents="none"
                        />
                      );
                    })}

                    {layoutNos.map((n) => {
                      const info = INFO_TIPO[n.item.tipo] ?? INFO_TIPO.atividade;
                      const p = posAtual(n);
                      const oculto = ocultos.has(n.item.tipo);
                      const selecionado = focoChave === n.chave;
                      const emFoco = chaveFoco === n.chave;
                      return (
                        <g
                          key={n.chave}
                          role="button"
                          tabIndex={oculto ? -1 : 0}
                          aria-label={`${info.rotulo}: ${n.item.titulo}, ${horaMin(n.item.quando)}`}
                          aria-pressed={selecionado}
                          transform={`translate(${p.x},${p.y})`}
                          opacity={oculto ? 0 : 1}
                          style={{ cursor: oculto ? "default" : "pointer", outline: "none" }}
                          pointerEvents={oculto ? "none" : "auto"}
                          onPointerDown={(e) => aoApertarNo(e, n)}
                          onPointerMove={(e) => aoMoverNo(e, n)}
                          onPointerUp={(e) => aoSoltarNo(e, n)}
                          onPointerCancel={(e) => aoSoltarNo(e, n)}
                          onPointerEnter={(e) => {
                            if (e.pointerType === "mouse") setHoverChave(n.chave);
                          }}
                          onPointerLeave={(e) => {
                            if (e.pointerType === "mouse") setHoverChave((v) => (v === n.chave ? null : v));
                          }}
                          onKeyDown={(e: ReactKeyboardEvent<SVGGElement>) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setFocoChave((v) => (v === n.chave ? null : n.chave));
                            }
                          }}
                        >
                          <circle r={RAIO_TOQUE} fill="transparent" />
                          {emFoco && <circle r={RAIO + 5} fill="none" stroke={info.cor} strokeWidth={2} opacity={0.4} />}
                          <circle r={RAIO} fill={info.cor} stroke="#fff" strokeWidth={2} />
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
                    Toque ou passe o mouse num nó para ver o resumo; clique para abrir os detalhes completos abaixo.
                    Arraste um nó para movê-lo (ele volta sozinho) ou arraste o fundo para navegar.
                  </span>
                  <span style={{ display: "inline-flex", gap: 6 }}>
                    <button type="button" aria-label="Diminuir zoom" style={botao} onClick={() => aplicarZoom(zoom / 1.25)}>
                      −
                    </button>
                    <button type="button" aria-label="Aumentar zoom" style={botao} onClick={() => aplicarZoom(zoom * 1.25)}>
                      +
                    </button>
                    <button type="button" style={{ ...botao, fontSize: 13 }} onClick={reenquadrar}>
                      Ajustar
                    </button>
                  </span>
                </div>
              </div>

              <PainelFoco item={itemFoco} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
