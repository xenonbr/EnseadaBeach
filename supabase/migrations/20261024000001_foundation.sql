-- 0001_foundation: funções, perfis, auditoria. Reversão: ver supabase/rollback/0001_down.sql
create extension if not exists pgcrypto;

create type public.app_role as enum ('admin','manager','attendant','kitchen','bar');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (length(trim(full_name)) > 0),
  role public.app_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_at_idx on public.audit_log (at desc);

-- Funções auxiliares (SECURITY DEFINER para evitar recursão de RLS em profiles)
create function public.current_staff_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create function public.has_role(variadic roles public.app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_staff_role() = any(roles), false)
$$;

create function public.write_audit(p_action text, p_entity text, p_entity_id text, p_details jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log(actor_id, action, entity, entity_id, details)
  values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_details,'{}'::jsonb))
$$;
revoke all on function public.write_audit(text,text,text,jsonb) from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_self_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_role('admin','manager'));
create policy profiles_admin_write on public.profiles for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
create policy audit_read on public.audit_log for select to authenticated
  using (public.has_role('admin','manager'));
-- sem policy de escrita em audit_log: apenas funções SECURITY DEFINER escrevem.

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Impede remover/rebaixar o último administrador ativo.
create function public.guard_last_admin() returns trigger language plpgsql as $$
begin
  if (old.role = 'admin' and old.active)
     and (tg_op = 'DELETE' or new.role <> 'admin' or not new.active)
     and (select count(*) from public.profiles where role='admin' and active and id <> old.id) = 0 then
    raise exception 'ULTIMO_ADMIN: não é possível remover o último administrador ativo';
  end if;
  return coalesce(new, old);
end $$;
create trigger profiles_guard_admin before update or delete on public.profiles
  for each row execute function public.guard_last_admin();
