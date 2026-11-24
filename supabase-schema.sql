-- ============================================================================
-- Schema Supabase - Bichinho IA (Lia)
-- ============================================================================
-- Execute no SQL Editor do projeto Supabase (Nova consulta) e rode tudo de uma vez.
-- É idempotente: pode rodar de novo sem apagar dados.
--
-- IDs são TEXT de propósito: o site roda em http://IP (não é contexto seguro),
-- então crypto.randomUUID() pode não existir e o app gera ids "id-...".
--
-- O frontend usa só a chave publicável (VITE_SUPABASE_PUBLISHABLE_KEY).
-- Nunca coloque a service_role key no frontend. Segurança = RLS abaixo.
-- ============================================================================

-- 1. Pesquisas da Lia (tema, fonte, aprendido, data e hora)
create table if not exists public.pesquisas (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  tema       text not null,
  fontes     text[] not null default '{}',
  aprendido  text not null default '',
  created_at timestamptz not null default now()
);

-- 2. Grafo da Lia - nós (tema, fonte, aprendido), ligados a uma pesquisa
create table if not exists public.grafo_nos (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  pesquisa_id text references public.pesquisas(id) on delete cascade,
  label       text not null,
  tipo        text not null check (tipo in ('tema','fonte','aprendido')),
  created_at  timestamptz not null default now()
);

-- 3. Grafo da Lia - arestas ligando nós
create table if not exists public.grafo_arestas (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  origem_id  text not null references public.grafo_nos(id) on delete cascade,
  destino_id text not null references public.grafo_nos(id) on delete cascade,
  tipo       text not null default 'liga',
  created_at timestamptz not null default now()
);

-- 4. Vida da Lia (um registro por usuário)
create table if not exists public.vida (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  fome       integer not null default 70,
  energia    integer not null default 80,
  humor      integer not null default 70,
  social     integer not null default 60,
  saude      integer not null default 100,
  xp         integer not null default 0,
  chapter    integer not null default 1,
  updated_at timestamptz not null default now()
);

-- 5. Mensagens do chat da Lia
create table if not exists public.mensagens (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('user','person')),
  text       text not null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- RLS: cada usuário só enxerga e altera as próprias linhas
-- ----------------------------------------------------------------------------
alter table public.pesquisas     enable row level security;
alter table public.grafo_nos     enable row level security;
alter table public.grafo_arestas enable row level security;
alter table public.vida          enable row level security;
alter table public.mensagens     enable row level security;

drop policy if exists "pesquisas_dono" on public.pesquisas;
create policy "pesquisas_dono" on public.pesquisas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "grafo_nos_dono" on public.grafo_nos;
create policy "grafo_nos_dono" on public.grafo_nos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "grafo_arestas_dono" on public.grafo_arestas;
create policy "grafo_arestas_dono" on public.grafo_arestas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "vida_dono" on public.vida;
create policy "vida_dono" on public.vida
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "mensagens_dono" on public.mensagens;
create policy "mensagens_dono" on public.mensagens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Índices
create index if not exists idx_pesquisas_user  on public.pesquisas(user_id, created_at desc);
create index if not exists idx_grafo_nos_user  on public.grafo_nos(user_id);
create index if not exists idx_grafo_arestas_user on public.grafo_arestas(user_id);
create index if not exists idx_mensagens_user  on public.mensagens(user_id, created_at);
