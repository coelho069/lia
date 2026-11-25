import { useState } from "react";
import type { ResearchTopic } from "../types";
import type { Anotacao } from "../anotacoes";

// Janela das anotações da Lia: escolhe uma pesquisa e lê o que ela anotou. Só leitura.
export function AnotacoesModal({
  pesquisas,
  anotacoes,
  pesquisaInicial,
  onFechar,
}: {
  pesquisas: ResearchTopic[];
  anotacoes: Anotacao[];
  pesquisaInicial: string | null;
  onFechar: () => void;
}) {
  const [pesquisaId, setPesquisaId] = useState<string>(
    pesquisaInicial && pesquisas.some((p) => p.id === pesquisaInicial)
      ? pesquisaInicial
      : pesquisas[0]?.id ?? "",
  );

  const pesquisaAtual = pesquisas.find((p) => p.id === pesquisaId);
  const lista = anotacoes
    .filter((a) => a.pesquisaId === pesquisaId)
    .sort((a, b) => b.criadoEm - a.criadoEm);

  const botao = {
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid #ccc",
    background: "white",
    cursor: "pointer",
    fontSize: 13,
  } as const;

  return (
    <div
      role="dialog"
      aria-label="Anotações da Lia"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,20,0.45)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onFechar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 100%)",
          maxHeight: "86vh",
          overflow: "auto",
          background: "#fafaf7",
          borderRadius: 12,
          padding: 18,
          boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <strong style={{ fontSize: 18, color: "#1a1a2e" }}>Anotações da Lia</strong>
          <button type="button" onClick={onFechar} style={botao}>Fechar</button>
        </div>

        {pesquisas.length === 0 ? (
          <div style={{ color: "#555" }}>A Lia ainda não pesquisou nada.</div>
        ) : (
          <>
            <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 4 }}>Pesquisa</label>
            <select
              value={pesquisaId}
              onChange={(e) => setPesquisaId(e.target.value)}
              style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc", marginBottom: 12 }}
            >
              {pesquisas.map((p) => (
                <option key={p.id} value={p.id}>{p.topic}</option>
              ))}
            </select>

            {pesquisaAtual && (
              <div style={{ fontSize: 13, color: "#555", marginBottom: 10 }}>
                {new Date(pesquisaAtual.createdAt).toLocaleString("pt-BR")}
              </div>
            )}

            {lista.length === 0 && (
              <div style={{ color: "#777", fontSize: 14 }}>
                Nenhuma anotação ainda.
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {lista.map((a) => (
                <div key={a.id} style={{ background: "white", border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
                    {new Date(a.criadoEm).toLocaleString("pt-BR")}
                  </div>
                  <div style={{ fontSize: 14, color: "#222", whiteSpace: "pre-wrap" }}>{a.texto}</div>
                  <div style={{ fontSize: 12, marginTop: 6 }}>
                    {a.fonte ? (
                      <a href={a.fonte} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>
                        Fonte
                      </a>
                    ) : (
                      <span style={{ color: "#888" }}>Fonte não registrada</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
