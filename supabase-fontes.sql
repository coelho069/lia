-- Nome do site de onde a Lia tirou cada pesquisa (ex.: "G1", "BBC News Brasil").
-- Rode no SQL Editor do Supabase ANTES de reiniciar o lia-pesquisa.
alter table public.pesquisas add column if not exists site text;
