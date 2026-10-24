-- 20261024000009_history_purge_and_closure: expurgo seguro de sessões fechadas e exclusão de pedidos cancelados.
-- Reversão: supabase/rollback/0009_down.sql

-- 1. Expurgo em lote de histórico fechado anterior a uma data (Fechamento de Período / Economia de Espaço)
create or replace function public.purge_closed_history(p_before_date timestamptz)
returns table (
  purged_sessions_count integer,
  purged_orders_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_ids uuid[];
  v_order_ids uuid[];
  v_sessions_count integer := 0;
  v_orders_count integer := 0;
begin
  -- Somente administradores podem realizar o fechamento e expurgo de histórico
  if not public.has_role('admin') then
    raise exception 'SEM_PERMISSAO';
  end if;

  if p_before_date is null then
    raise exception 'DATA_INVALIDA';
  end if;

  -- Seleciona apenas sessões FECHADAS anteriores à data/hora especificada
  select coalesce(array_agg(id), array[]::uuid[])
    into v_session_ids
    from public.table_sessions
   where status = 'closed'
     and closed_at < p_before_date;

  v_sessions_count := coalesce(array_length(v_session_ids, 1), 0);

  if v_sessions_count = 0 then
    return query select 0::integer, 0::integer;
    return;
  end if;

  -- Seleciona todos os pedidos vinculados a essas sessões fechadas
  select coalesce(array_agg(id), array[]::uuid[])
    into v_order_ids
    from public.orders
   where session_id = any(v_session_ids);

  v_orders_count := coalesce(array_length(v_order_ids, 1), 0);

  -- Remoção ordenada respeitando integridade referencial
  delete from public.session_payments where session_id = any(v_session_ids);
  delete from public.session_adjustments where session_id = any(v_session_ids);
  delete from public.service_calls where session_id = any(v_session_ids);

  if v_orders_count > 0 then
    delete from public.production_tasks where order_id = any(v_order_ids);
    delete from public.order_item_options
     where order_item_id in (select id from public.order_items where order_id = any(v_order_ids));
    delete from public.order_items where order_id = any(v_order_ids);
    delete from public.orders where id = any(v_order_ids);
  end if;

  delete from public.table_sessions where id = any(v_session_ids);

  -- Registra auditoria irrevogável da limpeza
  perform public.write_audit(
    'history.purge',
    'table_sessions',
    null,
    jsonb_build_object(
      'before_date', p_before_date,
      'purged_sessions', v_sessions_count,
      'purged_orders', v_orders_count
    )
  );

  return query select v_sessions_count, v_orders_count;
end;
$$;

-- Sobrecarga para aceitar diretamente o tipo DATE
create or replace function public.purge_closed_history(p_before_date date)
returns table (
  purged_sessions_count integer,
  purged_orders_count integer
)
language sql
security definer
set search_path = public
as $$
  select * from public.purge_closed_history(p_before_date::timestamptz);
$$;

-- 2. Exclusão de pedido individual cancelado (para limpeza operacional da tela de pedidos)
create or replace function public.delete_cancelled_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.order_status;
  v_session_id uuid;
  v_order_number integer;
begin
  if not public.has_role('admin') then
    raise exception 'SEM_PERMISSAO';
  end if;

  select status, session_id, order_number
    into v_status, v_session_id, v_order_number
    from public.orders
   where id = p_order_id;

  if not found then
    raise exception 'PEDIDO_NAO_ENCONTRADO';
  end if;

  if v_status <> 'CANCELADO' then
    raise exception 'APENAS_PEDIDOS_CANCELADOS_PODEM_SER_EXCLUIDOS';
  end if;

  -- Impede exclusão caso haja algum pagamento vinculado especificamente a esse pedido
  if exists (select 1 from public.session_payments where order_id = p_order_id) then
    raise exception 'PEDIDO_POSSUI_PAGAMENTO_VINCULADO';
  end if;

  -- Remoção em cascata
  delete from public.production_tasks where order_id = p_order_id;
  delete from public.order_item_options
   where order_item_id in (select id from public.order_items where order_id = p_order_id);
  delete from public.order_items where order_id = p_order_id;
  delete from public.orders where id = p_order_id;

  perform public.write_audit(
    'order.delete_cancelled',
    'orders',
    p_order_id::text,
    jsonb_build_object(
      'session_id', v_session_id,
      'order_number', v_order_number
    )
  );

  return true;
end;
$$;

grant execute on function public.purge_closed_history(timestamptz) to authenticated;
grant execute on function public.purge_closed_history(date) to authenticated;
grant execute on function public.delete_cancelled_order(uuid) to authenticated;
