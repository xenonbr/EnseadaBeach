-- 20261024000007_billing_and_payments: consolidação de consumo por sessão, recebimentos manuais auditados, estornos e ajustes.
-- Reversão: supabase/rollback/0007_down.sql

create type public.payment_method as enum (
  'DINHEIRO',
  'PIX_PRESENCIAL',
  'CARTAO_DEBITO',
  'CARTAO_CREDITO',
  'OUTRO'
);

-- Recebimentos manuais confirmados presencialmente (sem gateway e sem dados de cartão).
-- Preparado arquiteturalmente para pagamento parcial/individual via order_id e payer_label opcionais.
create table public.session_payments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.table_sessions(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  payer_label text check (payer_label is null or length(trim(payer_label)) <= 60),
  method public.payment_method not null,
  amount_cents integer not null check (amount_cents > 0),
  reference text check (reference is null or length(trim(reference)) <= 120),
  idempotency_key text not null unique check (length(trim(idempotency_key)) between 8 and 120),
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references public.profiles(id) on delete restrict,
  reversal_reason text,
  check (
    (reversed_at is null and reversed_by is null and reversal_reason is null)
    or (reversed_at is not null and reversed_by is not null and length(trim(coalesce(reversal_reason, ''))) >= 3)
  )
);
create index session_payments_session_idx on public.session_payments (session_id, created_at desc);

-- Ajustes/descontos operacionais autorizados (somente admin ou gerente, com justificativa obrigatória).
create table public.session_adjustments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.table_sessions(id) on delete restrict,
  -- Valor negativo reduz o total devido (cortesia/desconto); positivo acrescenta ajuste autorizado
  amount_cents integer not null check (amount_cents <> 0),
  reason text not null check (length(trim(reason)) >= 3 and length(reason) <= 250),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index session_adjustments_session_idx on public.session_adjustments (session_id, created_at desc);

alter table public.session_payments enable row level security;
alter table public.session_adjustments enable row level security;

create policy session_payments_staff_read on public.session_payments for select to authenticated
  using (public.has_role('admin','manager','attendant'));
create policy session_adjustments_staff_read on public.session_adjustments for select to authenticated
  using (public.has_role('admin','manager','attendant'));

grant select on public.session_payments, public.session_adjustments to authenticated;

-- Cálculo oficial e determinístico do resumo financeiro da sessão (em centavos inteiros):
-- Consumo válido = soma de pedidos CONFIRMADO, EM_PREPARACAO, PARCIALMENTE_PRONTO, PRONTO, ENTREGUE.
-- Pedidos CANCELADO e pedidos ainda não confirmados (AGUARDANDO_CONFIRMACAO, EM_VERIFICACAO) não entram no consumo válido.
create function public.get_session_account_summary(p_session_id uuid)
returns table (
  consumed_cents integer,
  unconfirmed_cents integer,
  cancelled_cents integer,
  adjustments_cents integer,
  net_payable_cents integer,
  paid_cents integer,
  balance_due_cents integer,
  has_unsettled_orders boolean
)
language sql stable security definer set search_path = public as $$
  with ord as (
    select
      coalesce(sum(total_cents) filter (where status in ('CONFIRMADO','EM_PREPARACAO','PARCIALMENTE_PRONTO','PRONTO','ENTREGUE')), 0)::int as consumed,
      coalesce(sum(total_cents) filter (where status in ('AGUARDANDO_CONFIRMACAO','EM_VERIFICACAO')), 0)::int as unconfirmed,
      coalesce(sum(total_cents) filter (where status = 'CANCELADO'), 0)::int as cancelled,
      bool_or(status not in ('ENTREGUE','CANCELADO')) as unsettled
    from public.orders
    where session_id = p_session_id
  ),
  adj as (
    select coalesce(sum(amount_cents), 0)::int as adj_total
    from public.session_adjustments
    where session_id = p_session_id
  ),
  pay as (
    select coalesce(sum(amount_cents) filter (where reversed_at is null), 0)::int as paid_total
    from public.session_payments
    where session_id = p_session_id
  )
  select
    ord.consumed as consumed_cents,
    ord.unconfirmed as unconfirmed_cents,
    ord.cancelled as cancelled_cents,
    adj.adj_total as adjustments_cents,
    greatest(0, ord.consumed + adj.adj_total)::int as net_payable_cents,
    pay.paid_total as paid_cents,
    greatest(0, (ord.consumed + adj.adj_total) - pay.paid_total)::int as balance_due_cents,
    coalesce(ord.unsettled, false) as has_unsettled_orders
  from ord, adj, pay
$$;

-- Atualiza verificação de pendências na sessão:
-- Uma sessão tem pendências se houver pedido não entregue/não cancelado OU saldo pendente > 0.
create or replace function public.session_has_pending(p_session_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (s.has_unsettled_orders or s.balance_due_cents > 0)
  from public.get_session_account_summary(p_session_id) s
$$;

-- Registro manual de recebimento (com idempotency_key contra lançamento duplicado e trava contra pagamento acima do saldo)
create function public.record_session_payment(
  p_session_id uuid,
  p_amount_cents integer,
  p_method public.payment_method,
  p_idempotency_key text,
  p_reference text default null,
  p_payer_label text default null,
  p_order_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_existing_id uuid;
  v_summary record;
  v_pay_id uuid;
begin
  if not public.has_role('admin','manager','attendant') then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'VALOR_INVALIDO';
  end if;
  if length(trim(coalesce(p_idempotency_key, ''))) < 8 then
    raise exception 'IDEMPOTENCY_KEY_INVALIDA';
  end if;

  -- Serializa operações financeiras na sessão
  perform 1 from public.table_sessions where id = p_session_id for update;
  if not found then
    raise exception 'SESSAO_INEXISTENTE';
  end if;

  select id into v_existing_id
    from public.session_payments
   where idempotency_key = trim(p_idempotency_key);
  if found then
    return v_existing_id;
  end if;

  if p_order_id is not null then
    if not exists (select 1 from public.orders where id = p_order_id and session_id = p_session_id) then
      raise exception 'PEDIDO_NAO_PERTENCE_A_SESSAO';
    end if;
  end if;

  select * into v_summary from public.get_session_account_summary(p_session_id);
  if v_summary.balance_due_cents <= 0 then
    raise exception 'CONTA_JA_QUITADA';
  end if;
  if p_amount_cents > v_summary.balance_due_cents then
    raise exception 'VALOR_ACIMA_DO_SALDO_PENDENTE';
  end if;

  insert into public.session_payments (
    session_id, order_id, payer_label, method, amount_cents,
    reference, idempotency_key, recorded_by
  ) values (
    p_session_id, p_order_id, nullif(trim(coalesce(p_payer_label, '')), ''),
    p_method, p_amount_cents, nullif(trim(coalesce(p_reference, '')), ''),
    trim(p_idempotency_key), auth.uid()
  ) returning id into v_pay_id;

  perform public.write_audit('payment.record', 'session_payment', v_pay_id::text,
    jsonb_build_object(
      'session_id', p_session_id,
      'amount_cents', p_amount_cents,
      'method', p_method,
      'reference', p_reference,
      'payer_label', p_payer_label
    ));

  return v_pay_id;
end $$;

-- Estorno rastreável de recebimento (exige motivo e permissão de admin ou gerente)
create function public.reverse_session_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pay record;
begin
  if not public.has_role('admin','manager') then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'MOTIVO_OBRIGATORIO';
  end if;

  select * into v_pay from public.session_payments where id = p_payment_id for update;
  if not found then raise exception 'RECEBIMENTO_INEXISTENTE'; end if;
  if v_pay.reversed_at is not null then
    return;
  end if;

  update public.session_payments
     set reversed_at = now(),
         reversed_by = auth.uid(),
         reversal_reason = trim(p_reason)
   where id = p_payment_id;

  perform public.write_audit('payment.reverse', 'session_payment', p_payment_id::text,
    jsonb_build_object('session_id', v_pay.session_id, 'amount_cents', v_pay.amount_cents, 'reason', trim(p_reason)));
end $$;

-- Ajuste/desconto autorizado na conta da sessão (somente admin ou gerente, com motivo)
create function public.record_session_adjustment(
  p_session_id uuid,
  p_amount_cents integer,
  p_reason text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_adj_id uuid;
begin
  if not public.has_role('admin','manager') then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;
  if p_amount_cents is null or p_amount_cents = 0 then
    raise exception 'VALOR_INVALIDO';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'MOTIVO_OBRIGATORIO';
  end if;

  perform 1 from public.table_sessions where id = p_session_id for update;
  if not found then raise exception 'SESSAO_INEXISTENTE'; end if;

  insert into public.session_adjustments (session_id, amount_cents, reason, created_by)
  values (p_session_id, p_amount_cents, trim(p_reason), auth.uid())
  returning id into v_adj_id;

  perform public.write_audit('account.adjustment', 'session_adjustment', v_adj_id::text,
    jsonb_build_object('session_id', p_session_id, 'amount_cents', p_amount_cents, 'reason', trim(p_reason)));

  return v_adj_id;
end $$;

revoke all on function public.get_session_account_summary(uuid),
  public.record_session_payment(uuid,integer,public.payment_method,text,text,text,uuid),
  public.reverse_session_payment(uuid,text),
  public.record_session_adjustment(uuid,integer,text) from public, anon;

grant execute on function public.get_session_account_summary(uuid),
  public.record_session_payment(uuid,integer,public.payment_method,text,text,text,uuid),
  public.reverse_session_payment(uuid,text),
  public.record_session_adjustment(uuid,integer,text) to authenticated;
