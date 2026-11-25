import { supabase } from './supabase';

/* ============================================================================
   Grafo da Lia lido do Supabase (somente leitura).

   Tabelas (criadas por supabase-schema.sql e supabase-licao.sql):
   - grafo_nos:     id, user_id, pesquisa_id, label, tipo, created_at
                    tipo: 'tema' | 'fonte' | 'aprendido' | 'licao'
   - grafo_arestas: id, user_id, origem_id, destino_id, tipo ('liga'), created_at

   Regras:
   - Nada é inventado: só vira aresta o que existe em grafo_arestas, e só
     se os dois nós (origem e destino) existem em grafo_nos.
   - Nó sem aresta entra sozinho na lista.
   - Mesmo padrão de sessão e RLS de loadResearchesFromSupabase (filtro por user_id).
   ============================================================================ */

export type NoGrafo = {
  id: string;
  label: string;
  tipo: string; // 'tema' | 'fonte' | 'aprendido' | 'licao'
  pesquisaId: string | null;
};

export type ArestaGrafo = {
  id: string;
  origem: string; // id do nó de origem (origem_id)
  destino: string; // id do nó de destino (destino_id)
  tipo: string; // valor gravado em grafo_arestas.tipo (ex.: 'liga')
  ligacao: string; // tipo dos dois nós, ex.: 'tema-fonte', 'tema-aprendido', 'tema-licao'
};

export type DadosGrafo = { nos: NoGrafo[]; arestas: ArestaGrafo[] };

type LinhaNo = { id: string; pesquisa_id: string | null; label: string | null; tipo: string };
type LinhaAresta = { id: string; origem_id: string; destino_id: string; tipo: string | null };

const TAMANHO_PAGINA = 1000;

async function idDoUsuario(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

// Lê a tabela inteira do usuário em páginas (o padrão do PostgREST corta em 1000 linhas).
async function lerTodas<T>(tabela: string, colunas: string, userId: string): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; ; de += TAMANHO_PAGINA) {
    const { data, error } = await supabase
      .from(tabela)
      .select(colunas)
      .eq('user_id', userId)
      .order('id', { ascending: true })
      .range(de, de + TAMANHO_PAGINA - 1);
    if (error) {
      console.error(`[supabase] grafo ${tabela}:`, error.message);
      throw new Error(`${tabela}: ${error.message}`);
    }
    const pagina = (data ?? []) as T[];
    linhas.push(...pagina);
    if (pagina.length < TAMANHO_PAGINA) break;
  }
  return linhas;
}

/** Retorna null sem sessão. Lança erro se a leitura de grafo_nos ou grafo_arestas falhar. */
export async function carregarGrafoSupabase(): Promise<DadosGrafo | null> {
  const userId = await idDoUsuario();
  if (!userId) return null;

  const [linhasNos, linhasArestas] = await Promise.all([
    lerTodas<LinhaNo>('grafo_nos', 'id, pesquisa_id, label, tipo', userId),
    lerTodas<LinhaAresta>('grafo_arestas', 'id, origem_id, destino_id, tipo', userId),
  ]);

  const nos: NoGrafo[] = linhasNos.map((n) => ({
    id: n.id,
    label: String(n.label ?? ''),
    tipo: n.tipo,
    pesquisaId: n.pesquisa_id ?? null,
  }));

  const tipoDe = new Map(nos.map((n) => [n.id, n.tipo]));
  const arestas: ArestaGrafo[] = [];
  for (const a of linhasArestas) {
    const tipoOrigem = tipoDe.get(a.origem_id);
    const tipoDestino = tipoDe.get(a.destino_id);
    // Aresta com nó ausente não é desenhada (não inventa ligação)
    if (!tipoOrigem || !tipoDestino) continue;
    arestas.push({
      id: a.id,
      origem: a.origem_id,
      destino: a.destino_id,
      tipo: a.tipo ?? 'liga',
      ligacao: `${tipoOrigem}-${tipoDestino}`,
    });
  }

  return { nos, arestas };
}
