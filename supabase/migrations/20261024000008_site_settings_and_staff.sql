-- 20261024000008_site_settings_and_staff: configurações institucionais editáveis pelo proprietário e gestão de equipe/permissões.
-- Reversão: supabase/rollback/0008_down.sql

create table public.site_settings (
  id int primary key default 1 check (id = 1),
  about_text text,
  opening_hours text,
  phone text,
  whatsapp text,
  address_line text not null default 'Praia dos Coqueiros, Trancoso, Porto Seguro - BA',
  map_url text,
  instagram_url text,
  gallery_paths text[] not null default array[]::text[],
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id) values (1) on conflict (id) do nothing;

create trigger site_settings_touch before update on public.site_settings
  for each row execute function public.touch_updated_at();

alter table public.site_settings enable row level security;

create policy site_settings_public_read on public.site_settings for select to anon, authenticated
  using (true);

create policy site_settings_admin_update on public.site_settings for update to authenticated
  using (public.has_role('admin','manager'))
  with check (public.has_role('admin','manager'));

grant select on public.site_settings to anon, authenticated;
grant update on public.site_settings to authenticated;

-- Gestão de funcionários pelo Administrador: vincula usuário criado em auth.users a um perfil e papel operacional, ou atualiza existente.
create function public.upsert_staff_by_email(
  p_email text,
  p_full_name text,
  p_role public.app_role,
  p_active boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
begin
  if not public.has_role('admin') then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'NOME_INVALIDO';
  end if;

  select id into v_uid from auth.users where lower(email) = lower(trim(coalesce(p_email, '')));
  if v_uid is null then
    raise exception 'USUARIO_AUTH_NAO_ENCONTRADO';
  end if;

  insert into public.profiles (id, full_name, role, active)
  values (v_uid, trim(p_full_name), p_role, coalesce(p_active, true))
  on conflict (id) do update
    set full_name = excluded.full_name,
        role = excluded.role,
        active = excluded.active;

  perform public.write_audit('staff.upsert', 'profile', v_uid::text,
    jsonb_build_object('role', p_role, 'active', p_active));

  return v_uid;
end $$;

revoke all on function public.upsert_staff_by_email(text,text,public.app_role,boolean) from public, anon;
grant execute on function public.upsert_staff_by_email(text,text,public.app_role,boolean) to authenticated;
