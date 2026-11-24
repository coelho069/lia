-- Anotações que a Lia escreve sobre cada pesquisa. O usuário só lê.
-- Rode uma vez no SQL Editor do Supabase.
create table if not exists public.anotacoes (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  pesquisa_id   text not null references public.pesquisas(id) on delete cascade,
  autor         text not null default 'lia' check (autor in ('lia')),
  tema          text not null default '',
  fonte         text not null default '',
  texto         text not null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists anotacoes_pesquisa_idx on public.anotacoes (user_id, pesquisa_id);

alter table public.anotacoes enable row level security;

-- O dono lê as próprias anotações
drop policy if exists "anotacoes_ler" on public.anotacoes;
create policy "anotacoes_ler" on public.anotacoes
  for select using (auth.uid() = user_id);

-- A Lia (pelo serviço, logado como o dono) cria e atualiza, só com autor 'lia'
drop policy if exists "anotacoes_lia_gravar" on public.anotacoes;
create policy "anotacoes_lia_gravar" on public.anotacoes
  for insert with check (auth.uid() = user_id and autor = 'lia');

drop policy if exists "anotacoes_lia_atualizar" on public.anotacoes;
create policy "anotacoes_lia_atualizar" on public.anotacoes
  for update using (auth.uid() = user_id and autor = 'lia')
  with check (auth.uid() = user_id and autor = 'lia');

-- Sem policy de delete: ninguém apaga anotações pelo app.
