import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { centsToInput, formatCents } from "@/lib/money";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";
import {
  closeSessionFromAccountAction,
  recordAdjustmentAction,
  recordPaymentAction,
  reversePaymentAction,
} from "../actions";

const METHOD_LABEL: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  PIX_PRESENCIAL: "PIX presencial / QR estático",
  CARTAO_DEBITO: "Cartão de débito (maquininha)",
  CARTAO_CREDITO: "Cartão de crédito (maquininha)",
  OUTRO: "Outro meio presencial",
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  AGUARDANDO_CONFIRMACAO: "Aguardando confirmação presencial (não compõe saldo)",
  EM_VERIFICACAO: "Em verificação presencial (não compõe saldo)",
  CONFIRMADO: "Confirmado",
  EM_PREPARACAO: "Em preparação",
  PARCIALMENTE_PRONTO: "Parcialmente pronto",
  PRONTO: "Pronto p/ entrega",
  ENTREGUE: "Entregue na mesa",
  CANCELADO: "Cancelado (excluído do consumo)",
};

type SummaryRow = {
  consumed_cents: number;
  unconfirmed_cents: number;
  cancelled_cents: number;
  adjustments_cents: number;
  net_payable_cents: number;
  paid_cents: number;
  balance_due_cents: number;
  has_unsettled_orders: boolean;
};

type SessionDetail = {
  id: string;
  status: "open" | "closed";
  opened_at: string;
  opened_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
  close_note: string | null;
  dining_tables: { id: string; display_name: string } | null;
  orders: {
    id: string;
    order_number: number;
    status: string;
    customer_name: string | null;
    total_cents: number;
    cancel_reason: string | null;
    created_at: string;
    confirmed_by: string | null;
    delivered_by: string | null;
    cancelled_by: string | null;
    order_items: {
      id: string;
      product_name_snapshot: string;
      quantity: number;
      line_total_cents: number;
      order_item_options: {
        group_name_snapshot: string;
        option_name_snapshot: string;
      }[];
    }[];
  }[];
  session_payments: {
    id: string;
    order_id: string | null;
    payer_label: string | null;
    method: string;
    amount_cents: number;
    reference: string | null;
    recorded_by: string | null;
    created_at: string;
    reversed_at: string | null;
    reversed_by: string | null;
    reversal_reason: string | null;
  }[];
  session_adjustments: {
    id: string;
    amount_cents: number;
    reason: string;
    created_by: string | null;
    created_at: string;
  }[];
};

type ServiceRatingRow = {
  id: string;
  staff_id: string | null;
  staff_name_snapshot: string;
  customer_name: string | null;
  stars: number;
  comment: string | null;
  created_at: string;
};

export default async function ContaSessaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const { supabase, profile } = await requireStaff(["admin", "manager", "attendant"]);
  const canManage = profile.role === "admin" || profile.role === "manager";
  const { sessionId } = await params;
  const { msg } = await searchParams;

  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) notFound();

  const [{ data: sessData }, { data: sumData }, { data: profilesData }, { data: ratingsData }] =
    await Promise.all([
      supabase
        .from("table_sessions")
        .select(
          "id, status, opened_at, opened_by, closed_at, closed_by, close_note, dining_tables(id, display_name), orders(id, order_number, status, customer_name, total_cents, cancel_reason, created_at, confirmed_by, delivered_by, cancelled_by, order_items(id, product_name_snapshot, quantity, line_total_cents, order_item_options(group_name_snapshot, option_name_snapshot))), session_payments(id, order_id, payer_label, method, amount_cents, reference, recorded_by, created_at, reversed_at, reversed_by, reversal_reason), session_adjustments(id, amount_cents, reason, created_by, created_at)",
        )
        .eq("id", sessionId)
        .maybeSingle(),
      supabase.rpc("get_session_account_summary", { p_session_id: sessionId }),
      supabase.from("profiles").select("id, full_name"),
      supabase
        .from("service_ratings")
        .select("id, staff_id, staff_name_snapshot, customer_name, stars, comment, created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false }),
    ]);

  if (!sessData) notFound();
  const sess = sessData as unknown as SessionDetail;
  const staffMap = new Map<string, string>();
  for (const p of (profilesData ?? []) as { id: string; full_name: string }[]) {
    staffMap.set(p.id, p.full_name);
  }
  const staffName = (id: string | null | undefined) =>
    id ? (staffMap.get(id) ?? "Funcionário") : null;
  const sessionRatings = (ratingsData ?? []) as ServiceRatingRow[];
  const summary: SummaryRow = (sumData?.[0] as SummaryRow) ?? {
    consumed_cents: 0,
    unconfirmed_cents: 0,
    cancelled_cents: 0,
    adjustments_cents: 0,
    net_payable_cents: 0,
    paid_cents: 0,
    balance_due_cents: 0,
    has_unsettled_orders: false,
  };

  const validOrders = sess.orders.filter(
    (o) =>
      o.status !== "CANCELADO" &&
      o.status !== "AGUARDANDO_CONFIRMACAO" &&
      o.status !== "EM_VERIFICACAO",
  );
  const canCloseSession =
    sess.status === "open" &&
    !summary.has_unsettled_orders &&
    summary.balance_due_cents === 0;

  return (
    <main className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/admin/contas" className="btn">
            ← Contas
          </Link>
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">
              Conta — {sess.dining_tables?.display_name ?? "Mesa"}
            </h1>
            <p className="text-xs text-slate-700">
              Aberta em{" "}
              {new Date(sess.opened_at).toLocaleString("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
              })}
              {sess.opened_by ? ` por ${staffName(sess.opened_by)}` : ""}
              {sess.closed_at
                ? ` • Encerrada em ${new Date(sess.closed_at).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}${sess.closed_by ? ` por ${staffName(sess.closed_by)}` : ""}`
                : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`chip ${sess.status === "open" ? "chip-open" : "chip-on"}`}>
            {sess.status === "open" ? "Sessão aberta" : "Sessão encerrada"}
          </span>
          <RealtimeRefresh
            tables={["orders", "session_payments", "session_adjustments", "table_sessions"]}
          />
        </div>
      </header>

      {msg && (
        <p role="status" className="rounded-xl border border-sky-400 bg-sky-50 p-3 text-sky-950">
          {msg}
        </p>
      )}

      {/* Resumo financeiro claramente separado */}
      <section aria-label="Resumo financeiro da sessão" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <p className="text-xs font-semibold uppercase text-slate-600">
            1. Consumo confirmado
          </p>
          <p className="mt-1 text-2xl font-bold">{formatCents(summary.consumed_cents)}</p>
          {summary.unconfirmed_cents > 0 && (
            <p className="mt-1 text-xs font-semibold text-amber-800">
              + {formatCents(summary.unconfirmed_cents)} aguardando confirmação
            </p>
          )}
        </div>

        <div className="card">
          <p className="text-xs font-semibold uppercase text-slate-600">
            2. Ajustes / Total Líquido
          </p>
          <p className="mt-1 text-2xl font-bold">{formatCents(summary.net_payable_cents)}</p>
          <p className="mt-1 text-xs text-slate-600">
            Ajustes: {formatCents(summary.adjustments_cents)} • Cancelados:{" "}
            {formatCents(summary.cancelled_cents)}
          </p>
        </div>

        <div className="card">
          <p className="text-xs font-semibold uppercase text-slate-600">
            3. Pagamento recebido
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-800">
            {formatCents(summary.paid_cents)}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Somente recebimentos presenciais confirmados
          </p>
        </div>

        <div className="card border-2 border-ocean">
          <p className="text-xs font-semibold uppercase text-ocean">4. Saldo pendente</p>
          <p className="mt-1 text-2xl font-bold text-ocean">
            {formatCents(summary.balance_due_cents)}
          </p>
          <p className="mt-1 text-xs text-slate-700">
            {summary.balance_due_cents === 0
              ? "Sem saldo financeiro pendente"
              : "Aguardando recebimento presencial"}
          </p>
        </div>
      </section>

      {/* Registro manual de recebimento e fechamento da sessão */}
      {sess.status === "open" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card flex flex-col gap-3">
            <h2 className="text-lg font-bold text-ocean">Registrar recebimento manual</h2>
            <p className="text-xs text-slate-700">
              Registre apenas valores efetivamente recebidos na mesa/caixa (dinheiro, PIX presencial ou maquininha). Não armazene dados de cartão.
            </p>
            {summary.balance_due_cents > 0 ? (
              <form action={recordPaymentAction} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="session_id" value={sess.id} />
                <input type="hidden" name="idempotency_key" value={crypto.randomUUID()} />
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Valor recebido (R$)
                  <input
                    name="amount"
                    required
                    inputMode="decimal"
                    defaultValue={centsToInput(summary.balance_due_cents)}
                    className="input"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Método presencial
                  <select name="method" defaultValue="PIX_PRESENCIAL" className="input">
                    <option value="PIX_PRESENCIAL">PIX presencial / QR estático</option>
                    <option value="CARTAO_DEBITO">Cartão de débito (maquininha)</option>
                    <option value="CARTAO_CREDITO">Cartão de crédito (maquininha)</option>
                    <option value="DINHEIRO">Dinheiro</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Pagador / participante (opcional)
                  <input
                    name="payer_label"
                    maxLength={60}
                    placeholder="Ex.: Cliente camisa azul"
                    className="input"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Vincular a pedido específico (opcional)
                  <select name="order_id" defaultValue="" className="input">
                    <option value="">Conta geral da mesa</option>
                    {validOrders.map((o) => (
                      <option key={o.id} value={o.id}>
                        Pedido #{o.order_number} {o.customer_name ? `(${o.customer_name})` : ""} —{" "}
                        {formatCents(o.total_cents)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
                  Referência / NSU / observação (opcional)
                  <input
                    name="reference"
                    maxLength={120}
                    placeholder="Ex.: Comprovante maquininha #4812"
                    className="input"
                  />
                </label>
                <div className="sm:col-span-2">
                  <button className="btn btn-primary w-full">
                    Confirmar recebimento presencial
                  </button>
                </div>
              </form>
            ) : (
              <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-950">
                Não há saldo pendente para receber no momento.
              </p>
            )}
          </section>

          <section className="card flex flex-col gap-3">
            <h2 className="text-lg font-bold text-ocean">Fechamento da sessão da mesa</h2>
            {summary.has_unsettled_orders && (
              <p className="rounded-xl border border-amber-400 bg-amber-50 p-3 text-xs text-amber-950">
                Existem pedidos ainda não entregues ou aguardando confirmação/preparo. Conclua a entrega ou cancele antes de encerrar a sessão.
              </p>
            )}
            {summary.balance_due_cents > 0 && (
              <p className="rounded-xl border border-amber-400 bg-amber-50 p-3 text-xs text-amber-950">
                Há saldo pendente de <strong>{formatCents(summary.balance_due_cents)}</strong>. Registre o recebimento ou ajuste autorizado antes de encerrar a sessão.
              </p>
            )}

            <form action={closeSessionFromAccountAction} className="flex flex-col gap-2">
              <input type="hidden" name="session_id" value={sess.id} />
              <label className="flex flex-col gap-1 text-sm font-medium">
                Observação de fechamento (opcional)
                <input
                  name="note"
                  maxLength={200}
                  placeholder="Ex.: Mesa conferida e liberada"
                  className="input"
                />
              </label>
              <button
                disabled={!canCloseSession}
                className={`btn w-full ${canCloseSession ? "btn-primary" : "opacity-50"}`}
              >
                Encerrar sessão da mesa
              </button>
            </form>

            {canManage && (
              <details className="mt-2 border-t pt-3">
                <summary className="cursor-pointer text-sm font-semibold text-ocean">
                  Lançar desconto ou ajuste autorizado (Gerente/Admin)
                </summary>
                <form action={recordAdjustmentAction} className="mt-2 grid gap-2 sm:grid-cols-2">
                  <input type="hidden" name="session_id" value={sess.id} />
                  <select name="kind" defaultValue="discount" aria-label="Tipo de ajuste" className="input">
                    <option value="discount">Desconto / Cortesia (-)</option>
                    <option value="surcharge">Acréscimo autorizado (+)</option>
                  </select>
                  <input
                    name="amount"
                    required
                    inputMode="decimal"
                    placeholder="Valor (0,00)"
                    aria-label="Valor do ajuste"
                    className="input"
                  />
                  <input
                    name="reason"
                    required
                    minLength={3}
                    placeholder="Motivo obrigatório"
                    aria-label="Motivo do ajuste"
                    className="input sm:col-span-2"
                  />
                  <button className="btn sm:col-span-2">Registrar ajuste auditado</button>
                </form>
              </details>
            )}
          </section>
        </div>
      )}

      {/* Extrato detalhado de pedidos e itens da sessão */}
      <section className="card flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ocean">
          Pedidos vinculados a esta sessão ({sess.orders.length})
        </h2>
        {sess.orders.length === 0 ? (
          <p className="text-sm text-slate-700">Nenhum pedido registrado nesta sessão.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {sess.orders.map((o) => (
              <li key={o.id} className="rounded-xl border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>
                    Pedido #{o.order_number} {o.customer_name ? `(${o.customer_name})` : ""}
                  </strong>
                  <span
                    className={`chip ${
                      o.status === "CANCELADO"
                        ? ""
                        : o.status === "AGUARDANDO_CONFIRMACAO" || o.status === "EM_VERIFICACAO"
                          ? "chip-open"
                          : "chip-on"
                    }`}
                  >
                    {ORDER_STATUS_LABEL[o.status] ?? o.status}
                  </span>
                </div>
                {o.cancel_reason && (
                  <p className="mt-1 text-xs text-red-800">Motivo: {o.cancel_reason}</p>
                )}
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-600">
                  {o.confirmed_by && (
                    <span>
                      ✅ Confirmado na mesa por: <strong className="text-ocean">{staffName(o.confirmed_by)}</strong>
                    </span>
                  )}
                  {o.delivered_by && (
                    <span>
                      🍽️ Entregue por: <strong className="text-emerald-800">{staffName(o.delivered_by)}</strong>
                    </span>
                  )}
                  {o.cancelled_by && (
                    <span>
                      ❌ Cancelado por: <strong className="text-red-800">{staffName(o.cancelled_by)}</strong>
                    </span>
                  )}
                </div>
                <ul className="mt-2 flex flex-col gap-1 border-t pt-2 text-sm">
                  {o.order_items.map((it) => (
                    <li key={it.id} className="flex justify-between gap-2">
                      <span>
                        {it.quantity}x {it.product_name_snapshot}
                        {it.order_item_options.length > 0 && (
                          <span className="ml-1 text-xs text-slate-600">
                            (
                            {it.order_item_options
                              .map((op) => `${op.group_name_snapshot}: ${op.option_name_snapshot}`)
                              .join(" • ")}
                            )
                          </span>
                        )}
                      </span>
                      <span className="font-semibold">{formatCents(it.line_total_cents)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex justify-between border-t pt-2 font-bold">
                  <span>Subtotal do pedido</span>
                  <span>{formatCents(o.total_cents)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Histórico de recebimentos e ajustes */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card flex flex-col gap-3">
          <h2 className="text-lg font-bold text-ocean">
            Recebimentos registrados ({sess.session_payments.length})
          </h2>
          {sess.session_payments.length === 0 ? (
            <p className="text-sm text-slate-700">Nenhum recebimento registrado ainda.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {sess.session_payments.map((p) => (
                <li
                  key={p.id}
                  className={`rounded-xl border p-3 text-sm ${
                    p.reversed_at ? "bg-slate-100 opacity-75" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>
                      {METHOD_LABEL[p.method] ?? p.method}{" "}
                      {p.payer_label ? `• ${p.payer_label}` : ""}
                    </strong>
                    <span
                      className={`font-bold ${
                        p.reversed_at ? "line-through text-slate-600" : "text-emerald-800"
                      }`}
                    >
                      {formatCents(p.amount_cents)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    {new Date(p.created_at).toLocaleString("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                    {p.recorded_by ? ` • Registrado por: ${staffName(p.recorded_by)}` : ""}
                    {p.reference ? ` • Ref.: ${p.reference}` : ""}
                  </p>
                  {p.reversed_at ? (
                    <p className="mt-1 text-xs font-semibold text-red-800">
                      Estornado: {p.reversal_reason}
                      {p.reversed_by ? ` (por ${staffName(p.reversed_by)})` : ""}
                    </p>
                  ) : (
                    canManage &&
                    sess.status === "open" && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-semibold text-red-700">
                          Estornar recebimento
                        </summary>
                        <form action={reversePaymentAction} className="mt-1 flex gap-2">
                          <input type="hidden" name="session_id" value={sess.id} />
                          <input type="hidden" name="payment_id" value={p.id} />
                          <input
                            name="reason"
                            required
                            minLength={3}
                            placeholder="Motivo do estorno"
                            aria-label="Motivo do estorno"
                            className="input h-9 min-w-0 flex-1 text-xs"
                          />
                          <button className="btn h-9 px-3 text-xs text-red-700">
                            Confirmar estorno
                          </button>
                        </form>
                      </details>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card flex flex-col gap-3">
          <h2 className="text-lg font-bold text-ocean">
            Ajustes e descontos ({sess.session_adjustments.length})
          </h2>
          {sess.session_adjustments.length === 0 ? (
            <p className="text-sm text-slate-700">Nenhum ajuste registrado nesta sessão.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {sess.session_adjustments.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-xl border p-3 text-sm">
                  <div>
                    <strong>{a.reason}</strong>
                    <span className="block text-xs text-slate-600">
                      {new Date(a.created_at).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                      {a.created_by ? ` • Autorizado por: ${staffName(a.created_by)}` : ""}
                    </span>
                  </div>
                  <span className="font-bold">{formatCents(a.amount_cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Avaliações de Atendimento dos Clientes nesta Sessão */}
      <section className="card flex flex-col gap-3 border-l-4 border-l-gold">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-ocean">
            ⭐ Avaliações de Atendimento dos Clientes ({sessionRatings.length})
          </h2>
        </div>
        {sessionRatings.length === 0 ? (
          <p className="text-sm text-slate-700">
            {sess.status === "open"
              ? "As avaliações ficarão disponíveis para o cliente assim que a sessão da mesa for encerrada."
              : "Nenhuma avaliação enviada pelo cliente nesta sessão até o momento."}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {sessionRatings.map((r) => (
              <li key={r.id} className="rounded-xl border border-sand bg-amber-50/30 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-ocean">👤 Garçom: {r.staff_name_snapshot}</strong>
                  <span className="font-bold text-amber-600">
                    {"★".repeat(r.stars)}
                    {"☆".repeat(5 - r.stars)} ({r.stars}/5)
                  </span>
                </div>
                {r.customer_name && (
                  <p className="mt-1 text-xs font-semibold text-slate-700">
                    Cliente: {r.customer_name}
                  </p>
                )}
                {r.comment && (
                  <p className="mt-1 rounded bg-white p-2 text-xs italic text-slate-800 border border-slate-100">
                    “{r.comment}”
                  </p>
                )}
                <p className="mt-1 text-[11px] text-slate-500">
                  Enviada em{" "}
                  {new Date(r.created_at).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
