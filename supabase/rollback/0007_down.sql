-- ATENÇÃO: destrutivo. Só executar com autorização explícita e backup.
create or replace function public.session_has_pending(p_session_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orders
    where session_id = p_session_id
      and status not in ('ENTREGUE', 'CANCELADO')
  )
$$;

drop function if exists public.record_session_adjustment(uuid,integer,text),
  public.reverse_session_payment(uuid,text),
  public.record_session_payment(uuid,integer,public.payment_method,text,text,text,uuid),
  public.get_session_account_summary(uuid);

drop table if exists public.session_adjustments, public.session_payments cascade;
drop type if exists public.payment_method;
