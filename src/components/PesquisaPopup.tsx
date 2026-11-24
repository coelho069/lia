import { useEffect, useRef, useState } from "react";
import { carregarDetalhePesquisa, type DetalhePesquisa } from "../detalhePesquisa";
import type { ResearchTopic } from "../types";

// Popup com tudo o que foi pesquisado. Lê o Supabase ao abrir (pesquisas + anotação da Lia).
// O resumo que já está na tela serve só de reserva se a leitura falhar.
const ehLinkHttp = (s: string) => /^https?:\/\//i.test(s);

function formatarDuracao(ms: number | null): string {
  if (ms === null) return "Não registrado";
  const s = Math.round(ms / 1000);
  if (s < 60) return s + " s";
  return Math.floor(s / 60) + " min " + (s % 60) + " s";
}

export function PesquisaPopup({
  pesquisaId,
  reserva,
  onFechar,
}: {
  pesquisaId: string;
  reserva: ResearchTopic | null;
  onFechar: () => void;
}) {
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;
  const [detalhe, setDetalhe] = useState<DetalhePesquisa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    carregarDetalhePesquisa(pesquisaId)
      .then((d) => {
        if (!vivo) return;
        setDetalhe(d);
        setErro(d ? null : "Esta pesquisa não existe mais no Supabase.");
      })
      .catch((e) => {
        if (vivo) setErro(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    // Fecha com Esc
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fecharRef.current();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => {
      vivo = false;
      window.removeEventListener("keydown", aoTeclar);
    };
  }, [pesquisaId]);

  // Se a leitura falhou, mostra o que já estava na tela (reserva), sem inventar nada
  const tema = detalhe?.tema ?? reserva?.topic ?? "";
  const aprendido = detalhe?.aprendido ?? reserva?.summary ?? "";
  const fontes = detalhe?.fontes ?? reserva?.sources ?? [];
  const criadoEm = detalhe?.criadoEm ?? reserva?.createdAt ?? null;
  const fonte = fontes.find(ehLinkHttp);
  const anotacao = detalhe?.anotacao ?? null;

  const rotulo = (t: string) => (
    <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: "bold", textTransform: "uppercase", marginBottom: 4 }}>{t}</div>
  );

  return (
    <div
      role="dialog"
      aria-label="Detalhes da pesquisa"
      onClick={onFechar}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,20,0.6)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 100%)",
          maxHeight: "86vh",
          overflow: "auto",
          background: "#fafaf7",
          borderRadius: 12,
          padding: 20,
          boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 20, color: "#1a1a2e" }}>{tema || "Pesquisa"}</h3>
          <button
            type="button"
            onClick={onFechar}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #ccc", background: "white", cursor: "pointer", fontSize: 13 }}
          >
            Fechar
          </button>
        </div>

        {carregando && <div style={{ color: "#666", fontSize: 13, marginBottom: 10 }}>Lendo do Supabase...</div>}
        {erro && (
          <div role="alert" style={{ color: "#8a1c2e", fontSize: 13, marginBottom: 10 }}>
            Não consegui ler agora ({erro}). Mostrando o que já estava na tela.
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", fontSize: 14, marginBottom: 14 }}>
          <span style={{ color: "#555" }}>Data e hora</span>
          <span>{criadoEm ? new Date(criadoEm).toLocaleString("pt-BR") : "—"}</span>
          <span style={{ color: "#555" }}>Quanto tempo durou</span>
          <span>{formatarDuracao(detalhe?.duracaoMs ?? null)}</span>
        </div>

        <div style={{ marginBottom: 14 }}>
          {rotulo("O que ela aprendeu")}
          <div style={{ fontSize: 15, color: "#222", lineHeight: 1.5 }}>{aprendido || "—"}</div>
        </div>

        <div style={{ marginBottom: 14, padding: 10, background: "#f5f3ff", borderRadius: 8 }}>
          {rotulo("Anotação da Lia")}
          {anotacao ? (
            <>
              <div style={{ fontSize: 14, color: "#333", whiteSpace: "pre-wrap" }}>{anotacao.texto}</div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                {new Date(anotacao.criadoEm).toLocaleString("pt-BR")}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 14, color: "#666" }}>A Lia ainda não anotou essa pesquisa.</div>
          )}
        </div>

        <div>
          {rotulo("Fonte")}
          {fonte ? (
            <a href={fonte} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", fontSize: 14, wordBreak: "break-all" }}>
              {fonte}
            </a>
          ) : (
            <span style={{ color: "#888", fontSize: 14 }}>Fonte não registrada</span>
          )}
        </div>
      </div>
    </div>
  );
}
