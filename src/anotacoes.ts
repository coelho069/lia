import { supabase } from './supabase';

// Anotação que a Lia escreveu sobre uma pesquisa. O usuário só lê (o banco não deixa apagar).
export type Anotacao = {
  id: string;
  pesquisaId: string;
  autor: 'lia';
  tema: string;
  fonte: string;
  texto: string;
  criadoEm: number;
  atualizadoEm: number;
};

type Linha = {
  id: string;
  pesquisa_id: string;
  autor: 'lia';
  tema: string;
  fonte: string;
  texto: string;
  criado_em: string;
  atualizado_em: string;
};

/** Lança erro se falhar. Lista vazia = o banco realmente não tem anotações. */
export async function carregarAnotacoes(): Promise<Anotacao[]> {
  const { data, error } = await supabase
    .from('anotacoes')
    .select('id, pesquisa_id, autor, tema, fonte, texto, criado_em, atualizado_em')
    .order('criado_em', { ascending: true });
  if (error) {
    // Tabela ainda não criada no Supabase (PGRST205 / 42P01): não é erro para a tela; lista vazia e tenta de novo depois
    if (error.code === 'PGRST205' || error.code === '42P01') {
      console.info('anotacoes: tabela ainda não existe no Supabase; rode supabase-anotacoes.sql');
      return [];
    }
    throw new Error('anotacoes: ' + error.message);
  }
  return (data as Linha[]).map((l) => ({
    id: l.id,
    pesquisaId: l.pesquisa_id,
    autor: l.autor,
    tema: l.tema,
    fonte: l.fonte,
    texto: l.texto,
    criadoEm: new Date(l.criado_em).getTime(),
    atualizadoEm: new Date(l.atualizado_em).getTime(),
  }));
}
