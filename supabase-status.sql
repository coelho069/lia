-- Status do serviço da VPS: texto curto do que a Lia está fazendo agora
-- (ex.: "Lendo o resultado de Brasil"). A página lê junto com lia_ciclo.
-- Rode no SQL Editor do Supabase. Não é rodado pelo código.
alter table public.lia_ciclo add column if not exists status_texto text;
