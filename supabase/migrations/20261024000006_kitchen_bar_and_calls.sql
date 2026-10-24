-- 20261024000006_kitchen_bar_and_calls: operação de cozinha/bar, transição parcial/integral, entrega e chamadas de atendente.
-- Reversão: supabase/rollback/0006_down.sql

create type public.service_call_status as enum (
  'PENDENTE',
  'EM_ATENDIMENTO',
  'ATENDIDA',
  'CANCELADA'
);

create type public.service_call_reason as enum (
  'AJUDA',
  'DUVIDA',
  'PEDIR_CONTA',
  'OUTRO'
);

create table public.service_calls (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.table_sessions(id) on delete restrict,
  table_id uuid not null references public.dining_tables(id) on delete restrict,
  client_token_hash text not null,
  reason public.service_call_reason not null default 'AJUDA',
  details text check (details is null or length(details) <= 250),
  status public.service_call_status not null default 'PENDENTE',
  handled_by uuid references public.profiles(id) on delete restrict,
  handled_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete restrict,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index service_calls_status_idx on public.service_calls (status, created_at asc);
create index service_calls_session_idx on public.service_calls (session_id, created_at desc);

create trigger service_calls_touch before update on public.service_calls
  for each row execute function public.touch_updated_at();

alter table public.service_calls enable row level security;

create policy service_calls_staff_read on public.service_calls for select to authenticated
  using (public.has_role('admin','manager','attendant'));

grant select on public.service_calls to authenticated;

-- Cozinha/Bar ou Admin/Gerente inicia preparo de uma tarefa do seu setor
create function public.start_production_task(p_task_id uuid)
returns public.order_status
language plpgsql security definer set search_path = public as $$
declare
  v_task record;
  v_ord record;
  v_next_status public.order_status;
begin
  select * into v_task from public.production_tasks where id = p_task_id for update;
  if not found then raise exception 'TAREFA_INEXISTENTE'; end if;

  if not (
    public.has_role('admin','manager')
    or (public.has_role('kitchen') and v_task.sector = 'kitchen')
    or (public.has_role('bar') and v_task.sector = 'bar')
  ) then
    raise exception 'SEM_PERMISSAO_SETOR' using errcode = '42501';
  end if;

  select * into v_ord from public.orders where id = v_task.order_id for update;
  if v_ord.status in ('CANCELADO', 'ENTREGUE') or v_task.status = 'CANCELLED' then
    raise exception 'TRANSICAO_INVALIDA';
  end if;

  -- Idempotência: se já está IN_PROGRESS ou READY, apenas retorna status atual
  if v_task.status in ('IN_PROGRESS', 'READY') then
    return v_ord.status;
  end if;

  update public.production_tasks
     set status = 'IN_PROGRESS',
         started_by = auth.uid(),
         started_at = now()
   where id = p_task_id;

  v_next_status := case
    when v_ord.status = 'CONFIRMADO' then 'EM_PREPARACAO'::public.order_status
    else v_ord.status
  end;

  if v_next_status <> v_ord.status then
    update public.orders
       set status = v_next_status,
           version = v_ord.version + 1
     where id = v_ord.id;

    insert into public.order_events (order_id, from_status, to_status, actor_id, details)
    values (v_ord.id, v_ord.status, v_next_status, auth.uid(), jsonb_build_object('sector', v_task.sector));
  end if;

  perform public.write_audit('task.start', 'production_task', p_task_id::text,
    jsonb_build_object('order_id', v_ord.id, 'sector', v_task.sector));

  return v_next_status;
end $$;

-- Cozinha/Bar ou Admin/Gerente conclui preparo da tarefa do setor;
-- Pedido só fica PRONTO quando TODAS as tarefas ativas estiverem READY, caso contrário fica PARCIALMENTE_PRONTO.
create function public.complete_production_task(p_task_id uuid)
returns public.order_status
language plpgsql security definer set search_path = public as $$
declare
  v_task record;
  v_ord record;
  v_pending_count int;
  v_next_status public.order_status;
begin
  select * into v_task from public.production_tasks where id = p_task_id for update;
  if not found then raise exception 'TAREFA_INEXISTENTE'; end if;

  if not (
    public.has_role('admin','manager')
    or (public.has_role('kitchen') and v_task.sector = 'kitchen')
    or (public.has_role('bar') and v_task.sector = 'bar')
  ) then
    raise exception 'SEM_PERMISSAO_SETOR' using errcode = '42501';
  end if;

  select * into v_ord from public.orders where id = v_task.order_id for update;
  if v_ord.status in ('CANCELADO', 'ENTREGUE') or v_task.status = 'CANCELLED' then
    raise exception 'TRANSICAO_INVALIDA';
  end if;

  if v_task.status = 'READY' then
    return v_ord.status;
  end if;

  update public.production_tasks
     set status = 'READY',
         started_by = coalesce(v_task.started_by, auth.uid()),
         started_at = coalesce(v_task.started_at, now()),
         completed_by = auth.uid(),
         completed_at = now()
   where id = p_task_id;

  select count(*) into v_pending_count
    from public.production_tasks
   where order_id = v_ord.id
     and status <> 'CANCELLED'
     and status <> 'READY';

  v_next_status := case
    when v_pending_count = 0 then 'PRONTO'::public.order_status
    else 'PARCIALMENTE_PRONTO'::public.order_status
  end;

  if v_next_status <> v_ord.status then
    update public.orders
       set status = v_next_status,
           version = v_ord.version + 1
     where id = v_ord.id;

    insert into public.order_events (order_id, from_status, to_status, actor_id, details)
    values (v_ord.id, v_ord.status, v_next_status, auth.uid(), jsonb_build_object('sector', v_task.sector));
  end if;

  perform public.write_audit('task.complete', 'production_task', p_task_id::text,
    jsonb_build_object('order_id', v_ord.id, 'sector', v_task.sector, 'order_status', v_next_status));

  return v_next_status;
end $$;

-- Permite que Cozinha/Bar (do respectivo setor) ou Admin/Gerente marque produto como indisponível em caso de falta de insumo
create function public.set_product_availability_sector(p_product_id uuid, p_available boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prod record;
begin
  select id, sector, available into v_prod from public.products where id = p_product_id for update;
  if not found then raise exception 'PRODUTO_INEXISTENTE'; end if;

  if not (
    public.has_role('admin','manager')
    or (public.has_role('kitchen') and v_prod.sector = 'kitchen')
    or (public.has_role('bar') and v_prod.sector = 'bar')
  ) then
    raise exception 'SEM_PERMISSAO_SETOR' using errcode = '42501';
  end if;

  update public.products set available = p_available where id = p_product_id;
  perform public.write_audit('product.sector_availability', 'product', p_product_id::text,
    jsonb_build_object('available', p_available));
end $$;

-- Atendente/Gerente/Admin registra entrega do pedido na mesa (somente quando PRONTO; pedido entregue NÃO significa pago)
create function public.mark_order_delivered(p_order_id uuid, p_expected_version int default null)
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

  if v_ord.status = 'ENTREGUE' then
    return v_ord.version;
  end if;

  if v_ord.status <> 'PRONTO' then
    raise exception 'PEDIDO_AINDA_NAO_PRONTO';
  end if;

  if p_expected_version is not null and v_ord.version <> p_expected_version then
    raise exception 'CONFLITO_VERSAO';
  end if;

  v_new_version := v_ord.version + 1;
  update public.orders
     set status = 'ENTREGUE',
         delivered_by = auth.uid(),
         delivered_at = now(),
         version = v_new_version
   where id = p_order_id;

  insert into public.order_events (order_id, from_status, to_status, actor_id)
  values (p_order_id, 'PRONTO', 'ENTREGUE', auth.uid());

  perform public.write_audit('order.deliver', 'order', p_order_id::text,
    jsonb_build_object('version', v_new_version));

  return v_new_version;
end $$;

-- Cliente na mesa abre chamado de atendimento ("Chamar atendente") com prevenção de chamadas repetidas
create function public.create_service_call(
  p_table_token text,
  p_client_token text,
  p_reason public.service_call_reason default 'AJUDA',
  p_details text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_table record;
  v_session_id uuid;
  v_token_hash text;
  v_existing record;
  v_call_id uuid;
begin
  if length(trim(coalesce(p_client_token, ''))) < 12 then
    raise exception 'TOKEN_CLIENTE_INVALIDO';
  end if;
  v_token_hash := public.hash_client_token(p_client_token);

  select id, active into v_table
    from public.dining_tables
   where public_token = trim(coalesce(p_table_token, ''));
  if not found or not v_table.active then
    raise exception 'MESA_INATIVA_OU_INVALIDA';
  end if;

  select id into v_session_id
    from public.table_sessions
   where table_id = v_table.id and status = 'open';
  if not found then
    raise exception 'SESSAO_FECHADA';
  end if;

  -- Rate limit / deduplicação: se já houver chamado PENDENTE ou EM_ATENDIMENTO recente desta mesa pelo mesmo motivo, retorna-o
  select id, status, reason, created_at
    into v_existing
    from public.service_calls
   where session_id = v_session_id
     and reason = p_reason
     and status in ('PENDENTE', 'EM_ATENDIMENTO')
   order by created_at desc
   limit 1;

  if found then
    return jsonb_build_object(
      'call_id', v_existing.id,
      'status', v_existing.status,
      'reason', v_existing.reason,
      'created_at', v_existing.created_at,
      'already_open', true
    );
  end if;

  -- Limite adicional por dispositivo: máximo 1 chamado novo a cada 45 segundos
  if exists (
    select 1 from public.service_calls
    where session_id = v_session_id
      and client_token_hash = v_token_hash
      and created_at > now() - interval '45 seconds'
  ) then
    raise exception 'AGUARDE_PARA_NOVA_CHAMADA';
  end if;

  insert into public.service_calls (session_id, table_id, client_token_hash, reason, details)
  values (v_session_id, v_table.id, v_token_hash, p_reason, nullif(trim(coalesce(p_details, '')), ''))
  returning id into v_call_id;

  perform public.write_audit('service_call.create', 'service_call', v_call_id::text,
    jsonb_build_object('table_id', v_table.id, 'reason', p_reason));

  return jsonb_build_object(
    'call_id', v_call_id,
    'status', 'PENDENTE',
    'reason', p_reason,
    'created_at', now(),
    'already_open', false
  );
end $$;

-- Atendente atualiza estado do chamado (EM_ATENDIMENTO, ATENDIDA, CANCELADA)
create function public.update_service_call_status(
  p_call_id uuid,
  p_next_status public.service_call_status,
  p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_call record;
begin
  if not public.has_role('admin','manager','attendant') then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;

  select * into v_call from public.service_calls where id = p_call_id for update;
  if not found then raise exception 'CHAMADO_INEXISTENTE'; end if;

  if v_call.status in ('ATENDIDA', 'CANCELADA') then
    return;
  end if;

  if p_next_status = 'EM_ATENDIMENTO' then
    update public.service_calls
       set status = 'EM_ATENDIMENTO',
           handled_by = auth.uid(),
           handled_at = now()
     where id = p_call_id;
  elsif p_next_status in ('ATENDIDA', 'CANCELADA') then
    update public.service_calls
       set status = p_next_status,
           handled_by = coalesce(v_call.handled_by, auth.uid()),
           handled_at = coalesce(v_call.handled_at, now()),
           resolved_by = auth.uid(),
           resolved_at = now(),
           resolution_note = nullif(trim(coalesce(p_note, '')), '')
     where id = p_call_id;
  else
    raise exception 'TRANSICAO_INVALIDA';
  end if;

  perform public.write_audit('service_call.update', 'service_call', p_call_id::text,
    jsonb_build_object('status', p_next_status));
end $$;

revoke all on function public.start_production_task(uuid),
  public.complete_production_task(uuid),
  public.set_product_availability_sector(uuid,boolean),
  public.mark_order_delivered(uuid,int),
  public.create_service_call(text,text,public.service_call_reason,text),
  public.update_service_call_status(uuid,public.service_call_status,text) from public;

grant execute on function public.create_service_call(text,text,public.service_call_reason,text) to anon, authenticated;

grant execute on function public.start_production_task(uuid),
  public.complete_production_task(uuid),
  public.set_product_availability_sector(uuid,boolean),
  public.mark_order_delivered(uuid,int),
  public.update_service_call_status(uuid,public.service_call_status,text) to authenticated;
