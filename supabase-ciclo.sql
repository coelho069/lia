-- Heartbeat do ciclo de pesquisa: a página avisa que está rodando a pesquisa,
-- e o serviço da VPS só pesquisa quando ninguém avisou nos últimos minutos.
-- Rode uma vez no SQL Editor do Supabase.
create table if not exists public.lia_ciclo (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  atualizado_em timestamptz not null default now(),
  quem         text not null default 'pagina'
);

alter table public.lia_ciclo enable row level security;

drop policy if exists "lia_ciclo_dono" on public.lia_ciclo;
create policy "lia_ciclo_dono" on public.lia_ciclo
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
