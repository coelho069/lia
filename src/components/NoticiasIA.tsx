import { useEffect, useState } from "react";

// Aba Notícias: notícias de IA do dia e o comentário diário da Lia.
// Só leitura de GET /api/noticias-ia (cache de 1 h no servidor). Não grava nada.

type Noticia = {
  id: string;
  fonte: string;
  titulo: string;
  resumo: string;
  link: string;
  publicadoEm: string;
};

type ComentarioDoDia = {
  data: string;
  noticia: Noticia | null;
  comentario: string | null;
  motivo: string | null;
  geradoEm: string;
};

type Resposta = {
  atualizadoEm: string;
  feedsOk: number;
  noticias: Noticia[];
  comentarioDoDia: ComentarioDoDia | null;
};

const INTERVALO_MS = 10 * 60 * 1000;

const ehLinkHttp = (s: string) => /^https?:\/\//i.test(s);

function formatarData(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR");
}

function LinkNoticia({ link }: { link: string }) {
  if (!ehLinkHttp(link)) return null;
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: "#7c3aed", textDecoration: "underline", fontSize: 13, wordBreak: "break-all" }}>
      Abrir a notícia
    </a>
  );
}

export function NoticiasIA() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const res = await fetch("/api/noticias-ia", { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = (await res.json()) as Partial<Resposta>;
      setDados({
        atualizadoEm: json.atualizadoEm ?? "",
        feedsOk: Number(json.feedsOk ?? 0),
        noticias: Array.isArray(json.noticias) ? json.noticias : [],
        comentarioDoDia: json.comentarioDoDia ?? null,
      });
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }

  // Ao abrir a aba busca agora e a cada 10 minutos
  useEffect(() => {
    void carregar();
    const t = setInterval(() => void carregar(), INTERVALO_MS);
    return () => clearInterval(t);
  }, []);

  const comentario = dados?.comentarioDoDia ?? null;
  const noticias = dados?.noticias ?? [];

  return (
    <div style={{ maxWidth: "100%", boxSizing: "border-box", overflowWrap: "anywhere" }}>
      <h2 style={{ margin: "0 0 4px 0", fontSize: 20, color: "#1a1a2e" }}>Notícias de IA do dia</h2>
      <p style={{ margin: "0 0 12px 0", fontSize: 13, color: "#555" }}>
        As notícias de IA que a Lia leu e o comentário dela sobre a do dia.
        {dados?.atualizadoEm && <> Atualizado em {formatarData(dados.atualizadoEm)}.</>}
      </p>

      {erro && (
        <div style={{ marginBottom: 12, padding: 10, background: "#fff3f3", border: "1px solid #e94560", borderRadius: 6, color: "#8a1c2e", fontSize: 13 }}>
          Não consegui ler as notícias: {erro}.
          <button
            type="button"
            onClick={() => void carregar()}
            style={{ marginLeft: 10, padding: "4px 10px", background: "#7c3aed", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}
          >
            Tentar de novo
          </button>
        </div>
      )}

      {carregando && !dados && <p style={{ color: "#666" }}>Lendo as notícias...</p>}

      {dados && (
        <>
          {/* Comentário do dia em destaque */}
          <div style={{ background: "white", border: "2px solid #7c3aed", borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: "bold", textTransform: "uppercase", marginBottom: 6 }}>
              Comentário do dia da Lia{comentario?.data ? " · " + comentario.data : ""}
            </div>
            {comentario?.comentario ? (
              <>
                <p style={{ margin: "0 0 10px 0", fontSize: 15, color: "#222", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {comentario.comentario}
                </p>
                {comentario.noticia && (
                  <div style={{ padding: 8, background: "#f5f3ff", borderRadius: 6, fontSize: 13, color: "#333" }}>
                    <div style={{ fontWeight: "bold", color: "#1a1a2e", marginBottom: 2 }}>{comentario.noticia.titulo}</div>
                    <div style={{ color: "#555", marginBottom: 4 }}>
                      {comentario.noticia.fonte}
                      {formatarData(comentario.noticia.publicadoEm) && <> · {formatarData(comentario.noticia.publicadoEm)}</>}
                    </div>
                    <LinkNoticia link={comentario.noticia.link} />
                  </div>
                )}
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 14, color: "#666" }}>
                {comentario?.motivo
                  ? "Hoje a Lia não comentou: " + comentario.motivo + "."
                  : "Hoje a Lia ainda não tem comentário."}
              </p>
            )}
          </div>

          {/* Lista das notícias de IA */}
          <h3 style={{ margin: "0 0 8px 0", fontSize: 16, color: "#1a1a2e" }}>
            Notícias de IA ({noticias.length})
          </h3>
          {noticias.length === 0 ? (
            <p style={{ color: "#666", fontSize: 14 }}>Nenhuma notícia de IA disponível agora.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {noticias.map((n) => (
                <div key={n.id} style={{ background: "white", border: "1px solid #ddd", borderRadius: 8, padding: 12, minWidth: 0 }}>
                  <div style={{ fontWeight: "bold", fontSize: 15, color: "#1a1a2e", marginBottom: 4 }}>{n.titulo}</div>
                  <div style={{ fontSize: 13, color: "#555", marginBottom: 6 }}>
                    {n.fonte}
                    {formatarData(n.publicadoEm) && <> · {formatarData(n.publicadoEm)}</>}
                  </div>
                  <LinkNoticia link={n.link} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
