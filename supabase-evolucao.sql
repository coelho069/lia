-- ============================================================================
-- Diário da Lia (aba Evolução). Rodar no SQL Editor do Supabase.
-- Idempotente: não apaga nada. Só cria o que falta.
-- Tabelas existentes (pesquisas, grafo_nos, grafo_arestas, vida, mensagens)
-- não são alteradas.
-- ============================================================================

create table if not exists public.eventos (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  tipo        text not null check (tipo in ('pesquisa','chat','vida','decisao','movimento','grafo','erro','login')),
  titulo      text not null default '',
  detalhes    jsonb not null default '{}'::jsonb,
  ocorrido_em timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.eventos enable row level security;

drop policy if exists "eventos_dono" on public.eventos;
create policy "eventos_dono" on public.eventos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_eventos_user_ocorrido on public.eventos(user_id, ocorrido_em desc);
create index if not exists idx_eventos_user_tipo     on public.eventos(user_id, tipo);

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists eventos_updated_at on public.eventos;
create trigger eventos_updated_at before update on public.eventos
  for each row execute function public.set_updated_at();
