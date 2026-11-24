import { useEffect, useState } from "react";
import { ultimaVida } from "../eventos";
import { loadResearchesFromSupabase, idUsuarioAtual } from "../supabase-persistence";
import { normalizarTema } from "../pesquisa-ciclo";
import type { ResearchTopic } from "../types";
import { carregarAnotacoes, type Anotacao } from "../anotacoes";

// Aba Evolução: história do que foi pesquisado. Só dados do Supabase (não é ao vivo).
// Cache local só entra se o Supabase falhar.

type Item = ResearchTopic & { antes: string | null; depois: string | null };
type Grupo = { tema: string; itens: Item[] };

const ehLinkHttp = (s: string) => /^https?:\/\//i.test(s);

// Agrupa por tema (uma vez por tema), com as pesquisas em ordem de data.
// "Sabia antes" = resumo da pesquisa anterior do mesmo tema; "Mudou depois" = resumo da seguinte.
export function montarLinhaDoTempo(pesquisas: ResearchTopic[]): Grupo[] {
  const unicas = new Map<string, ResearchTopic>();
  for (const p of pesquisas) unicas.set(p.id, p);
  const asc = [...unicas.values()].sort((a, b) => a.createdAt - b.createdAt);
  const porTema = new Map<string, ResearchTopic[]>();
  for (const p of asc) {
    const k = normalizarTema(p.topic);
    porTema.set(k, [...(porTema.get(k) ?? []), p]);
  }
  const grupos: Grupo[] = [];
  for (const lista of porTema.values()) {
    const itens: Item[] = lista.map((p, i) => ({
      ...p,
      antes: i > 0 ? lista[i - 1].summary : null,
      depois: i < lista.length - 1 ? lista[i + 1].summary : null,
    }));
    grupos.push({ tema: lista[0].topic, itens });
  }
  return grupos.sort((a, b) => a.itens[0].createdAt - b.itens[0].createdAt);
}

function cacheDaConta(): ResearchTopic[] {
  try {
    const raw = localStorage.getItem("lia-pesquisas:" + (idUsuarioAtual() ?? "sem-usuario"));
    const lista = raw ? JSON.parse(raw) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

export function AbaEvolucao({ onAbrirPesquisa }: { onAbrirPesquisa?: (id: string) => void } = {}) {
  const [pesquisas, setPesquisas] = useState<ResearchTopic[]>([]);
  const [capitulo, setCapitulo] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [daCache, setDaCache] = useState(false);
  const [anotacoes, setAnotacoes] = useState<Anotacao[]>([]);

  async function carregar() {
    setCarregando(true);
    try {
      const [lista, vida] = await Promise.all([loadResearchesFromSupabase(), ultimaVida()]);
      if (lista === null) throw new Error("sem sessão do Supabase");
      setPesquisas(lista);
      // Anotações da Lia: se falharem, a história aparece sem elas
      setAnotacoes(await carregarAnotacoes().catch(() => []));
      setCapitulo(vida ? Number(vida.capitulo ?? 1) : 1);
      setDaCache(false);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      const cache = cacheDaConta();
      if (cache.length) {
        setPesquisas(cache);
        setDaCache(true);
      }
    } finally {
      setCarregando(false);
    }
  }

  // Ao abrir a aba busca de novo no Supabase; atualiza a cada 15 s enquanto estiver aberta
  useEffect(() => {
    void carregar();
    const t = setInterval(() => void carregar(), 15000);
    return () => clearInterval(t);
  }, []);

  const grupos = montarLinhaDoTempo(pesquisas);
  const fontes = new Set(pesquisas.flatMap((p) => p.sources).filter(ehLinkHttp));

  const cartao = (rotulo: string, valor: string | number) => (
    <div style={{ padding: 12, background: "white", border: "1px solid #ddd", borderRadius: 8, minWidth: 150 }}>
      <div style={{ fontSize: 12, color: "#666" }}>{rotulo}</div>
      <div style={{ fontSize: 22, fontWeight: "bold", color: "#1a1a2e" }}>{valor}</div>
    </div>
  );

  const rotuloLabel = (t: string) => (
    <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: "bold", textTransform: "uppercase" }}>{t}</div>
  );

  return (
    <div>
      <h2 style={{ margin: "0 0 4px 0", fontSize: 20, color: "#1a1a2e" }}>Evolução: o que a Lia pesquisou</h2>
      <p style={{ margin: "0 0 12px 0", fontSize: 13, color: "#555" }}>
        História das pesquisas, do mais antigo para o mais recente, agrupada por tema.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        {cartao("Temas diferentes", grupos.length)}
        {cartao("Pesquisas no total", pesquisas.length)}
        {cartao("Fontes diferentes", fontes.size)}
        {cartao("Capítulo atual", capitulo ?? "—")}
      </div>

      {erro && (
        <div style={{ marginBottom: 12, padding: 10, background: "#fff3f3", border: "1px solid #e94560", borderRadius: 6, color: "#8a1c2e", fontSize: 13 }}>
          Não consegui ler do Supabase: {erro}.
          {daCache ? " Mostrando os dados salvos neste navegador." : ""}
          <button
            onClick={() => void carregar()}
            style={{ marginLeft: 10, padding: "4px 10px", background: "#7c3aed", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}
          >
            Tentar de novo
          </button>
        </div>
      )}

      {carregando && pesquisas.length === 0 && <p style={{ color: "#666" }}>Lendo a história no Supabase...</p>}
      {!carregando && pesquisas.length === 0 && !erro && (
        <p style={{ color: "#666" }}>A Lia ainda não pesquisou nada. Quando pesquisar, a história aparece aqui.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {grupos.map((g) => (
          <div key={normalizarTema(g.tema)} style={{ background: "white", border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <h3
                onClick={() => g.itens.length && onAbrirPesquisa?.(g.itens[g.itens.length - 1].id)}
                style={{ margin: 0, fontSize: 17, color: "#1a1a2e", cursor: onAbrirPesquisa ? "pointer" : "default" }}
                title="Abrir a pesquisa mais recente deste tema"
              >
                {g.tema}
              </h3>
              <span style={{ fontSize: 12, color: "#666" }}>{g.itens.length} pesquisa(s)</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, borderLeft: "3px solid #7c3aed", paddingLeft: 12 }}>
              {g.itens.map((it) => {
                const fonte = it.sources.find(ehLinkHttp);
                return (
                  <div key={it.id} onClick={() => onAbrirPesquisa?.(it.id)} style={{ cursor: onAbrirPesquisa ? "pointer" : "default" }}>
                    <div style={{ fontSize: 12, color: "#555" }}>{new Date(it.createdAt).toLocaleString("pt-BR")}</div>
                    <div style={{ marginTop: 4 }}>
                      {rotuloLabel("Sabia antes")}
                      <div style={{ fontSize: 13, color: "#333" }}>{it.antes ?? "Ainda não sabia nada sobre este tema."}</div>
                    </div>
                    <div style={{ marginTop: 4 }}>
                      {rotuloLabel("Aprendeu nesta pesquisa")}
                      <div style={{ fontSize: 13, color: "#1a1a2e" }}>{it.summary || "—"}</div>
                    </div>
                    <div style={{ marginTop: 4 }}>
                      {rotuloLabel("Mudou depois")}
                      <div style={{ fontSize: 13, color: "#333" }}>{it.depois ?? "Ainda sem nova pesquisa sobre este tema."}</div>
                    </div>
                    {anotacoes.filter((a) => a.pesquisaId === it.id).map((a) => (
                      <div key={a.id} style={{ marginTop: 4, padding: 8, background: "#f5f3ff", borderRadius: 6 }}>
                        {rotuloLabel("Anotação da Lia")}
                        <div style={{ fontSize: 13, color: "#333", whiteSpace: "pre-wrap" }}>{a.texto}</div>
                        <div style={{ fontSize: 12, color: "#666" }}>{new Date(a.criadoEm).toLocaleString("pt-BR")}</div>
                      </div>
                    ))}
                    <div style={{ marginTop: 4, fontSize: 13 }}>
                      {it.site && <span>Site: <b>{it.site}</b> · </span>}
                      Fonte: {fonte ? (
                        <a href={fonte} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>{fonte}</a>
                      ) : (
                        <span style={{ color: "#888" }}>Fonte não registrada</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
