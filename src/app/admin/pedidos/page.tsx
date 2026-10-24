import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { cancelOrderAction, claimVerification, confirmOrderPresencial } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  AGUARDANDO_CONFIRMACAO: "Aguardando confirmação",
  EM_VERIFICACAO: "Em verificação presencial",
  CONFIRMADO: "Confirmado (em fila de preparo)",
  EM_PREPARACAO: "Em preparação",
  PARCIALMENTE_PRONTO: "Parcialmente pronto",
  PRONTO: "Pronto para entrega",
  ENTREGUE: "Entregue",
  CANCELADO: "Cancelado",
};

type OrderRow = {
  id: string;
  order_number: number;
  status: string;
  customer_name: string | null;
  total_cents: number;
  notes: string | null;
  cancel_reason: string | null;
  version: number;
  claimed_by: string | null;
  created_at: string;
  confirmed_at: string | null;
  dining_tables: { display_name: string } | null;
  order_items: {
    id: string;
    product_name_snapshot: string;
    quantity: number;
    line_total_cents: number;
    sector_snapshot: string;
    notes: string | null;
    order_item_options: {
      group_name_snapshot: string;
      option_name_snapshot: string;
      price_cents_snapshot: number;
    }[];
  }[];
};

export default async function PedidosAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; msg?: string }>;
}) {
  const { supabase, user } = await requireStaff(["admin", "manager", "attendant"]);
  const { f = "verificacao", msg } = await searchParams;

  let query = supabase
    .from("orders")
    .select(
      "id, order_number, status, customer_name, total_cents, notes, cancel_reason, version, claimed_by, created_at, confirmed_at, dining_tables(display_name), order_items(id, product_name_snapshot, quantity, line_total_cents, sector_snapshot, notes, order_item_options(group_name_snapshot, option_name_snapshot, price_cents_snapshot))",
    )
    .order("created_at", { ascending: true });

  if (f === "verificacao") {
    query = query.in("status", ["AGUARDANDO_CONFIRMACAO", "EM_VERIFICACAO"]);
  } else if (f === "ativos") {
    query = query.in("status", ["CONFIRMADO", "EM_PREPARACAO", "PARCIALMENTE_PRONTO", "PRONTO"]);
  }

  const [{ data, error }, { data: serverTime }] = await Promise.all([
    query.limit(100),
    supabase.rpc("resolve_table", { p_token: "" }).then(() => ({ data: new Date().toISOString() })),
  ]);
  const orders = (data ?? []) as unknown as OrderRow[];
  const nowMs = new Date(serverTime).getTime();

  return (
    <main className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Pedidos e Confirmação Presencial</h1>
          <p className="text-slate-700">
            Nenhum pedido vai para a cozinha ou bar sem verificação presencial na mesa.
          </p>
        </div>
        <Link href={`/admin/pedidos?f=${encodeURIComponent(f)}`} className="btn">
          Atualizar fila
        </Link>
      </header>

      {msg && (
        <p role="status" className="rounded-xl border border-sky-400 bg-sky-50 p-3 text-sky-950">
          {msg}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-red-400 bg-red-50 p-3 text-red-900">
          Não foi possível carregar a fila de pedidos.
        </p>
      )}

      <nav aria-label="Filtro de pedidos" className="flex flex-wrap gap-2">
        <Link
          href="/admin/pedidos?f=verificacao"
          className={`btn ${f === "verificacao" ? "btn-primary" : ""}`}
        >
          Fila de Confirmação Presencial
        </Link>
        <Link
          href="/admin/pedidos?f=ativos"
          className={`btn ${f === "ativos" ? "btn-primary" : ""}`}
        >
          Confirmados / Em Produção
        </Link>
        <Link
          href="/admin/pedidos?f=todos"
          className={`btn ${f === "todos" ? "btn-primary" : ""}`}
        >
          Todos os Recentes
        </Link>
      </nav>

      {orders.length === 0 && !error && (
        <section className="card text-center text-slate-700">
          Nenhum pedido nesta fila no momento.
        </section>
      )}

      <ul className="grid gap-4 lg:grid-cols-2">
        {orders.map((o) => {
          const waitMin = Math.max(0, Math.floor((nowMs - new Date(o.created_at).getTime()) / 60000));
          const isPendingConfirm =
            o.status === "AGUARDANDO_CONFIRMACAO" || o.status === "EM_VERIFICACAO";
          const isDelayed = isPendingConfirm && waitMin >= 5;
          const claimedByMe = o.claimed_by === user.id;

          return (
            <li
              key={o.id}
              className={`card flex flex-col gap-3 ${
                isDelayed
                  ? "border-l-4 border-l-red-600"
                  : isPendingConfirm
                    ? "border-l-4 border-l-gold"
                    : "border-l-4 border-l-turquoise"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-lg font-bold text-ocean">
                    {o.dining_tables?.display_name ?? "Mesa"} • Pedido #{o.order_number}
                  </span>
                  {o.customer_name && (
                    <span className="ml-2 text-sm font-semibold text-slate-700">
                      ({o.customer_name})
                    </span>
                  )}
                </div>
                <span className={`chip ${isPendingConfirm ? "chip-open" : "chip-on"}`}>
                  {STATUS_LABEL[o.status] ?? o.status}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700">
                <span>
                  Recebido às{" "}
                  {new Date(o.created_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className={isDelayed ? "font-bold text-red-700" : ""}>
                  Espera: {waitMin} min {isDelayed ? "(Atenção: aguardando há mais de 5 min)" : ""}
                </span>
                {o.status === "EM_VERIFICACAO" && (
                  <span className="font-semibold text-ocean">
                    {claimedByMe ? "Em verificação por você" : "Em verificação por atendente"}
                  </span>
                )}
              </div>

              <ul className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 text-sm">
                {o.order_items.map((it) => (
                  <li key={it.id} className="flex flex-col gap-0.5 border-b pb-2 last:border-b-0 last:pb-0">
                    <div className="flex justify-between gap-2">
                      <strong>
                        {it.quantity}x {it.product_name_snapshot}{" "}
                        <span className="text-xs font-normal text-slate-600">
                          [{it.sector_snapshot === "bar" ? "Bar" : "Cozinha"}]
                        </span>
                      </strong>
                      <span className="font-semibold">{formatCents(it.line_total_cents)}</span>
                    </div>
                    {it.order_item_options.length > 0 && (
                      <p className="text-xs text-slate-700">
                        {it.order_item_options
                          .map((op) => `${op.group_name_snapshot}: ${op.option_name_snapshot}`)
                          .join(" • ")}
                      </p>
                    )}
                    {it.notes && <p className="text-xs italic text-slate-700">Obs.: {it.notes}</p>}
                  </li>
                ))}
              </ul>

              {o.notes && (
                <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-950">
                  <strong>Obs. do pedido:</strong> {o.notes}
                </p>
              )}
              {o.cancel_reason && (
                <p className="rounded-lg bg-red-50 p-2 text-xs text-red-900">
                  <strong>Motivo do cancelamento:</strong> {o.cancel_reason}
                </p>
              )}

              <div className="flex items-center justify-between border-t pt-2 font-bold">
                <span>Total</span>
                <span className="text-lg text-ocean">{formatCents(o.total_cents)}</span>
              </div>

              {isPendingConfirm && (
                <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                  {o.status === "AGUARDANDO_CONFIRMACAO" && (
                    <form action={claimVerification} className="flex-1">
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="version" value={o.version} />
                      <button className="btn w-full">1. Assumir verificação (ir à mesa)</button>
                    </form>
                  )}
                  <form action={confirmOrderPresencial} className="flex-1">
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="version" value={o.version} />
                    <button className="btn btn-primary w-full">
                      {o.status === "EM_VERIFICACAO"
                        ? "2. Confirmar após checagem na mesa"
                        : "Confirmar presencialmente"}
                    </button>
                  </form>
                </div>
              )}

              {o.status !== "CANCELADO" && o.status !== "ENTREGUE" && (
                <details className="pt-1">
                  <summary className="cursor-pointer text-xs font-semibold text-red-700">
                    Cancelar pedido (exige motivo)
                  </summary>
                  <form action={cancelOrderAction} className="mt-2 flex flex-wrap gap-2">
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="version" value={o.version} />
                    <input
                      name="reason"
                      required
                      minLength={3}
                      placeholder="Motivo do cancelamento"
                      aria-label="Motivo do cancelamento"
                      className="input min-w-0 flex-1 text-sm"
                    />
                    <button className="btn border-red-600 text-red-700">Confirmar cancelamento</button>
                  </form>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
