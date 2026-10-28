-- 20261024000010_staff_tracking_and_ratings:
-- 1. Leitura de perfis da equipe para rastreabilidade interna de quem assumiu cada tarefa.
-- 2. Avaliações de atendimento dos garçons por sessão encerrada (service_ratings).
-- Reversão: supabase/rollback/0010_down.sql

-- Permitir que qualquer membro autenticado da equipe consulte os nomes dos funcionários (profiles)
-- para exibição transparente de quem assumiu cada pedido, preparo, entrega ou chamado de mesa.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_staff_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.current_staff_role() is not null);

-- Tabela de avaliações de atendimento por mesa/sessão encerrada
create table public.service_ratings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.table_sessions(id) on delete cascade,
  table_id uuid not null references public.dining_tables(id) on delete restrict,
  staff_id uuid references public.profiles(id) on delete set null,
  staff_name_snapshot text not null,
  client_token_hash text not null,
  customer_name text check (customer_name is null or length(trim(customer_name)) between 1 and 60),
  stars int not null check (stars between 1 and 5),
  comment text check (comment is null or length(trim(comment)) <= 500),
  created_at timestamptz not null default now()
);

create unique index service_ratings_session_client_staff_uq
  on public.service_ratings (session_id, client_token_hash, coalesce(staff_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index service_ratings_session_idx on public.service_ratings (session_id, created_at desc);
create index service_ratings_staff_idx on public.service_ratings (staff_id, created_at desc);

alter table public.service_ratings enable row level security;

create policy service_ratings_staff_read on public.service_ratings for select to authenticated
  using (public.current_staff_role() is not null);

grant select on public.service_ratings to authenticated;

-- RPC pública (anônimo/autenticado via token da mesa) para consultar a última sessão encerrada da mesa
-- e listar os garçons/atendentes que atenderam aquela sessão, além de verificar se este dispositivo já avaliou.
create or replace function public.get_ratable_closed_session(
  p_table_token text,
  p_client_token text
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_table record;
  v_open_exists boolean;
  v_session record;
  v_token_hash text;
  v_staff jsonb;
  v_existing_ratings jsonb;
begin
  select id, display_name, active into v_table
    from public.dining_tables
   where public_token = trim(coalesce(p_table_token, ''));

  if not found then
    return null;
  end if;

  v_token_hash := public.hash_client_token(p_client_token);

  -- Busca a última sessão ENCERRADA desta mesa nas últimas 24 horas.
  -- Se houver uma nova sessão já aberta na mesa, só retorna a sessão encerrada caso este dispositivo
  -- tenha feito pedidos ou chamados nela (para não exibir avaliação de clientes anteriores a uma nova mesa).
  select exists (
    select 1 from public.table_sessions where table_id = v_table.id and status = 'open'
  ) into v_open_exists;

  select s.id, s.opened_at, s.closed_at, s.opened_by, s.closed_by
    into v_session
    from public.table_sessions s
   where s.table_id = v_table.id
     and s.status = 'closed'
     and s.closed_at >= now() - interval '24 hours'
     and (
       not v_open_exists
       or exists (
         select 1 from public.orders o
          where o.session_id = s.id and o.client_token_hash = v_token_hash
       )
       or exists (
         select 1 from public.service_calls c
          where c.session_id = s.id and c.client_token_hash = v_token_hash
       )
     )
   order by s.closed_at desc
   limit 1;

  if not found then
    return null;
  end if;

  -- Identifica todos os funcionários que atuaram diretamente no atendimento desta sessão
  -- (abertura, verificação/confirmação/entrega de pedidos, atendimento de chamados, fechamento/recebimento)
  with session_staff_ids as (
    select v_session.opened_by as staff_id where v_session.opened_by is not null
    union
    select v_session.closed_by as staff_id where v_session.closed_by is not null
    union
    select o.claimed_by from public.orders o where o.session_id = v_session.id and o.claimed_by is not null
    union
    select o.confirmed_by from public.orders o where o.session_id = v_session.id and o.confirmed_by is not null
    union
    select o.delivered_by from public.orders o where o.session_id = v_session.id and o.delivered_by is not null
    union
    select c.handled_by from public.service_calls c where c.session_id = v_session.id and c.handled_by is not null
    union
    select c.resolved_by from public.service_calls c where c.session_id = v_session.id and c.resolved_by is not null
    union
    select sp.recorded_by from public.session_payments sp where sp.session_id = v_session.id and sp.recorded_by is not null
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'role', p.role
      )
      order by p.full_name
    ),
    '[]'::jsonb
  )
  into v_staff
  from public.profiles p
  where p.id in (select staff_id from session_staff_ids)
    and p.role in ('attendant', 'manager', 'admin');

  -- Caso nenhum perfil específico tenha sido capturado (ex.: sessão sem interações extras), lista atendentes ativos
  if v_staff is null or jsonb_array_length(v_staff) = 0 then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'full_name', p.full_name,
          'role', p.role
        )
        order by p.full_name
      ),
      '[]'::jsonb
    )
    into v_staff
    from public.profiles p
    where p.active = true
      and p.role in ('attendant', 'manager', 'admin');
  end if;

  -- Avaliações já enviadas por este dispositivo para esta sessão
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'staff_id', r.staff_id,
        'staff_name', r.staff_name_snapshot,
        'stars', r.stars,
        'comment', r.comment,
        'created_at', r.created_at
      )
      order by r.created_at desc
    ),
    '[]'::jsonb
  )
  into v_existing_ratings
  from public.service_ratings r
  where r.session_id = v_session.id
    and r.client_token_hash = v_token_hash;

  return jsonb_build_object(
    'session_id', v_session.id,
    'closed_at', v_session.closed_at,
    'staff', v_staff,
    'my_ratings', v_existing_ratings
  );
end;
$$;

-- RPC pública para o cliente registrar a avaliação de atendimento da sessão encerrada
create or replace function public.submit_service_rating(
  p_table_token text,
  p_client_token text,
  p_session_id uuid,
  p_staff_id uuid,
  p_stars int,
  p_comment text default null,
  p_customer_name text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table record;
  v_session record;
  v_staff record;
  v_token_hash text;
  v_clean_comment text;
  v_clean_name text;
  v_rating_id uuid;
  v_staff_name text := 'Equipe de Atendimento';
begin
  if length(trim(coalesce(p_client_token, ''))) < 12 then
    raise exception 'TOKEN_CLIENTE_INVALIDO';
  end if;

  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'NOTA_INVALIDA';
  end if;

  select id, display_name into v_table
    from public.dining_tables
   where public_token = trim(coalesce(p_table_token, ''));

  if not found then
    raise exception 'MESA_INVALIDA';
  end if;

  select id, table_id, status, closed_at into v_session
    from public.table_sessions
   where id = p_session_id
     and table_id = v_table.id;

  if not found then
    raise exception 'SESSAO_INVALIDA';
  end if;

  if v_session.status <> 'closed' then
    raise exception 'SESSAO_AINDA_ABERTA';
  end if;

  if p_staff_id is not null then
    select id, full_name into v_staff
      from public.profiles
     where id = p_staff_id;
    if not found then
      raise exception 'FUNCIONARIO_INVALIDO';
    end if;
    v_staff_name := v_staff.full_name;
  end if;

  v_token_hash := public.hash_client_token(p_client_token);
  v_clean_comment := nullif(left(trim(coalesce(p_comment, '')), 500), '');
  v_clean_name := nullif(left(trim(coalesce(p_customer_name, '')), 60), '');

  insert into public.service_ratings (
    session_id,
    table_id,
    staff_id,
    staff_name_snapshot,
    client_token_hash,
    customer_name,
    stars,
    comment
  )
  values (
    v_session.id,
    v_table.id,
    p_staff_id,
    v_staff_name,
    v_token_hash,
    v_clean_name,
    p_stars,
    v_clean_comment
  )
  on conflict (session_id, client_token_hash, coalesce(staff_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set
    stars = excluded.stars,
    comment = excluded.comment,
    customer_name = coalesce(excluded.customer_name, public.service_ratings.customer_name)
  returning id into v_rating_id;

  perform public.write_audit(
    'session.rate_service',
    'service_rating',
    v_rating_id::text,
    jsonb_build_object(
      'session_id', v_session.id,
      'table_id', v_table.id,
      'staff_id', p_staff_id,
      'staff_name', v_staff_name,
      'stars', p_stars
    )
  );

  return jsonb_build_object(
    'id', v_rating_id,
    'session_id', v_session.id,
    'staff_id', p_staff_id,
    'staff_name', v_staff_name,
    'stars', p_stars
  );
end;
$$;

revoke all on function public.get_ratable_closed_session(text, text) from public;
grant execute on function public.get_ratable_closed_session(text, text) to anon, authenticated;

revoke all on function public.submit_service_rating(text, text, uuid, uuid, int, text, text) from public;
grant execute on function public.submit_service_rating(text, text, uuid, uuid, int, text, text) to anon, authenticated;
