import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";
import {
  cancelOrderAction,
  claimVerification,
  confirmOrderPresencial,
  deleteCancelledOrderAction,
  deliverOrderAction,
  updateServiceCallAction,
} from "./actions";

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

const CALL_REASON_LABEL: Record<string, string> = {
  AJUDA: "Precisa de ajuda",
  DUVIDA: "Dúvida sobre cardápio",
  PEDIR_CONTA: "Pedir a conta",
  OUTRO: "Outro motivo",
};

type ProfileRow = {
  id: string;
  full_name: string;
  role: string;
};

type ServiceCallRow = {
  id: string;
  reason: string;
  details: string | null;
  status: "PENDENTE" | "EM_ATENDIMENTO" | "ATENDIDA" | "CANCELADA";
  handled_by: string | null;
  handled_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  dining_tables: { display_name: string } | null;
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
  claimed_at: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  delivered_by: string | null;
  delivered_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  created_at: string;
  dining_tables: { display_name: string } | null;
  production_tasks: {
    id: string;
    sector: "kitchen" | "bar";
    status: string;
    started_by: string | null;
    completed_by: string | null;
  }[];
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
  const { supabase, user, profile } = await requireStaff(["admin", "manager", "attendant"]);
  const { f = "verificacao", msg } = await searchParams;

  let query = supabase
    .from("orders")
    .select(
      "id, order_number, status, customer_name, total_cents, notes, cancel_reason, version, claimed_by, claimed_at, confirmed_by, confirmed_at, delivered_by, delivered_at, cancelled_by, cancelled_at, created_at, dining_tables(display_name), production_tasks(id, sector, status, started_by, completed_by), order_items(id, product_name_snapshot, quantity, line_total_cents, sector_snapshot, notes, order_item_options(group_name_snapshot, option_name_snapshot, price_cents_snapshot))",
    )
    .order("created_at", { ascending: f === "todos" ? false : true });

  if (f === "verificacao") {
    query = query.in("status", ["AGUARDANDO_CONFIRMACAO", "EM_VERIFICACAO"]);
  } else if (f === "prontos") {
    query = query.eq("status", "PRONTO");
  } else if (f === "ativos") {
    query = query.in("status", ["CONFIRMADO", "EM_PREPARACAO", "PARCIALMENTE_PRONTO", "PRONTO"]);
  }

  const [
    { data, error },
    { data: callsData },
    { data: recentCallsData },
    { data: profilesData },
    { data: serverTime },
  ] = await Promise.all([
    query.limit(100),
    supabase
      .from("service_calls")
      .select(
        "id, reason, details, status, handled_by, handled_at, resolved_by, resolved_at, resolution_note, created_at, dining_tables(display_name)",
      )
      .in("status", ["PENDENTE", "EM_ATENDIMENTO"])
      .order("created_at", { ascending: true }),
    supabase
      .from("service_calls")
      .select(
        "id, reason, details, status, handled_by, handled_at, resolved_by, resolved_at, resolution_note, created_at, dining_tables(display_name)",
      )
      .in("status", ["ATENDIDA", "CANCELADA"])
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("profiles").select("id, full_name, role"),
    supabase
      .rpc("resolve_table", { p_token: "" })
      .then(() => ({ data: new Date().toISOString() })),
  ]);

  const orders = (data ?? []) as unknown as OrderRow[];
  const calls = (callsData ?? []) as unknown as ServiceCallRow[];
  const recentCalls = (recentCallsData ?? []) as unknown as ServiceCallRow[];
  const staffMap = new Map<string, ProfileRow>();
  for (const p of (profilesData ?? []) as ProfileRow[]) {
    staffMap.set(p.id, p);
  }
  const staffName = (id: string | null | undefined) =>
    id ? (staffMap.get(id)?.full_name ?? "Funcionário") : null;

  const nowMs = new Date(serverTime).getTime();

  return (
    <main className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Atendimento, Confirmação e Entrega</h1>
          <p className="text-slate-700">
            Nenhum pedido vai para a cozinha ou bar sem verificação presencial na mesa. Todas as tarefas exibem o funcionário responsável.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RealtimeRefresh tables={["orders", "production_tasks", "service_calls"]} />
          <Link href={`/admin/pedidos?f=${encodeURIComponent(f)}`} className="btn">
            Atualizar fila
          </Link>
        </div>
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

      {/* Fila de chamados de atendente ("Chamar atendente" / Idas nas mesas) */}
      {calls.length > 0 && (
        <section
          aria-label="Chamados de atendente ativos"
          className="card border-2 border-gold bg-amber-50/60"
        >
          <h2 className="text-lg font-bold text-ocean">
            Chamados de Mesa Ativos ({calls.length})
          </h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {calls.map((c) => {
              const waitMin = Math.max(
                0,
                Math.floor((nowMs - new Date(c.created_at).getTime()) / 60000),
              );
              const handlerName = staffName(c.handled_by);
              return (
                <li
                  key={c.id}
                  className="flex flex-col gap-2 rounded-xl border border-amber-400 bg-white p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-base text-ocean">
                      {c.dining_tables?.display_name ?? "Mesa"} —{" "}
                      {CALL_REASON_LABEL[c.reason] ?? c.reason}
                    </strong>
                    <span className={`chip ${c.status === "PENDENTE" ? "chip-open" : "chip-on"}`}>
                      {c.status === "PENDENTE" ? "Pendente" : "Em atendimento"} ({waitMin} min)
                    </span>
                  </div>
                  {c.details && <p className="text-sm text-slate-700">Obs.: {c.details}</p>}
                  {handlerName && (
                    <p className="rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-semibold text-ocean">
                      👤 Assumido por: <strong>{handlerName}</strong>
                      {c.handled_by === user.id ? " (você)" : ""}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {c.status === "PENDENTE" && (
                      <form action={updateServiceCallAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="status" value="EM_ATENDIMENTO" />
                        <button className="btn h-9 px-3 text-sm">Assumir chamado</button>
                      </form>
                    )}
                    <form action={updateServiceCallAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="status" value="ATENDIDA" />
                      <button className="btn btn-primary h-9 px-3 text-sm">
                        Marcar como atendido
                      </button>
                    </form>
                    <form action={updateServiceCallAction} className="ml-auto">
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="status" value="CANCELADA" />
                      <button className="btn h-9 px-3 text-xs">Cancelar</button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <nav aria-label="Filtro de pedidos" className="flex flex-wrap gap-2">
        <Link
          href="/admin/pedidos?f=verificacao"
          className={`btn ${f === "verificacao" ? "btn-primary" : ""}`}
        >
          1. Fila de Confirmação Presencial
        </Link>
        <Link
          href="/admin/pedidos?f=prontos"
          className={`btn ${f === "prontos" ? "btn-primary" : ""}`}
        >
          2. Prontos p/ Entrega
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
          const waitMin = Math.max(
            0,
            Math.floor((nowMs - new Date(o.created_at).getTime()) / 60000),
          );
          const isPendingConfirm =
            o.status === "AGUARDANDO_CONFIRMACAO" || o.status === "EM_VERIFICACAO";
          const isDelayed = isPendingConfirm && waitMin >= 5;
          const claimedName = staffName(o.claimed_by);
          const confirmedName = staffName(o.confirmed_by);
          const deliveredName = staffName(o.delivered_by);
          const cancelledName = staffName(o.cancelled_by);

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
                {o.status !== "ENTREGUE" && o.status !== "CANCELADO" && (
                  <span className={isDelayed ? "font-bold text-red-700" : ""}>
                    Espera: {waitMin} min {isDelayed ? "(Atenção: aguardando há mais de 5 min)" : ""}
                  </span>
                )}
              </div>

              {/* Bloco de Controle Interno: Funcionários Responsáveis por cada tarefa do pedido */}
              {(claimedName ||
                confirmedName ||
                deliveredName ||
                cancelledName ||
                (o.production_tasks && o.production_tasks.length > 0)) && (
                <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-sky-50/60 p-2.5 text-xs text-slate-800">
                  <strong className="text-[11px] uppercase tracking-wider text-ocean">
                    Controle de Equipe (Quem assumiu):
                  </strong>
                  {claimedName && (
                    <span>
                      🔍 <strong>Verificação na mesa:</strong> {claimedName}
                      {o.claimed_by === user.id ? " (você)" : ""}
                    </span>
                  )}
                  {confirmedName && (
                    <span>
                      ✅ <strong>Confirmado na mesa por:</strong> {confirmedName}
                      {o.confirmed_at
                        ? ` às ${new Date(o.confirmed_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                        : ""}
                    </span>
                  )}
                  {o.production_tasks?.map((pt) => {
                    const stName = staffName(pt.started_by);
                    const cpName = staffName(pt.completed_by);
                    if (!stName && !cpName) return null;
                    return (
                      <span key={pt.id}>
                        {pt.sector === "bar" ? "🍹" : "🍳"}{" "}
                        <strong>{pt.sector === "bar" ? "Bar" : "Cozinha"}:</strong>{" "}
                        {stName ? `Iniciado por ${stName}` : ""}
                        {stName && cpName ? " • " : ""}
                        {cpName ? `Concluído por ${cpName}` : ""}
                      </span>
                    );
                  })}
                  {deliveredName && (
                    <span>
                      🍽️ <strong>Entregue na mesa por:</strong> {deliveredName}
                      {o.delivered_at
                        ? ` às ${new Date(o.delivered_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                        : ""}
                    </span>
                  )}
                  {cancelledName && (
                    <span className="text-red-800">
                      ❌ <strong>Cancelado por:</strong> {cancelledName}
                    </span>
                  )}
                </div>
              )}

              <ul className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 text-sm">
                {o.order_items.map((it) => (
                  <li
                    key={it.id}
                    className="flex flex-col gap-0.5 border-b pb-2 last:border-b-0 last:pb-0"
                  >
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

              {o.status === "PRONTO" && (
                <form action={deliverOrderAction} className="pt-1">
                  <input type="hidden" name="id" value={o.id} />
                  <input type="hidden" name="version" value={o.version} />
                  <button className="btn btn-primary w-full">
                    Registrar entrega na mesa (concluir entrega)
                  </button>
                </form>
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
                    <button className="btn border-red-600 text-red-700">
                      Confirmar cancelamento
                    </button>
                  </form>
                </details>
              )}

              {o.status === "CANCELADO" && profile.role === "admin" && (
                <details className="pt-1">
                  <summary className="cursor-pointer text-xs font-semibold text-rose-700 hover:underline">
                    🗑️ Excluir pedido cancelado (liberar espaço)
                  </summary>
                  <form action={deleteCancelledOrderAction} className="mt-2 flex items-center gap-2">
                    <input type="hidden" name="id" value={o.id} />
                    <button className="btn border-rose-500 bg-rose-50 text-xs font-bold text-rose-900 hover:bg-rose-100">
                      Confirmar exclusão definitiva
                    </button>
                  </form>
                </details>
              )}
            </li>
          );
        })}
      </ul>

      {/* Histórico Recente de Idas nas Mesas (Chamados Concluídos/Cancelados) */}
      {recentCalls.length > 0 && (
        <details className="card mt-2">
          <summary className="cursor-pointer font-bold text-ocean">
            Histórico Recente de Idas nas Mesas / Chamados ({recentCalls.length})
          </summary>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {recentCalls.map((rc) => {
              const hName = staffName(rc.handled_by);
              const rName = staffName(rc.resolved_by);
              return (
                <li key={rc.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-sm text-ocean">
                      {rc.dining_tables?.display_name ?? "Mesa"} — {CALL_REASON_LABEL[rc.reason] ?? rc.reason}
                    </strong>
                    <span className="chip">{rc.status === "ATENDIDA" ? "Atendido" : "Cancelado"}</span>
                  </div>
                  {rc.details && <p className="mt-1 text-slate-700">Obs.: {rc.details}</p>}
                  <div className="mt-1.5 flex flex-col gap-0.5 text-slate-700">
                    {hName && (
                      <span>
                        👤 <strong>Assumido por:</strong> {hName}
                      </span>
                    )}
                    {rName && (
                      <span>
                        ✅ <strong>Finalizado por:</strong> {rName}
                        {rc.resolved_at
                          ? ` às ${new Date(rc.resolved_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                          : ""}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </main>
  );
}
