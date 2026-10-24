-- 20261024000005_orders_and_confirmation: pedidos, snapshots imutáveis, confirmação presencial obrigatória e tarefas de produção.
-- Reversão: supabase/rollback/0005_down.sql

create type public.order_status as enum (
  'AGUARDANDO_CONFIRMACAO',
  'EM_VERIFICACAO',
  'CONFIRMADO',
  'EM_PREPARACAO',
  'PARCIALMENTE_PRONTO',
  'PRONTO',
  'ENTREGUE',
  'CANCELADO'
);

create type public.task_status as enum (
  'PENDING',
  'IN_PROGRESS',
  'READY',
  'CANCELLED'
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.table_sessions(id) on delete restrict,
  table_id uuid not null references public.dining_tables(id) on delete restrict,
  order_number int not null,
  status public.order_status not null default 'AGUARDANDO_CONFIRMACAO',
  customer_name text check (customer_name is null or length(trim(customer_name)) between 1 and 60),
  client_token_hash text not null,
  idempotency_key text not null unique check (length(trim(idempotency_key)) between 8 and 120),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  notes text check (notes is null or length(notes) <= 500),
  version int not null default 1,
  claimed_by uuid references public.profiles(id) on delete restrict,
  claimed_at timestamptz,
  confirmed_by uuid references public.profiles(id) on delete restrict,
  confirmed_at timestamptz,
  delivered_by uuid references public.profiles(id) on delete restrict,
  delivered_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete restrict,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_cents = subtotal_cents),
  check (status <> 'CONFIRMADO' or (confirmed_by is not null and confirmed_at is not null)),
  check (status <> 'CANCELADO' or (cancelled_by is not null and cancelled_at is not null and length(trim(coalesce(cancel_reason, ''))) > 0))
);

create unique index orders_session_order_number_uq on public.orders (session_id, order_number);
create index orders_session_idx on public.orders (session_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at asc);
create index orders_client_lookup_idx on public.orders (session_id, client_token_hash);

create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name_snapshot text not null,
  unit_price_cents_snapshot integer not null check (unit_price_cents_snapshot >= 0),
  options_price_cents_snapshot integer not null default 0 check (options_price_cents_snapshot >= 0),
  quantity integer not null check (quantity > 0 and quantity <= 50),
  line_total_cents integer not null check (line_total_cents >= 0),
  sector_snapshot public.production_sector not null,
  notes text check (notes is null or length(notes) <= 300),
  check (line_total_cents = quantity * (unit_price_cents_snapshot + options_price_cents_snapshot))
);
create index order_items_order_idx on public.order_items (order_id);

create table public.order_item_options (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  option_id uuid not null references public.options(id) on delete restrict,
  group_name_snapshot text not null,
  option_name_snapshot text not null,
  price_cents_snapshot integer not null check (price_cents_snapshot >= 0)
);
create index order_item_options_item_idx on public.order_item_options (order_item_id);

-- Tarefas de produção por setor (só existem para pedidos CONFIRMADOS)
create table public.production_tasks (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  sector public.production_sector not null,
  status public.task_status not null default 'PENDING',
  started_by uuid references public.profiles(id) on delete restrict,
  started_at timestamptz,
  completed_by uuid references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, sector)
);
create index production_tasks_sector_status_idx on public.production_tasks (sector, status, created_at asc);

create trigger production_tasks_touch before update on public.production_tasks
  for each row execute function public.touch_updated_at();

-- Garantir no banco que nenhuma tarefa de produção seja criada para pedido não confirmado
create function public.guard_production_task_confirmed() returns trigger
language plpgsql as $$
declare v_status public.order_status;
begin
  select status into v_status from public.orders where id = new.order_id;
  if v_status not in ('CONFIRMADO','EM_PREPARACAO','PARCIALMENTE_PRONTO','PRONTO','ENTREGUE') then
    raise exception 'PEDIDO_NAO_CONFIRMADO: tarefas de produção exigem confirmação presencial prévia';
  end if;
  return new;
end $$;
create trigger production_tasks_guard_confirmed before insert on public.production_tasks
  for each row execute function public.guard_production_task_confirmed();

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  actor_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at asc);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_options enable row level security;
alter table public.production_tasks enable row level security;
alter table public.order_events enable row level security;

-- Políticas de leitura para equipe autenticada (clientes anônimos usam RPCs com token próprio)
create policy orders_staff_read on public.orders for select to authenticated
  using (public.current_staff_role() is not null);
create policy order_items_staff_read on public.order_items for select to authenticated
  using (public.current_staff_role() is not null);
create policy order_item_options_staff_read on public.order_item_options for select to authenticated
  using (public.current_staff_role() is not null);
create policy production_tasks_staff_read on public.production_tasks for select to authenticated
  using (
    public.has_role('admin','manager','attendant')
    or (public.has_role('kitchen') and sector = 'kitchen')
    or (public.has_role('bar') and sector = 'bar')
  );
create policy order_events_staff_read on public.order_events for select to authenticated
  using (public.has_role('admin','manager','attendant'));

grant select on public.orders, public.order_items, public.order_item_options, public.production_tasks, public.order_events to authenticated;

-- Atualiza verificação de pendências na sessão: bloqueia encerrar sessão se houver pedidos em aberto (não ENTREGUE e não CANCELADO)
create or replace function public.session_has_pending(p_session_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orders
    where session_id = p_session_id
      and status not in ('ENTREGUE', 'CANCELADO')
  )
$$;

-- Helper para hash do token do dispositivo do cliente
create function public.hash_client_token(p_token text) returns text
language sql immutable as $$
  select encode(sha256(convert_to(trim(coalesce(p_token, '')), 'UTF8')), 'hex')
$$;

-- Criação transacional de pedido pelo cliente na mesa:
-- 1. Valida token da mesa, mesa ativa e sessão aberta.
-- 2. Verifica idempotency_key (retorna pedido já criado em caso de retry/clique duplo).
-- 3. Recalcula preços exclusivamente a partir do banco e grava snapshots imutáveis.
-- 4. Valida disponibilidade, status de publicação e limites min/max de grupos de adicionais.
-- 5. Nasce obrigatoriamente em AGUARDANDO_CONFIRMACAO (sem criar tarefas de produção).
create function public.place_order(
  p_table_token text,
  p_client_token text,
  p_idempotency_key text,
  p_customer_name text,
  p_notes text,
  p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_table record;
  v_session_id uuid;
  v_token_hash text;
  v_existing record;
  v_order_id uuid;
  v_order_number int;
  v_subtotal int := 0;
  v_item jsonb;
  v_prod record;
  v_qty int;
  v_item_notes text;
  v_opt_ids uuid[];
  v_opts_price int;
  v_line_total int;
  v_order_item_id uuid;
  v_grp record;
  v_cnt int;
  v_opt record;
begin
  if length(trim(coalesce(p_client_token, ''))) < 12 then
    raise exception 'TOKEN_CLIENTE_INVALIDO';
  end if;
  if length(trim(coalesce(p_idempotency_key, ''))) < 8 then
    raise exception 'IDEMPOTENCY_KEY_INVALIDA';
  end if;
  v_token_hash := public.hash_client_token(p_client_token);

  -- Idempotência: se já existe pedido com esta chave para o mesmo cliente, retorna-o sem duplicar
  select id, order_number, status, total_cents, created_at
    into v_existing
    from public.orders
   where idempotency_key = trim(p_idempotency_key);
  if found then
    if exists (select 1 from public.orders where id = v_existing.id and client_token_hash = v_token_hash) then
      return jsonb_build_object(
        'order_id', v_existing.id,
        'order_number', v_existing.order_number,
        'status', v_existing.status,
        'total_cents', v_existing.total_cents,
        'created_at', v_existing.created_at,
        'idempotent_replay', true
      );
    else
      raise exception 'IDEMPOTENCY_CONFLITO';
    end if;
  end if;

  select id, active into v_table
    from public.dining_tables
   where public_token = trim(coalesce(p_table_token, ''));
  if not found or not v_table.active then
    raise exception 'MESA_INATIVA_OU_INVALIDA';
  end if;

  select id into v_session_id
    from public.table_sessions
   where table_id = v_table.id and status = 'open'
   for share;
  if not found then
    raise exception 'SESSAO_FECHADA';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'CARRINHO_VAZIO';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'LIMITE_ITENS_EXCEDIDO';
  end if;

  -- Número sequencial por sessão (serializado por lock na linha da sessão)
  perform 1 from public.table_sessions where id = v_session_id for update;
  select coalesce(max(order_number), 0) + 1 into v_order_number
    from public.orders where session_id = v_session_id;

  insert into public.orders (
    session_id, table_id, order_number, status, customer_name,
    client_token_hash, idempotency_key, subtotal_cents, total_cents, notes
  ) values (
    v_session_id, v_table.id, v_order_number, 'AGUARDANDO_CONFIRMACAO',
    nullif(trim(coalesce(p_customer_name, '')), ''),
    v_token_hash, trim(p_idempotency_key), 0, 0,
    nullif(trim(coalesce(p_notes, '')), '')
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty < 1 or v_qty > 50 then
      raise exception 'QUANTIDADE_INVALIDA';
    end if;
    v_item_notes := nullif(trim(coalesce(v_item->>'notes', '')), '');

    select p.id, p.name, p.price_cents, p.available, p.status, p.sector, c.status as cat_status
      into v_prod
      from public.products p
      join public.menu_categories c on c.id = p.category_id
     where p.id = (v_item->>'product_id')::uuid;

    if not found or v_prod.status <> 'published' or v_prod.cat_status <> 'published' or not v_prod.available then
      raise exception 'PRODUTO_INDISPONIVEL';
    end if;

    select coalesce(array_agg( distinct (x)::uuid ), array[]::uuid[])
      into v_opt_ids
      from jsonb_array_elements_text(coalesce(v_item->'option_ids', '[]'::jsonb)) x;

    -- Verifica se todas as opções enviadas pertencem a este produto e estão disponíveis
    if cardinality(v_opt_ids) > 0 then
      select count(*) into v_cnt
        from public.options o
        join public.option_groups g on g.id = o.group_id
       where o.id = any(v_opt_ids)
         and g.product_id = v_prod.id
         and o.available = true;
      if v_cnt <> cardinality(v_opt_ids) then
        raise exception 'OPCAO_INVALIDA_OU_INDISPONIVEL';
      end if;
    end if;

    -- Valida limites min_select e max_select de cada grupo do produto
    for v_grp in select id, name, min_select, max_select from public.option_groups where product_id = v_prod.id loop
      select count(*) into v_cnt
        from public.options o
       where o.group_id = v_grp.id and o.id = any(v_opt_ids);
      if v_cnt < v_grp.min_select or v_cnt > v_grp.max_select then
        raise exception 'LIMITE_ADICIONAIS_INVALIDO';
      end if;
    end loop;

    select coalesce(sum(o.price_cents), 0) into v_opts_price
      from public.options o
     where o.id = any(v_opt_ids);

    v_line_total := v_qty * (v_prod.price_cents + v_opts_price);
    v_subtotal := v_subtotal + v_line_total;

    insert into public.order_items (
      order_id, product_id, product_name_snapshot,
      unit_price_cents_snapshot, options_price_cents_snapshot,
      quantity, line_total_cents, sector_snapshot, notes
    ) values (
      v_order_id, v_prod.id, v_prod.name,
      v_prod.price_cents, v_opts_price,
      v_qty, v_line_total, v_prod.sector, v_item_notes
    ) returning id into v_order_item_id;

    for v_opt in
      select o.id, g.name as group_name, o.name as option_name, o.price_cents
        from public.options o
        join public.option_groups g on g.id = o.group_id
       where o.id = any(v_opt_ids)
       order by g.sort_order, o.sort_order
    loop
      insert into public.order_item_options (
        order_item_id, option_id, group_name_snapshot, option_name_snapshot, price_cents_snapshot
      ) values (
        v_order_item_id, v_opt.id, v_opt.group_name, v_opt.option_name, v_opt.price_cents
      );
    end loop;
  end loop;

  update public.orders
     set subtotal_cents = v_subtotal,
         total_cents = v_subtotal
   where id = v_order_id;

  insert into public.order_events (order_id, from_status, to_status, actor_id, details)
  values (v_order_id, null, 'AGUARDANDO_CONFIRMACAO', null, jsonb_build_object('total_cents', v_subtotal));

  perform public.write_audit('order.place', 'order', v_order_id::text,
    jsonb_build_object('session_id', v_session_id, 'order_number', v_order_number, 'total_cents', v_subtotal));

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'status', 'AGUARDANDO_CONFIRMACAO',
    'total_cents', v_subtotal,
    'created_at', now(),
    'idempotent_replay', false
  );
end $$;

-- Consulta segura apenas dos próprios pedidos do dispositivo na sessão atual da mesa
create function public.get_my_orders(p_table_token text, p_client_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_session_id uuid;
  v_token_hash text;
begin
  if length(trim(coalesce(p_client_token, ''))) < 12 then
    return '[]'::jsonb;
  end if;
  v_token_hash := public.hash_client_token(p_client_token);

  select s.id into v_session_id
    from public.dining_tables t
    join public.table_sessions s on s.table_id = t.id and s.status = 'open'
   where t.public_token = trim(coalesce(p_table_token, ''));

  if not found then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'order_number', o.order_number,
        'status', o.status,
        'customer_name', o.customer_name,
        'total_cents', o.total_cents,
        'notes', o.notes,
        'cancel_reason', o.cancel_reason,
        'created_at', o.created_at,
        'confirmed_at', o.confirmed_at,
        'items', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', oi.id,
              'product_name', oi.product_name_snapshot,
              'quantity', oi.quantity,
              'unit_price_cents', oi.unit_price_cents_snapshot,
              'options_price_cents', oi.options_price_cents_snapshot,
              'line_total_cents', oi.line_total_cents,
              'notes', oi.notes,
              'options', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'group_name', oio.group_name_snapshot,
                    'option_name', oio.option_name_snapshot,
                    'price_cents', oio.price_cents_snapshot
                  )
                ) from public.order_item_options oio where oio.order_item_id = oi.id
              ), '[]'::jsonb)
            )
          ) from public.order_items oi where oi.order_id = o.id
        ), '[]'::jsonb)
      ) order by o.created_at desc
    )
    from public.orders o
    where o.session_id = v_session_id
      and o.client_token_hash = v_token_hash
  ), '[]'::jsonb);
end $$;

-- Atendente/gerente/admin assume a verificação presencial (claim com expiração de 5 minutos e controle de concorrência)
create function public.claim_order_verification(p_order_id uuid, p_expected_version int default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_ord record;
  v_new_version int;
begin
  if not public.has_role('admin','manager','attendant') then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;

  select * into v_ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'PEDIDO_INEXISTENTE'; end if;

  if p_expected_version is not null and v_ord.version <> p_expected_version then
    raise exception 'CONFLITO_VERSAO';
  end if;

  if v_ord.status not in ('AGUARDANDO_CONFIRMACAO', 'EM_VERIFICACAO') then
    raise exception 'TRANSICAO_INVALIDA';
  end if;

  -- Se já está EM_VERIFICACAO por outro funcionário há menos de 5 minutos, impede tomada concorrente
  if v_ord.status = 'EM_VERIFICACAO'
     and v_ord.claimed_by is distinct from auth.uid()
     and v_ord.claimed_at > now() - interval '5 minutes' then
    raise exception 'EM_VERIFICACAO_POR_OUTRO_ATENDENTE';
  end if;

  v_new_version := v_ord.version + 1;
  update public.orders
     set status = 'EM_VERIFICACAO',
         claimed_by = auth.uid(),
         claimed_at = now(),
         version = v_new_version
   where id = p_order_id;

  insert into public.order_events (order_id, from_status, to_status, actor_id)
  values (p_order_id, v_ord.status, 'EM_VERIFICACAO', auth.uid());

  perform public.write_audit('order.claim_verification', 'order', p_order_id::text,
    jsonb_build_object('version', v_new_version));

  return v_new_version;
end $$;

-- Confirmação presencial obrigatória: somente atendente/gerente/admin confirma e libera tarefas para cozinha/bar
create function public.confirm_order_presencial(p_order_id uuid, p_expected_version int default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_ord record;
  v_new_version int;
  v_sector public.production_sector;
begin
  if not public.has_role('admin','manager','attendant') then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;

  select * into v_ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'PEDIDO_INEXISTENTE'; end if;

  -- Idempotência: se já foi confirmado, retorna a versão atual sem duplicar tarefas
  if v_ord.status = 'CONFIRMADO' then
    return v_ord.version;
  end if;

  if p_expected_version is not null and v_ord.version <> p_expected_version then
    raise exception 'CONFLITO_VERSAO';
  end if;

  if v_ord.status not in ('AGUARDANDO_CONFIRMACAO', 'EM_VERIFICACAO') then
    raise exception 'TRANSICAO_INVALIDA';
  end if;

  if v_ord.status = 'EM_VERIFICACAO'
     and v_ord.claimed_by is distinct from auth.uid()
     and v_ord.claimed_at > now() - interval '5 minutes' then
    raise exception 'EM_VERIFICACAO_POR_OUTRO_ATENDENTE';
  end if;

  v_new_version := v_ord.version + 1;
  update public.orders
     set status = 'CONFIRMADO',
         claimed_by = coalesce(v_ord.claimed_by, auth.uid()),
         claimed_at = coalesce(v_ord.claimed_at, now()),
         confirmed_by = auth.uid(),
         confirmed_at = now(),
         version = v_new_version
   where id = p_order_id;

  -- Cria tarefas de produção por setor distinto presente nos itens do pedido
  for v_sector in
    select distinct sector_snapshot from public.order_items where order_id = p_order_id
  loop
    insert into public.production_tasks (order_id, sector, status)
    values (p_order_id, v_sector, 'PENDING')
    on conflict (order_id, sector) do nothing;
  end loop;

  insert into public.order_events (order_id, from_status, to_status, actor_id)
  values (p_order_id, v_ord.status, 'CONFIRMADO', auth.uid());

  perform public.write_audit('order.confirm_presencial', 'order', p_order_id::text,
    jsonb_build_object('version', v_new_version));

  return v_new_version;
end $$;

-- Cancelamento com motivo obrigatório e auditoria
create function public.cancel_order(p_order_id uuid, p_reason text, p_expected_version int default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_ord record;
  v_new_version int;
begin
  if not public.has_role('admin','manager','attendant') then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'MOTIVO_OBRIGATORIO';
  end if;

  select * into v_ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'PEDIDO_INEXISTENTE'; end if;

  if v_ord.status = 'CANCELADO' then
    return v_ord.version;
  end if;
  if v_ord.status = 'ENTREGUE' then
    raise exception 'TRANSICAO_INVALIDA';
  end if;
  -- Após início de preparo, somente admin ou gerente pode cancelar
  if v_ord.status in ('EM_PREPARACAO','PARCIALMENTE_PRONTO','PRONTO') and not public.has_role('admin','manager') then
    raise exception 'CANCELAMENTO_PREPARO_RESTRITO';
  end if;

  if p_expected_version is not null and v_ord.version <> p_expected_version then
    raise exception 'CONFLITO_VERSAO';
  end if;

  v_new_version := v_ord.version + 1;
  update public.orders
     set status = 'CANCELADO',
         cancelled_by = auth.uid(),
         cancelled_at = now(),
         cancel_reason = trim(p_reason),
         version = v_new_version
   where id = p_order_id;

  update public.production_tasks
     set status = 'CANCELLED'
   where order_id = p_order_id and status <> 'CANCELLED';

  insert into public.order_events (order_id, from_status, to_status, actor_id, details)
  values (p_order_id, v_ord.status, 'CANCELADO', auth.uid(), jsonb_build_object('reason', trim(p_reason)));

  perform public.write_audit('order.cancel', 'order', p_order_id::text,
    jsonb_build_object('from_status', v_ord.status, 'reason', trim(p_reason)));

  return v_new_version;
end $$;

revoke all on function public.place_order(text,text,text,text,text,jsonb),
  public.get_my_orders(text,text),
  public.claim_order_verification(uuid,int),
  public.confirm_order_presencial(uuid,int),
  public.cancel_order(uuid,text,int) from public;

grant execute on function public.place_order(text,text,text,text,text,jsonb),
  public.get_my_orders(text,text) to anon, authenticated;

grant execute on function public.claim_order_verification(uuid,int),
  public.confirm_order_presencial(uuid,int),
  public.cancel_order(uuid,text,int) to authenticated;
