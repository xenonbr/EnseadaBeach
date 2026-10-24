-- ATENÇÃO: destrutivo. Só executar com autorização explícita e backup.
drop table if exists public.table_sessions cascade;
drop table if exists public.dining_tables cascade;
drop table if exists public.sectors cascade;
drop type if exists public.session_status;
drop function if exists public.seed_initial_tables(int), public.session_has_pending(uuid),
  public.open_session(uuid), public.close_session(uuid,text), public.set_table_active(uuid,boolean,boolean),
  public.rotate_table_token(uuid), public.resolve_table(text);
