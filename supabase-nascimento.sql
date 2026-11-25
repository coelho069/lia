-- ============================================================================
-- Data de nascimento da Lia (public.vida.nasceu_em)
--
-- Usada pelo mostrador de dias ("dias reais desde a criação").
--
-- COMO RODAR:
--   1. Abra o SQL Editor do Supabase do projeto e cole este arquivo.
--   2. Antes de rodar, confira a data. Hoje ela sai da primeira mensagem
--      registrada em public.mensagens (proposta: 2026-11-24T10:27:56+00:00).
--      Se quiser outra data, ajuste o bloco "update" abaixo ou rode depois:
--        update public.vida set nasceu_em = '2026-11-24T10:27:56+00:00'
--          where user_id = '<uuid do usuário>';
--   3. Rode uma vez só. O update só mexe em linhas com nasceu_em nulo,
--      então não reescreve a data de quem já tem.
--
-- O app não envia nasceu_em nas gravações da vida, então o upsert
-- não sobrescreve esta data.
-- ============================================================================

alter table public.vida add column if not exists nasceu_em timestamptz;

update public.vida v
   set nasceu_em = coalesce(
         (select min(m.created_at) from public.mensagens m where m.user_id = v.user_id),
         now()
       )
 where v.nasceu_em is null;

alter table public.vida alter column nasceu_em set default now();
