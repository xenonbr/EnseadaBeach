-- Reversão de 20261024000009_history_purge_and_closure.sql
drop function if exists public.purge_closed_history(date);
drop function if exists public.delete_cancelled_order(uuid);
