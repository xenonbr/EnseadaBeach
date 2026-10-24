-- ATENÇÃO: destrutivo. Só executar com autorização explícita e backup.
drop function if exists public.place_order(text,text,text,text,text,jsonb),
  public.get_my_orders(text,text),
  public.claim_order_verification(uuid,int),
  public.confirm_order_presencial(uuid,int),
  public.cancel_order(uuid,text,int),
  public.hash_client_token(text),
  public.guard_production_task_confirmed();

create or replace function public.session_has_pending(p_session_id uuid) returns boolean
language sql stable security definer set search_path = public as $$ select false $$;

drop table if exists public.order_events, public.production_tasks, public.order_item_options, public.order_items, public.orders cascade;
drop type if exists public.task_status, public.order_status;
