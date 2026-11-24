-- Quanto tempo cada pesquisa durou (em milissegundos). Rode uma vez no SQL Editor.
alter table public.pesquisas add column if not exists duracao_ms integer;
