import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { purgeClosedHistoryAction } from "./actions";

const VALID_STATUSES = new Set([
  "CONFIRMADO",
  "EM_PREPARACAO",
  "PARCIALMENTE_PRONTO",
  "PRONTO",
  "ENTREGUE",
]);

type OrderReportRow = {
  id: string;
  order_number: number;
  status: string;
  total_cents: number;
  created_at: string;
  claimed_by: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  delivered_at: string | null;
  delivered_by: string | null;
  cancelled_by: string | null;
  table_id: string;
  dining_tables: { display_name: string } | null;
  order_items: {
    product_name_snapshot: string;
    quantity: number;
    line_total_cents: number;
    sector_snapshot: string;
  }[];
};

type PaymentReportRow = {
  id: string;
  method: string;
  amount_cents: number;
  recorded_by: string | null;
  created_at: string;
  reversed_at: string | null;
};

type ProfileReportRow = {
  id: string;
  full_name: string;
  role: string;
  active: boolean;
};

type TaskReportRow = {
  id: string;
  sector: "kitchen" | "bar";
  status: string;
  started_by: string | null;
  completed_by: string | null;
  created_at: string;
};

type CallReportRow = {
  id: string;
  reason: string;
  status: string;
  handled_by: string | null;
  resolved_by: string | null;
  opened_at: string;
};

type SessionReportRow = {
  id: string;
  status: string;
  opened_by: string | null;
  closed_by: string | null;
  opened_at: string;
  closed_at: string | null;
};

type RatingReportRow = {
  id: string;
  session_id: string;
  table_id: string;
  staff_id: string | null;
  staff_name_snapshot: string;
  customer_name: string | null;
  stars: number;
  comment: string | null;
  created_at: string;
  dining_tables: { display_name: string } | null;
};

type AuditReportRow = {
  id: number;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  created_at: string;
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  manager: "Gerente",
  attendant: "Garçom / Salão",
  kitchen: "Cozinha",
  bar: "Bar",
};

const AUDIT_ACTION_LABEL: Record<string, string> = {
  "session.open": "Abriu sessão de mesa",
  "session.close": "Encerrou sessão de mesa",
  "session.payment_record": "Registrou recebimento presencial",
  "session.payment_reverse": "Estornou recebimento",
  "session.adjustment_record": "Registrou desconto/ajuste na conta",
  "session.rate_service": "Avaliação de atendimento enviada pelo cliente",
  "order.place": "Pedido enviado pelo cliente (QR Code)",
  "order.claim_verification": "Assumiu verificação presencial na mesa",
  "order.confirm_in_person": "Confirmou pedido presencialmente na mesa",
  "order.deliver": "Entregou pedido na mesa",
  "order.cancel": "Cancelou pedido",
  "order.delete_cancelled": "Excluiu pedido cancelado do banco",
  "production.start": "Iniciou preparo (Cozinha/Bar)",
  "production.complete": "Concluiu preparo (Cozinha/Bar)",
  "service_call.create": "Cliente chamou atendente na mesa",
  "service_call.acknowledge": "Assumiu ida na mesa (chamado)",
  "service_call.resolve": "Concluiu atendimento na mesa (chamado)",
  "service_call.cancel": "Cancelou chamado de mesa",
  "system.purge_closed_history": "Executou limpeza/fechamento de período",
};

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{
    de?: string;
    ate?: string;
    mesa?: string;
    setor?: string;
    status?: string;
    msg?: string;
  }>;
}) {
  const { supabase, profile } = await requireStaff(["admin", "manager"]);
  const sp = await searchParams;

  const today = new Date().toISOString().slice(0, 10);
  const de = sp.de && /^\d{4}-\d{2}-\d{2}$/.test(sp.de) ? sp.de : today;
  const ate = sp.ate && /^\d{4}-\d{2}-\d{2}$/.test(sp.ate) ? sp.ate : today;
  const mesa = sp.mesa ?? "";
  const setor = sp.setor ?? "";
  const status = sp.status ?? "";

  const startIso = `${de}T00:00:00.000Z`;
  const endIso = `${ate}T23:59:59.999Z`;

  let oq = supabase
    .from("orders")
    .select(
      "id, order_number, status, total_cents, created_at, claimed_by, confirmed_at, confirmed_by, delivered_at, delivered_by, cancelled_by, table_id, dining_tables(display_name), order_items(product_name_snapshot, quantity, line_total_cents, sector_snapshot)",
    )
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .order("created_at", { ascending: false });

  if (mesa) oq = oq.eq("table_id", mesa);
  if (status) oq = oq.eq("status", status);

  const [
    { data: ordData, error: e1 },
    { data: payData },
    { data: tablesData },
    { data: unavailData },
    { data: profilesData },
    { data: tasksData },
    { data: callsData },
    { data: sessionsData },
    { data: ratingsData },
    { data: auditData },
  ] = await Promise.all([
    oq.limit(500),
    supabase
      .from("session_payments")
      .select("id, method, amount_cents, recorded_by, created_at, reversed_at")
      .gte("created_at", startIso)
      .lte("created_at", endIso),
    supabase.from("dining_tables").select("id, display_name").order("sort_order"),
    supabase
      .from("products")
      .select("id, name, sector")
      .eq("status", "published")
      .eq("available", false),
    supabase.from("profiles").select("id, full_name, role, active").order("full_name"),
    supabase
      .from("production_tasks")
      .select("id, sector, status, started_by, completed_by, created_at")
      .gte("created_at", startIso)
      .lte("created_at", endIso),
    supabase
      .from("service_calls")
      .select("id, reason, status, handled_by, resolved_by, opened_at")
      .gte("opened_at", startIso)
      .lte("opened_at", endIso),
    supabase
      .from("table_sessions")
      .select("id, status, opened_by, closed_by, opened_at, closed_at")
      .gte("opened_at", startIso)
      .lte("opened_at", endIso),
    supabase
      .from("service_ratings")
      .select("id, session_id, table_id, staff_id, staff_name_snapshot, customer_name, stars, comment, created_at, dining_tables(display_name)")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: false }),
    supabase
      .from("audit_log")
      .select("id, actor_id, actor_role, action, entity_type, created_at")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: false })
      .limit(120),
  ]);

  const allOrders = (ordData ?? []) as unknown as OrderReportRow[];
  const orders = setor
    ? allOrders.filter((o) => o.order_items.some((i) => i.sector_snapshot === setor))
    : allOrders;

  const payments = ((payData ?? []) as PaymentReportRow[]).filter((p) => !p.reversed_at);
  const tables = tablesData ?? [];
  const unavailableProducts = unavailData ?? [];

  // Métricas com fórmulas explícitas:
  // 1. Consumo Válido = soma de pedidos confirmados (exclui CANCELADO e não confirmados)
  const validOrders = orders.filter((o) => VALID_STATUSES.has(o.status));
  const cancelledOrders = orders.filter((o) => o.status === "CANCELADO");
  const consumedCents = validOrders.reduce((acc, o) => acc + o.total_cents, 0);
  const cancelledCents = cancelledOrders.reduce((acc, o) => acc + o.total_cents, 0);

  // 2. Recebimentos Confirmados = soma de pagamentos manuais não estornados no período
  const receivedCents = payments.reduce((acc, p) => acc + p.amount_cents, 0);

  // 3. Tempo médio de confirmação presencial (confirmed_at - created_at)
  const confirmDurations = validOrders
    .filter((o) => o.confirmed_at)
    .map(
      (o) =>
        (new Date(o.confirmed_at!).getTime() - new Date(o.created_at).getTime()) / 60000,
    )
    .filter((m) => m >= 0);
  const avgConfirmMin =
    confirmDurations.length > 0
      ? (confirmDurations.reduce((a, b) => a + b, 0) / confirmDurations.length).toFixed(1)
      : null;

  // 4. Tempo médio até entrega (delivered_at - confirmed_at)
  const deliveryDurations = validOrders
    .filter((o) => o.confirmed_at && o.delivered_at)
    .map(
      (o) =>
        (new Date(o.delivered_at!).getTime() - new Date(o.confirmed_at!).getTime()) /
        60000,
    )
    .filter((m) => m >= 0);
  const avgDeliveryMin =
    deliveryDurations.length > 0
      ? (deliveryDurations.reduce((a, b) => a + b, 0) / deliveryDurations.length).toFixed(1)
      : null;

  // 5. Ranking de itens solicitados em pedidos válidos
  const itemMap = new Map<string, { name: string; qty: number; cents: number }>();
  for (const o of validOrders) {
    for (const it of o.order_items) {
      if (setor && it.sector_snapshot !== setor) continue;
      const cur = itemMap.get(it.product_name_snapshot) ?? {
        name: it.product_name_snapshot,
        qty: 0,
        cents: 0,
      };
      cur.qty += it.quantity;
      cur.cents += it.line_total_cents;
      itemMap.set(it.product_name_snapshot, cur);
    }
  }
  const topItems = Array.from(itemMap.values()).sort((a, b) => b.qty - a.qty);

  // 6. Consolidação de Controle Interno por Funcionário Cadastrado
  const staffProfiles = (profilesData ?? []) as ProfileReportRow[];
  const prodTasks = (tasksData ?? []) as TaskReportRow[];
  const serviceCalls = (callsData ?? []) as CallReportRow[];
  const sessions = (sessionsData ?? []) as SessionReportRow[];
  const ratings = (ratingsData ?? []) as unknown as RatingReportRow[];
  const auditRows = (auditData ?? []) as AuditReportRow[];

  const staffNameMap = new Map<string, string>();
  for (const p of staffProfiles) {
    staffNameMap.set(p.id, p.full_name);
  }

  const staffStats = staffProfiles.map((p) => {
    const sessionsOpened = sessions.filter((s) => s.opened_by === p.id).length;
    const sessionsClosed = sessions.filter((s) => s.closed_by === p.id).length;
    const ordersClaimed = allOrders.filter((o) => o.claimed_by === p.id).length;
    const ordersConfirmed = allOrders.filter((o) => o.confirmed_by === p.id).length;
    const ordersDelivered = allOrders.filter((o) => o.delivered_by === p.id).length;
    const tasksStarted = prodTasks.filter((t) => t.started_by === p.id).length;
    const tasksCompleted = prodTasks.filter((t) => t.completed_by === p.id).length;
    const callsHandled = serviceCalls.filter(
      (c) => c.handled_by === p.id || c.resolved_by === p.id,
    ).length;
    const paymentsRecorded = payments.filter((pay) => pay.recorded_by === p.id).length;
    const myRatings = ratings.filter((r) => r.staff_id === p.id);
    const avgStars =
      myRatings.length > 0
        ? (myRatings.reduce((acc, r) => acc + r.stars, 0) / myRatings.length).toFixed(1)
        : null;

    const totalActions =
      sessionsOpened +
      sessionsClosed +
      ordersClaimed +
      ordersConfirmed +
      ordersDelivered +
      tasksStarted +
      tasksCompleted +
      callsHandled +
      paymentsRecorded;

    return {
      ...p,
      sessionsOpened,
      sessionsClosed,
      ordersClaimed,
      ordersConfirmed,
      ordersDelivered,
      tasksStarted,
      tasksCompleted,
      callsHandled,
      paymentsRecorded,
      ratingsCount: myRatings.length,
      avgStars,
      totalActions,
    };
  });

  const overallRatingAvg =
    ratings.length > 0
      ? (ratings.reduce((a, r) => a + r.stars, 0) / ratings.length).toFixed(1)
      : null;

  const qs = new URLSearchParams({ de, ate, mesa, setor, status }).toString();

  return (
    <main className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Relatórios Operacionais e Financeiros</h1>
          <p className="text-slate-700">
            Consumo válido, recebimentos presenciais e tempos operacionais separados com transparência.
          </p>
        </div>
        {orders.length > 0 && (
          <Link href={`/admin/relatorios/export?${qs}`} className="btn">
            Exportar CSV
          </Link>
        )}
      </header>

      {sp.msg && (
        <p role="status" className="rounded-xl border border-sky-400 bg-sky-50 p-4 text-sky-950 font-medium">
          {sp.msg}
        </p>
      )}

      {e1 && (
        <p role="alert" className="rounded-xl border border-red-400 bg-red-50 p-3 text-red-900">
          Não foi possível carregar os dados do relatório.
        </p>
      )}

      <form className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-6" role="search">
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Data inicial
          <input type="date" name="de" defaultValue={de} className="input" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Data final
          <input type="date" name="ate" defaultValue={ate} className="input" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Mesa
          <select name="mesa" defaultValue={mesa} className="input">
            <option value="">Todas</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.display_name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Setor
          <select name="setor" defaultValue={setor} className="input">
            <option value="">Todos</option>
            <option value="kitchen">Cozinha</option>
            <option value="bar">Bar</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Status
          <select name="status" defaultValue={status} className="input">
            <option value="">Todos</option>
            <option value="CONFIRMADO">Confirmado</option>
            <option value="EM_PREPARACAO">Em preparação</option>
            <option value="PRONTO">Pronto</option>
            <option value="ENTREGUE">Entregue</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
        </label>
        <div className="flex items-end">
          <button className="btn btn-primary w-full">Aplicar filtros</button>
        </div>
      </form>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <p className="text-xs font-semibold uppercase text-slate-600">
            Consumo Válido ({validOrders.length} pedidos)
          </p>
          <p className="mt-1 text-2xl font-bold text-ocean">{formatCents(consumedCents)}</p>
          <p className="mt-1 text-xs text-slate-600">
            Fórmula: soma de pedidos confirmados (exclui cancelados e não confirmados).
          </p>
        </div>

        <div className="card">
          <p className="text-xs font-semibold uppercase text-slate-600">
            Recebimentos no Período ({payments.length})
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-800">
            {formatCents(receivedCents)}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Fórmula: soma de pagamentos presenciais registrados (não estornados).
          </p>
        </div>

        <div className="card">
          <p className="text-xs font-semibold uppercase text-slate-600">
            Cancelamentos ({cancelledOrders.length})
          </p>
          <p className="mt-1 text-2xl font-bold text-red-800">
            {formatCents(cancelledCents)}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Excluídos das métricas de consumo válido.
          </p>
        </div>

        <div className="card">
          <p className="text-xs font-semibold uppercase text-slate-600">
            Tempos Médios Operacionais
          </p>
          <p className="mt-1 text-sm font-bold">
            Confirmação:{" "}
            <span className="text-ocean">
              {avgConfirmMin !== null ? `${avgConfirmMin} min` : "Sem dados"}
            </span>
          </p>
          <p className="mt-1 text-sm font-bold">
            Preparo + Entrega:{" "}
            <span className="text-ocean">
              {avgDeliveryMin !== null ? `${avgDeliveryMin} min` : "Sem dados"}
            </span>
          </p>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card flex flex-col gap-3">
          <h2 className="text-lg font-bold text-ocean">Itens solicitados (Consumo Válido)</h2>
          {topItems.length === 0 ? (
            <p className="text-sm text-slate-700">
              Sem itens confirmados para os filtros selecionados.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {topItems.map((it) => (
                <li
                  key={it.name}
                  className="flex items-center justify-between border-b pb-2 last:border-b-0"
                >
                  <span>
                    <strong>{it.qty}x</strong> {it.name}
                  </span>
                  <span className="font-semibold text-ocean">{formatCents(it.cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card flex flex-col gap-3">
          <h2 className="text-lg font-bold text-ocean">
            Produtos publicados indisponíveis agora ({unavailableProducts.length})
          </h2>
          {unavailableProducts.length === 0 ? (
            <p className="text-sm text-slate-700">
              Todos os produtos publicados estão disponíveis no momento.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {unavailableProducts.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-xl border p-2">
                  <strong>{p.name}</strong>
                  <span className="chip chip-open">
                    {p.sector === "bar" ? "Bar" : "Cozinha"} — Indisponível
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ========================================================
          CONTROLE INTERNO: DESEMPENHO E TAREFAS POR FUNCIONÁRIO
          ======================================================== */}
      <section className="card flex flex-col gap-4 border-l-4 border-l-ocean">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div>
            <span className="brand-tagline text-xs font-bold text-ocean">
              Controle Interno da Empresa
            </span>
            <h2 className="text-xl font-bold text-[#14213d]">
              Tarefas Assumidas por Funcionário ({de} até {ate})
            </h2>
            <p className="text-xs text-slate-700">
              Acompanhe exatamente quem abriu/fechou mesas, verificou, confirmou e entregou pedidos, preparou na cozinha/bar, foi até as mesas nos chamados e recebeu pagamentos.
            </p>
          </div>
          {overallRatingAvg && (
            <div className="rounded-xl border border-gold bg-amber-50 px-4 py-2 text-right">
              <span className="block text-[11px] font-bold uppercase text-amber-900">
                Média Geral de Atendimento
              </span>
              <strong className="text-lg font-extrabold text-amber-700">
                ⭐ {overallRatingAvg} / 5.0 ({ratings.length} aval.)
              </strong>
            </div>
          )}
        </div>

        {staffStats.length === 0 ? (
          <p className="text-sm text-slate-700">Nenhum funcionário cadastrado encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b bg-slate-50 text-slate-700">
                  <th className="p-2.5 font-bold">Funcionário</th>
                  <th className="p-2.5 font-bold">Função</th>
                  <th className="p-2.5 font-bold text-center">Mesas (Ab./Enc.)</th>
                  <th className="p-2.5 font-bold text-center">Pedidos (Verif./Conf./Entr.)</th>
                  <th className="p-2.5 font-bold text-center">Cozinha & Bar (Inic./Concl.)</th>
                  <th className="p-2.5 font-bold text-center">Idas na Mesa (Chamados)</th>
                  <th className="p-2.5 font-bold text-center">Recebimentos</th>
                  <th className="p-2.5 font-bold text-center">Avaliação Clientes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {staffStats.map((st) => (
                  <tr key={st.id} className="hover:bg-slate-50/80">
                    <td className="p-2.5 font-bold text-[#14213d]">
                      {st.full_name}
                      {!st.active && (
                        <span className="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
                          Inativo
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 text-slate-700">{ROLE_LABEL[st.role] ?? st.role}</td>
                    <td className="p-2.5 text-center font-medium">
                      <span title="Sessões Abertas">{st.sessionsOpened}</span> /{" "}
                      <span title="Sessões Encerradas">{st.sessionsClosed}</span>
                    </td>
                    <td className="p-2.5 text-center font-medium">
                      <span title="Em verificação">{st.ordersClaimed}</span> •{" "}
                      <strong className="text-ocean" title="Confirmados presencialmente">
                        {st.ordersConfirmed}
                      </strong>{" "}
                      •{" "}
                      <strong className="text-emerald-800" title="Entregues na mesa">
                        {st.ordersDelivered}
                      </strong>
                    </td>
                    <td className="p-2.5 text-center font-medium">
                      <span title="Preparos iniciados">{st.tasksStarted}</span> /{" "}
                      <strong className="text-ocean" title="Preparos concluídos">
                        {st.tasksCompleted}
                      </strong>
                    </td>
                    <td className="p-2.5 text-center font-bold text-ocean">{st.callsHandled}</td>
                    <td className="p-2.5 text-center font-semibold text-emerald-800">
                      {st.paymentsRecorded}
                    </td>
                    <td className="p-2.5 text-center">
                      {st.avgStars ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 font-bold text-amber-900">
                          ⭐ {st.avgStars} ({st.ratingsCount})
                        </span>
                      ) : (
                        <span className="text-slate-400">Sem aval.</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ========================================================
          AVALIAÇÕES DE ATENDIMENTO DOS GARÇONS E TRILHA DE AUDITORIA
          ======================================================== */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card flex flex-col gap-3 border-l-4 border-l-gold">
          <h2 className="text-lg font-bold text-ocean">
            ⭐ Avaliações de Atendimento Recebidas ({ratings.length})
          </h2>
          {ratings.length === 0 ? (
            <p className="text-sm text-slate-700">
              Nenhuma avaliação de cliente registrada para o período selecionado.
            </p>
          ) : (
            <ul className="flex max-h-96 flex-col gap-2.5 overflow-y-auto pr-1 text-sm">
              {ratings.map((r) => (
                <li
                  key={r.id}
                  className="rounded-xl border border-sand bg-amber-50/30 p-3 flex flex-col gap-1"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-ocean">
                      {r.dining_tables?.display_name ?? "Mesa"} • 👤 {r.staff_name_snapshot}
                    </strong>
                    <span className="font-bold text-amber-600">
                      {"★".repeat(r.stars)}
                      {"☆".repeat(5 - r.stars)} ({r.stars}/5)
                    </span>
                  </div>
                  {r.customer_name && (
                    <span className="text-xs font-semibold text-slate-700">
                      Cliente: {r.customer_name}
                    </span>
                  )}
                  {r.comment && (
                    <p className="rounded bg-white p-2 text-xs italic text-slate-800 border border-slate-100">
                      “{r.comment}”
                    </p>
                  )}
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mt-0.5">
                    <span>
                      {new Date(r.created_at).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                    <Link
                      href={`/admin/contas/${r.session_id}`}
                      className="font-semibold text-ocean hover:underline"
                    >
                      Ver sessão →
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card flex flex-col gap-3">
          <h2 className="text-lg font-bold text-ocean">
            📋 Registro Detalhado de Ações ({auditRows.length})
          </h2>
          <p className="text-xs text-slate-600">
            Histórico cronológico das tarefas assumidas no sistema durante o período.
          </p>
          {auditRows.length === 0 ? (
            <p className="text-sm text-slate-700">
              Nenhuma ação registrada para o período selecionado.
            </p>
          ) : (
            <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1 text-xs">
              {auditRows.map((a) => {
                const actorName = a.actor_id
                  ? (staffNameMap.get(a.actor_id) ?? "Funcionário")
                  : "Cliente na Mesa (QR Code)";
                return (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-slate-50/70 px-3 py-2"
                  >
                    <div>
                      <strong className="text-ocean">{actorName}</strong>
                      <span className="mx-1.5 text-slate-400">•</span>
                      <span className="font-medium text-slate-800">
                        {AUDIT_ACTION_LABEL[a.action] ?? a.action}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {new Date(a.created_at).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {profile.role === "admin" && (
        <section aria-label="Fechamento de Período e Limpeza de Base" className="card border-2 border-gold bg-amber-50/40 p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1 border-b border-sand pb-3">
            <span className="brand-tagline text-xs font-bold text-ocean">
              Administração & Banco de Dados
            </span>
            <h2 className="text-xl font-bold text-[#14213d]">
              Fechamento de Período & Limpeza de Base (Economizar Espaço)
            </h2>
            <p className="text-sm text-slate-700">
              Gere o relatório contábil em CSV de meses ou semanas passadas e remova apenas as sessões e pedidos que já foram 100% quitados e fechados, mantendo o banco leve e performático no Supabase.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Passo 1 */}
            <div className="flex flex-col justify-between rounded-2xl border border-sand bg-white p-5 shadow-xs">
              <div>
                <span className="chip chip-on text-xs font-bold">Passo 1: Backup Fiscal Obrigatório</span>
                <h3 className="mt-2 font-bold text-ocean text-base">
                  Exportar Relatório Consolidado do Período
                </h3>
                <p className="mt-1 text-xs text-slate-700 leading-relaxed">
                  Antes de qualquer exclusão, faça o download do arquivo CSV com todas as vendas, itens e recebimentos do período selecionado ({de} até {ate}) para guardar no seu computador ou enviar à contabilidade.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100">
                <Link
                  href={`/admin/relatorios/export?${qs}`}
                  className="btn btn-gold w-full text-xs font-bold uppercase tracking-wider"
                >
                  Baixar Relatório CSV ({de} a {ate})
                </Link>
              </div>
            </div>

            {/* Passo 2 */}
            <div className="flex flex-col justify-between rounded-2xl border border-red-300 bg-white p-5 shadow-xs">
              <div>
                <span className="chip chip-open text-xs font-bold border-red-400 text-red-900 bg-red-50">
                  Passo 2: Expurgo Seguro de Histórico Fechado
                </span>
                <h3 className="mt-2 font-bold text-red-900 text-base">
                  Limpar Sessões e Pedidos Anteriores
                </h3>
                <p className="mt-1 text-xs text-slate-700 leading-relaxed">
                  Remove definitivamente apenas sessões com status <strong>Fechada</strong> e saldo <strong>Quitado</strong> anteriores à data escolhida. <strong className="text-red-900">Mesas abertas NUNCA são apagadas.</strong>
                </p>
              </div>

              <form action={purgeClosedHistoryAction} className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-3">
                <label className="flex flex-col gap-1 text-xs font-bold text-slate-800">
                  Data de corte (expurgar sessões fechadas antes de):
                  <input
                    type="date"
                    name="before_date"
                    defaultValue={de}
                    required
                    className="input h-10 text-xs"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs font-bold text-slate-800">
                  Digite <span className="text-red-700">CONFIRMAR</span> para autorizar a limpeza:
                  <input
                    type="text"
                    name="confirmation"
                    placeholder="CONFIRMAR"
                    required
                    className="input h-10 text-xs font-bold uppercase tracking-wider text-red-900"
                  />
                </label>

                <button
                  type="submit"
                  className="btn border-red-600 bg-red-600 text-white hover:bg-red-700 text-xs font-bold uppercase tracking-wider shadow-sm mt-1"
                >
                  Concluir Fechamento e Limpar Histórico
                </button>
              </form>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
