-- ATENÇÃO: destrutivo. Só executar com autorização explícita e backup.
drop function if exists public.upsert_staff_by_email(text,text,public.app_role,boolean);
drop table if exists public.site_settings cascade;
