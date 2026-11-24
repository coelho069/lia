import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { loadResearchesFromSupabase } from "../supabase-persistence";
import type { ResearchTopic } from "../types";

// Painel "Pesquisas da Lia" na aba Cena, embaixo do "Vida da Lia".
// Lê do Supabase (tabela pesquisas, da mais recente para a mais antiga), não só da memória.
// Atualiza quando `gatilho` muda (uma pesquisa nova foi salva) e a cada 15 s.
// Cada item: tema e data à esquerda, a descrição curta ao lado direito.

const INTERVALO_MS = 15000;
const MAXIMO = 5;

function formatarDataHora(ms: number): string {
  return new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Tamanho mínimo e máximo do painel ao arrastar a alça no canto (em pixels)
const LARGURA_MIN = 180;
const LARGURA_MAX = 640;
const ALTURA_MIN = 140;
const PADRAO_LARGURA = 320;

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const clamp2: CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

export function PainelPesquisas({
  gatilho,
  pesquisando,
  onAbrir,
}: {
  gatilho: number;
  pesquisando: string;
  onAbrir: (id: string) => void;
}) {
  const [lista, setLista] = useState<ResearchTopic[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const vivoRef = useRef(true);
  const painelRef = useRef<HTMLDivElement>(null);
  // Tamanho escolhido com o mouse; altura null = automática (até a altura máxima da tela)
  const [tam, setTam] = useState<{ w: number; h: number | null }>({ w: PADRAO_LARGURA, h: null });

  async function ler() {
    try {
      const db = await loadResearchesFromSupabase();
      if (!vivoRef.current) return;
      if (db === null) return; // sem sessão: mantém o que já está na tela
      // Ordena da mais recente para a mais antiga (o banco já manda assim; garante aqui)
      setLista([...db].sort((a, b) => b.createdAt - a.createdAt));
      setErro(null);
    } catch (e) {
      if (vivoRef.current) setErro(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    vivoRef.current = true;
    void ler();
    const t = window.setInterval(() => void ler(), INTERVALO_MS);
    return () => {
      vivoRef.current = false;
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pesquisa nova salva: relê na hora (ela aparece no topo)
  useEffect(() => {
    if (gatilho > 0) void ler();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatilho]);

  const atual = lista?.[0] ?? null;
  const ultimas = (lista ?? []).slice(0, MAXIMO);
  const fonteAtual = atual?.sources.find((s) => /^https?:\/\//i.test(s));
  // Pouco espaço na tela: a lista rola dentro do painel, sem cobrir a Lia nem o chat
  const alturaMax = Math.max(140, window.innerHeight - 440);

  // Arrastar uma alça muda o tamanho: o canto de baixo muda largura e altura;
  // as bordas laterais mudam só a largura (a da esquerda cresce para a esquerda)
  const redimensionar = (lado: "canto" | "direita" | "esquerda") => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const w0 = tam.w;
    const h0 = painelRef.current?.offsetHeight ?? 200;
    const mover = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      const w = w0 + (lado === "esquerda" ? -dx : dx);
      setTam((atualTam) => ({
        w: limitar(w, LARGURA_MIN, LARGURA_MAX),
        h: lado === "canto" ? limitar(h0 + ev.clientY - y0, ALTURA_MIN, window.innerHeight - 200) : atualTam.h,
      }));
    };
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  };

  return (
    <div
      ref={painelRef}
      style={{
        position: "relative",
        width: tam.w,
        height: tam.h ?? undefined,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: tam.h ? "100%" : undefined,
          padding: 12,
          background: "rgba(255,255,255,0.88)",
          borderRadius: 8,
          boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
          fontSize: 13,
          maxHeight: tam.h ? undefined : alturaMax,
          overflow: "auto",
          boxSizing: "border-box",
        }}
      >
        <div style={{ fontWeight: "bold", fontSize: 19, marginBottom: 6 }}>Pesquisas da Lia</div>

        {lista === null && !erro && <div style={{ color: "#777" }}>Carregando…</div>}
        {erro && <div role="alert" style={{ color: "#7f1d1d" }}>Não carregou: {erro}</div>}

        {lista !== null && lista.length === 0 && (
          <div style={{ color: "#777" }}>A Lia ainda não pesquisou nada.</div>
        )}

        {atual && (
          <div style={{ marginBottom: 8, padding: 8, background: "#f5f3ff", borderRadius: 6 }}>
            <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: "bold", textTransform: "uppercase" }}>Pesquisa atual</div>
            <div style={{ fontWeight: "bold" }}>{atual.topic}</div>
            <div style={{ color: "#555", fontSize: 12, wordBreak: "break-all" }}>
              {fonteAtual ? <a href={fonteAtual} target="_blank" rel="noreferrer">{atual.site ?? "fonte"}</a> : (atual.site ?? "sem fonte")}
            </div>
          </div>
        )}

        {pesquisando && (
          <div style={{ marginBottom: 8, color: "#444", fontStyle: "italic" }}>Pesquisando agora: {pesquisando}</div>
        )}

        {ultimas.length > 0 && <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: "bold", textTransform: "uppercase", marginBottom: 4 }}>Últimas</div>}
        {ultimas.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onAbrir(p.id)}
            style={{
              display: "flex",
              gap: 8,
              width: "100%",
              textAlign: "left",
              padding: "6px 4px",
              marginBottom: 4,
              background: "transparent",
              border: "none",
              borderBottom: "1px solid #eee",
              cursor: "pointer",
              font: "inherit",
              boxSizing: "border-box",
            }}
          >
            {/* Esquerda, ao lado: descrição curta */}
            <div style={{ flex: "0 0 45%", color: "#333", fontSize: 13, lineHeight: 1.4, textAlign: "left", overflowWrap: "anywhere" }}>
              {p.summary}
            </div>
            {/* Direita: tema e data */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, ...clamp2 }}>{p.topic}</div>
              <div style={{ color: "#777", fontSize: 11 }}>{formatarDataHora(p.createdAt)}</div>
            </div>
          </button>
        ))}
      </div>
      {/* Bordas laterais: arrastar muda a largura */}
      <div
        role="separator"
        aria-label="Redimensionar largura (borda esquerda)"
        title="Arraste para mudar a largura"
        onPointerDown={redimensionar("esquerda")}
        onDoubleClick={() => setTam({ w: PADRAO_LARGURA, h: null })}
        style={{ position: "absolute", left: -4, top: 8, bottom: 8, width: 8, cursor: "ew-resize", touchAction: "none", zIndex: 3 }}
      />
      <div
        role="separator"
        aria-label="Redimensionar largura (borda direita)"
        title="Arraste para mudar a largura"
        onPointerDown={redimensionar("direita")}
        onDoubleClick={() => setTam({ w: PADRAO_LARGURA, h: null })}
        style={{ position: "absolute", right: -4, top: 8, bottom: 8, width: 8, cursor: "ew-resize", touchAction: "none", zIndex: 3 }}
      />
      {/* Alça para mudar o tamanho com o mouse (duplo clique volta ao padrão) */}
      <div
        role="separator"
        aria-label="Redimensionar painel de pesquisas"
        title="Arraste para mudar o tamanho (duplo clique: padrão)"
        onPointerDown={redimensionar("canto")}
        onDoubleClick={() => setTam({ w: PADRAO_LARGURA, h: null })}
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          width: 16,
          height: 16,
          cursor: "nwse-resize",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "flex-end",
          padding: 2,
          boxSizing: "border-box",
          color: "#7c3aed",
          fontSize: 12,
          lineHeight: 1,
          userSelect: "none",
          touchAction: "none",
        }}
      >
        ◢
      </div>
    </div>
  );
}
