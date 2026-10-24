-- Provisionamento do PRIMEIRO administrador (executar manualmente no SQL Editor do Supabase).
-- Pré-requisitos:
--   1. Migrations 0001 e 0002 aplicadas (com autorização).
--   2. O usuário já foi criado por VOCÊ em Authentication > Users (Add user), com senha forte própria.
--      Nenhuma senha é definida ou armazenada neste repositório.
-- Segurança: só funciona se ainda NÃO existir nenhum administrador; é idempotente.
do $$
declare
  v_email text := 'admenseada@hotmail.com';  -- altere aqui se necessário
  v_id uuid;
begin
  if exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'Já existe administrador; use o painel para gerir funcionários.';
  end if;
  select id into v_id from auth.users where lower(email) = lower(v_email);
  if v_id is null then
    raise exception 'Usuário % não encontrado em auth.users. Crie-o primeiro no painel Auth.', v_email;
  end if;
  insert into public.profiles (id, full_name, role) values (v_id, 'Administrador', 'admin');
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (null, 'admin.bootstrap', 'profile', v_id::text, jsonb_build_object('method', 'manual_sql'));
end $$;
