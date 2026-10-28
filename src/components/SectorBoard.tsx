import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";
import {
  completeTaskAction,
  startTaskAction,
  toggleSectorProductAction,
} from "@/app/admin/producao/actions";

type TaskRow = {
  id: string;
  sector: "kitchen" | "bar";
  status: "PENDING" | "IN_PROGRESS" | "READY" | "CANCELLED";
  created_at: string;
  started_at: string | null;
  started_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  orders: {
    id: string;
    order_number: number;
    status: string;
    customer_name: string | null;
    notes: string | null;
    confirmed_at: string | null;
    confirmed_by: string | null;
    dining_tables: { display_name: string } | null;
    order_items: {
      id: string;
      product_name_snapshot: string;
      quantity: number;
      sector_snapshot: string;
      notes: string | null;
      order_item_options: {
        group_name_snapshot: string;
        option_name_snapshot: string;
      }[];
    }[];
  } | null;
};

type ProfileRow = {
  id: string;
  full_name: string;
};

type SectorProd = {
  id: string;
  name: string;
  available: boolean;
  status: string;
};

const TASK_LABEL: Record<string, string> = {
  PENDING: "Aguardando início",
  IN_PROGRESS: "Em preparo",
  READY: "Pronto neste setor",
  CANCELLED: "Cancelada",
};

export async function SectorBoard({
  sector,
  basePath,
  title,
  searchParams,
}: {
  sector: "kitchen" | "bar";
  basePath: "/admin/cozinha" | "/admin/bar";
  title: string;
  searchParams: { f?: string; msg?: string };
}) {
  const allowedRoles =
    sector === "kitchen"
      ? (["admin", "manager", "attendant", "kitchen"] as const)
      : (["admin", "manager", "attendant", "bar"] as const);

  const { supabase, profile } = await requireStaff([...allowedRoles]);
  const canOperate =
    profile.role === "admin" ||
    profile.role === "manager" ||
    profile.role === sector;

  const { f = "fila", msg } = searchParams;

  let query = supabase
    .from("production_tasks")
    .select(
      "id, sector, status, created_at, started_at, started_by, completed_at, completed_by, orders(id, order_number, status, customer_name, notes, confirmed_at, confirmed_by, dining_tables(display_name), order_items(id, product_name_snapshot, quantity, sector_snapshot, notes, order_item_options(group_name_snapshot, option_name_snapshot)))",
    )
    .eq("sector", sector)
    .order("created_at", { ascending: true });

  if (f === "fila") {
    query = query.in("status", ["PENDING", "IN_PROGRESS"]);
  } else if (f === "prontos") {
    query = query.eq("status", "READY");
  }

  const [{ data: taskData, error }, { data: prodData }, { data: profilesData }, { data: serverTime }] =
    await Promise.all([
      query.limit(80),
      supabase
        .from("products")
        .select("id, name, available, status")
        .eq("sector", sector)
        .eq("status", "published")
        .order("name"),
      supabase.from("profiles").select("id, full_name"),
      supabase
        .rpc("resolve_table", { p_token: "" })
        .then(() => ({ data: new Date().toISOString() })),
    ]);

  const tasks = (taskData ?? []) as unknown as TaskRow[];
  const sectorProducts = (prodData ?? []) as SectorProd[];
  const staffMap = new Map<string, string>();
  for (const p of (profilesData ?? []) as ProfileRow[]) {
    staffMap.set(p.id, p.full_name);
  }
  const staffName = (id: string | null | undefined) =>
    id ? (staffMap.get(id) ?? "Funcionário") : null;
  const nowMs = new Date(serverTime).getTime();

  return (
    <main className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
          <p className="text-slate-700">
            Exibe exclusivamente tarefas liberadas após confirmação presencial do atendente.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RealtimeRefresh tables={["production_tasks", "orders"]} />
          <Link href={`${basePath}?f=${encodeURIComponent(f)}`} className="btn">
            Atualizar
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
          Não foi possível carregar as tarefas de produção.
        </p>
      )}

      <nav aria-label="Filtro de tarefas" className="flex flex-wrap gap-2">
        <Link
          href={`${basePath}?f=fila`}
          className={`btn ${f === "fila" ? "btn-primary" : ""}`}
        >
          Fila de Preparo (Pendentes / Em andamento)
        </Link>
        <Link
          href={`${basePath}?f=prontos`}
          className={`btn ${f === "prontos" ? "btn-primary" : ""}`}
        >
          Concluídos no Setor
        </Link>
      </nav>

      {tasks.length === 0 && !error && (
        <section className="card text-center text-slate-700">
          Nenhuma tarefa {f === "fila" ? "pendente de preparo" : "concluída"} neste setor no momento.
        </section>
      )}

      <ul className="grid gap-4 md:grid-cols-2">
        {tasks.map((t) => {
          const ord = t.orders;
          if (!ord) return null;
          const items = ord.order_items.filter((i) => i.sector_snapshot === sector);
          const waitMin = Math.max(
            0,
            Math.floor((nowMs - new Date(t.created_at).getTime()) / 60000),
          );
          const isDelayed = t.status !== "READY" && waitMin >= 15;

          return (
            <li
              key={t.id}
              className={`card flex flex-col gap-3 ${
                isDelayed
                  ? "border-l-4 border-l-red-600"
                  : t.status === "IN_PROGRESS"
                    ? "border-l-4 border-l-gold"
                    : "border-l-4 border-l-turquoise"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xl font-bold text-ocean">
                    {ord.dining_tables?.display_name ?? "Mesa"} • Pedido #{ord.order_number}
                  </span>
                  {ord.customer_name && (
                    <span className="ml-2 text-sm font-semibold text-slate-700">
                      ({ord.customer_name})
                    </span>
                  )}
                </div>
                <span
                  className={`chip ${
                    t.status === "READY"
                      ? "chip-on"
                      : t.status === "IN_PROGRESS"
                        ? "chip-open"
                        : ""
                  }`}
                >
                  {TASK_LABEL[t.status] ?? t.status}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700">
                <span>
                  Liberado às{" "}
                  {new Date(t.created_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className={isDelayed ? "font-bold text-red-700" : "font-semibold"}>
                  Espera: {waitMin} min {isDelayed ? "(Atenção: mais de 15 min)" : ""}
                </span>
              </div>

              <ul className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 text-base">
                {items.map((it) => (
                  <li
                    key={it.id}
                    className="flex flex-col gap-1 border-b pb-2 last:border-b-0 last:pb-0"
                  >
                    <strong className="text-lg">
                      {it.quantity}x {it.product_name_snapshot}
                    </strong>
                    {it.order_item_options.length > 0 && (
                      <p className="text-sm font-medium text-ocean">
                        {it.order_item_options
                          .map((op) => `${op.group_name_snapshot}: ${op.option_name_snapshot}`)
                          .join(" • ")}
                      </p>
                    )}
                    {it.notes && (
                      <p className="rounded bg-amber-100 px-2 py-1 text-sm font-semibold text-amber-950">
                        Obs. item: {it.notes}
                      </p>
                    )}
                  </li>
                ))}
              </ul>

              {ord.notes && (
                <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-950">
                  <strong>Obs. do pedido:</strong> {ord.notes}
                </p>
              )}

              {/* Controle interno de quem assumiu o pedido e o preparo */}
              <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                {ord.confirmed_by && (
                  <span>
                    ✅ Confirmado na mesa por: <strong className="text-ocean">{staffName(ord.confirmed_by)}</strong>
                  </span>
                )}
                {t.started_by && (
                  <span>
                    • 👨‍🍳 Preparo assumido por: <strong className="text-ocean">{staffName(t.started_by)}</strong>
                  </span>
                )}
                {t.completed_by && (
                  <span>
                    • 🏁 Concluído por: <strong className="text-emerald-800">{staffName(t.completed_by)}</strong>
                  </span>
                )}
              </div>

              {canOperate && t.status !== "READY" && t.status !== "CANCELLED" && (
                <div className="mt-auto grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2">
                  {t.status === "PENDING" && (
                    <form action={startTaskAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="return_to" value={`${basePath}?f=${f}`} />
                      <button className="btn h-12 w-full text-base">Iniciar preparo</button>
                    </form>
                  )}
                  <form
                    action={completeTaskAction}
                    className={t.status === "PENDING" ? "" : "sm:col-span-2"}
                  >
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="return_to" value={`${basePath}?f=${f}`} />
                    <button className="btn btn-primary h-12 w-full text-base">
                      Concluir preparo ({sector === "bar" ? "Bar" : "Cozinha"})
                    </button>
                  </form>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {canOperate && sectorProducts.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer font-bold text-ocean">
            Disponibilidade rápida de itens deste setor ({sectorProducts.length})
          </summary>
          <p className="mt-1 text-sm text-slate-700">
            Se faltar algum insumo, marque o item como indisponível para bloquear novos pedidos imediatamente.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sectorProducts.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-xl border p-2.5"
              >
                <div>
                  <strong className="block text-sm">{p.name}</strong>
                  <span className={`chip mt-1 ${p.available ? "chip-on" : "chip-open"}`}>
                    {p.available ? "Disponível" : "Indisponível"}
                  </span>
                </div>
                <form action={toggleSectorProductAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="available" value={String(!p.available)} />
                  <input type="hidden" name="return_to" value={`${basePath}?f=${f}`} />
                  <button className="btn h-9 px-3 text-xs">
                    {p.available ? "Pausar item" : "Reativar"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
