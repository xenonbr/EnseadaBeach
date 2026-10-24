-- ATENÇÃO: destrutivo. Só executar com autorização explícita e backup.
drop table if exists public.audit_log cascade;
drop table if exists public.profiles cascade;
drop function if exists public.current_staff_role(), public.has_role(public.app_role[]),
  public.write_audit(text,text,text,jsonb), public.touch_updated_at(), public.guard_last_admin();
drop type if exists public.app_role;
