import { supabase } from './supabase';
import type { Anotacao } from './anotacoes';

// Detalhe de uma pesquisa, lido do Supabase na hora que o popup abre.
export type DetalhePesquisa = {
  id: string;
  tema: string;
  fontes: string[];
  aprendido: string;
  criadoEm: number;
  duracaoMs: number | null;
  anotacao: Anotacao | null;
};

/** Lança erro se o Supabase falhar. Retorna null se a pesquisa não existe mais. */
export async function carregarDetalhePesquisa(id: string): Promise<DetalhePesquisa | null> {
  const { data: p, error: e1 } = await supabase
    .from('pesquisas')
    .select('id, tema, fontes, aprendido, created_at, duracao_ms')
    .eq('id', id)
    .maybeSingle();
  if (e1) throw new Error('pesquisas: ' + e1.message);
  if (!p) return null;

  const { data: notas, error: e2 } = await supabase
    .from('anotacoes')
    .select('id, pesquisa_id, autor, tema, fonte, texto, criado_em, atualizado_em')
    .eq('pesquisa_id', id)
    .order('criado_em', { ascending: true })
    .limit(1);
  if (e2) throw new Error('anotacoes: ' + e2.message);
  const n = notas?.[0];

  return {
    id: p.id,
    tema: p.tema,
    fontes: Array.isArray(p.fontes) ? p.fontes : [],
    aprendido: p.aprendido ?? '',
    criadoEm: new Date(p.created_at).getTime(),
    duracaoMs: typeof p.duracao_ms === 'number' ? p.duracao_ms : null,
    anotacao: n
      ? {
          id: n.id,
          pesquisaId: n.pesquisa_id,
          autor: n.autor,
          tema: n.tema,
          fonte: n.fonte,
          texto: n.texto,
          criadoEm: new Date(n.criado_em).getTime(),
          atualizadoEm: new Date(n.atualizado_em).getTime(),
        }
      : null,
  };
}
