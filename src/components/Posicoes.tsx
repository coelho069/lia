import { useEffect, useState } from "react";
import { listarPosicoes, type Posicao } from "../supabase-persistence";

// Aba "Posições": as posições que a Lia já formou sobre temas que pesquisou
// (uma por tema, a mais recente). Só leitura de listarPosicoes() (supabase-persistence.ts);
// não grava nada, não muda o ciclo de pesquisa nem a lição em si.

function formatarData(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR");
}

export function Posicoes() {
  const [posicoes, setPosicoes] = useState<Posicao[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const resultado = await listarPosicoes();
      setPosicoes(resultado);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }

  // Busca ao abrir a aba (o componente é remontado a cada troca de aba, como as demais).
  useEffect(() => {
    void carregar();
  }, []);

  return (
    <div style={{ maxWidth: "100%", boxSizing: "border-box", overflowWrap: "anywhere" }}>
      <h2 style={{ margin: "0 0 4px 0", fontSize: 20, color: "#1a1a2e" }}>Posições da Lia</h2>
      <p style={{ margin: "0 0 12px 0", fontSize: 13, color: "#555" }}>
        O que a Lia passou a achar sobre cada tema que já pesquisou, com a evidência que a levou a essa opinião.
      </p>

      {erro && (
        <div style={{ marginBottom: 12, padding: 10, background: "#fff3f3", border: "1px solid #e94560", borderRadius: 6, color: "#8a1c2e", fontSize: 13 }}>
          Não consegui ler as posições: {erro}.
          <button
            type="button"
            onClick={() => void carregar()}
            style={{ marginLeft: 10, padding: "4px 10px", background: "#7c3aed", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}
          >
            Tentar de novo
          </button>
        </div>
      )}

      {carregando && posicoes === null && !erro && <p style={{ color: "#666" }}>Lendo as posições da Lia...</p>}

      {posicoes !== null && !erro && (
        <>
          {posicoes.length === 0 ? (
            <p style={{ color: "#666", fontSize: 14 }}>A Lia ainda não formou nenhuma posição.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {posicoes.map((p, i) => (
                <div key={`${p.tema}-${i}`} style={{ background: "white", border: "1px solid #ddd", borderRadius: 8, padding: 12, minWidth: 0 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                    <span aria-hidden style={{ fontSize: 15 }}>🧠</span>
                    <span style={{ fontWeight: "bold", fontSize: 15, color: "#1a1a2e" }}>{p.tema}</span>
                    {formatarData(p.criadoEm) && (
                      <span style={{ fontSize: 12, color: "#888" }}>{formatarData(p.criadoEm)}</span>
                    )}
                  </div>
                  <p style={{ margin: "0 0 6px 0", fontSize: 14, color: "#333", lineHeight: 1.5 }}>
                    eu acho que {p.licaoTexto}
                  </p>
                  <div style={{ fontSize: 12, color: "#777", fontStyle: "italic" }}>
                    evidência: {p.evidencia}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
