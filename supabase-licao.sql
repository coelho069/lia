-- Lição do refletor: novo tipo de nó 'licao' no grafo.
-- Rodar no SQL Editor do Supabase (não é rodado pelo código).
alter table public.grafo_nos drop constraint if exists grafo_nos_tipo_check;
alter table public.grafo_nos add constraint grafo_nos_tipo_check
  check (tipo in ('tema','fonte','aprendido','licao'));
