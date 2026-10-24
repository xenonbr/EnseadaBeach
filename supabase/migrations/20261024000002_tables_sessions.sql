-- 0002_tables_sessions: setores, mesas, sessões. Reversão: supabase/rollback/0002_down.sql
create table public.sectors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create unique index sectors_name_uq on public.sectors (lower(name));

create table public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(trim(display_name)) > 0),
  sector_id uuid references public.sectors(id) on delete restrict,
  active boolean not null default false,
  sort_order int not null default 0,
  -- token público revogável e não sequencial (usado no QR)
  public_token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index dining_tables_name_uq on public.dining_tables (lower(display_name));
create trigger dining_tables_touch before update on public.dining_tables
  for each row execute function public.touch_updated_at();

create type public.session_status as enum ('open','closed');

create table public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.dining_tables(id) on delete restrict,
  status public.session_status not null default 'open',
  opened_by uuid not null,
  opened_at timestamptz not null default now(),
  closed_by uuid,
  closed_at timestamptz,
  close_note text,
  check ((status = 'open' and closed_at is null) or (status = 'closed' and closed_at is not null and closed_by is not null))
);
-- Uma única sessão aberta por mesa (controle de concorrência no banco).
create unique index table_sessions_one_open on public.table_sessions (table_id) where status = 'open';
create index table_sessions_table_idx on public.table_sessions (table_id, opened_at desc);

-- Carga inicial idempotente: Mesa 01..Mesa 40, DESATIVADAS.
-- Não duplica nem sobrescreve registros existentes (compara por nome, sem diferenciar maiúsculas).
-- É apenas capacidade cadastrada; nenhuma regra depende do número 40.
create function public.seed_initial_tables(p_count int default 40) returns int
language plpgsql as $$
declare n int;
begin
  insert into public.dining_tables (display_name, active, sort_order)
  select 'Mesa ' || lpad(i::text, 2, '0'), false, i
  from generate_series(1, p_count) i
  where not exists (select 1 from public.dining_tables t where lower(t.display_name) = lower('Mesa ' || lpad(i::text, 2, '0')));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.seed_initial_tables(int) from public, anon, authenticated;
select public.seed_initial_tables(40);

alter table public.sectors enable row level security;
alter table public.dining_tables enable row level security;
alter table public.table_sessions enable row level security;

create policy sectors_staff_read on public.sectors for select to authenticated
  using (public.current_staff_role() is not null);
create policy sectors_admin_write on public.sectors for all to authenticated
  using (public.has_role('admin','manager')) with check (public.has_role('admin','manager'));
create policy tables_staff_read on public.dining_tables for select to authenticated
  using (public.current_staff_role() is not null);
create policy tables_admin_write on public.dining_tables for all to authenticated
  using (public.has_role('admin','manager')) with check (public.has_role('admin','manager'));
create policy sessions_staff_read on public.table_sessions for select to authenticated
  using (public.has_role('admin','manager','attendant'));
-- sessões: escrita somente via RPC abaixo.

create function public.open_session(p_table_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_role('admin','manager','attendant') then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;
  if not exists (select 1 from dining_tables where id = p_table_id and active) then
    raise exception 'MESA_INATIVA_OU_INEXISTENTE';
  end if;
  insert into table_sessions(table_id, opened_by) values (p_table_id, auth.uid()) returning id into v_id;
  perform write_audit('session.open','table_session', v_id::text, jsonb_build_object('table_id', p_table_id));
  return v_id;
exception when unique_violation then
  raise exception 'SESSAO_JA_ABERTA';
end $$;

-- Pontos de extensão: pedidos/contas pendentes serão checados aqui (Fases 5–7).
create function public.session_has_pending(p_session_id uuid) returns boolean
language sql stable security definer set search_path = public as $$ select false $$;

create function public.close_session(p_session_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('admin','manager','attendant') then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;
  if public.session_has_pending(p_session_id) then
    raise exception 'PENDENCIAS_ABERTAS';
  end if;
  update table_sessions set status='closed', closed_at=now(), closed_by=auth.uid(), close_note=p_note
   where id = p_session_id and status='open';
  if not found then raise exception 'SESSAO_NAO_ABERTA'; end if;
  perform write_audit('session.close','table_session', p_session_id::text, jsonb_build_object('note', p_note));
end $$;

-- Ativar/desativar. Desativar com sessão aberta exige p_force (admin/gerente) e NÃO encerra a sessão.
create function public.set_table_active(p_table_id uuid, p_active boolean, p_force boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare v_open boolean;
begin
  if not public.has_role('admin','manager') then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;
  select exists (select 1 from table_sessions where table_id = p_table_id and status='open') into v_open;
  if not p_active and v_open and not p_force then
    raise exception 'SESSAO_ABERTA_REQUER_AUTORIZACAO';
  end if;
  update dining_tables set active = p_active where id = p_table_id;
  if not found then raise exception 'MESA_INEXISTENTE'; end if;
  perform write_audit('table.set_active','dining_table', p_table_id::text,
    jsonb_build_object('active', p_active, 'forced', p_force, 'had_open_session', v_open));
end $$;

-- Revoga o token público e gera outro (QR antigo deixa de funcionar).
create function public.rotate_table_token(p_table_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if not public.has_role('admin','manager') then raise exception 'SEM_PERMISSAO' using errcode='42501'; end if;
  update dining_tables set public_token = v where id = p_table_id;
  if not found then raise exception 'MESA_INEXISTENTE'; end if;
  perform write_audit('table.rotate_token','dining_table', p_table_id::text);
  return v;
end $$;

-- Resolução pública mínima: só nome da mesa e se há sessão aberta. Não expõe IDs.
create function public.resolve_table(p_token text) returns table (display_name text, active boolean, has_open_session boolean)
language sql stable security definer set search_path = public as $$
  select t.display_name, t.active,
         exists (select 1 from table_sessions s where s.table_id = t.id and s.status='open')
  from dining_tables t where t.public_token = p_token
$$;

revoke all on function public.open_session(uuid), public.close_session(uuid,text),
  public.set_table_active(uuid,boolean,boolean), public.rotate_table_token(uuid) from public, anon;
grant execute on function public.open_session(uuid), public.close_session(uuid,text),
  public.set_table_active(uuid,boolean,boolean), public.rotate_table_token(uuid) to authenticated;
grant execute on function public.resolve_table(text) to anon, authenticated;
