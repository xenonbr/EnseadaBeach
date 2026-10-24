import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";

type SessionRow = {
  id: string;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  dining_tables: { display_name: string } | null;
  orders: { status: string; total_cents: number }[];
  session_payments: { amount_cents: number; reversed_at: string | null }[];
  session_adjustments: { amount_cents: number }[];
};

const VALID_CONSUMPTION_STATUSES = new Set([
  "CONFIRMADO",
  "EM_PREPARACAO",
  "PARCIALMENTE_PRONTO",
  "PRONTO",
  "ENTREGUE",
]);

export default async function ContasPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; msg?: string }>;
}) {
  const { supabase } = await requireStaff(["admin", "manager", "attendant"]);
  const { f = "abertas", msg } = await searchParams;

  let query = supabase
    .from("table_sessions")
    .select(
      "id, status, opened_at, closed_at, dining_tables(display_name), orders(status, total_cents), session_payments(amount_cents, reversed_at), session_adjustments(amount_cents)",
    )
    .order("opened_at", { ascending: false });

  if (f === "abertas") {
    query = query.eq("status", "open");
  } else {
    query = query.eq("status", "closed");
  }

  const { data, error } = await query.limit(60);
  const sessions = (data ?? []) as unknown as SessionRow[];

  return (
    <main className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Contas e Recebimentos por Sessão</h1>
          <p className="text-slate-700">
            Consolida consumo válido, ajustes autorizados, pagamentos presenciais e saldo pendente.
          </p>
        </div>
        <RealtimeRefresh tables={["table_sessions", "orders", "session_payments", "session_adjustments"]} />
      </header>

      {msg && (
        <p role="status" className="rounded-xl border border-sky-400 bg-sky-50 p-3 text-sky-950">
          {msg}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-red-400 bg-red-50 p-3 text-red-900">
          Não foi possível carregar as sessões.
        </p>
      )}

      <nav aria-label="Filtro de sessões" className="flex flex-wrap gap-2">
        <Link
          href="/admin/contas?f=abertas"
          className={`btn ${f === "abertas" ? "btn-primary" : ""}`}
        >
          Sessões Abertas
        </Link>
        <Link
          href="/admin/contas?f=encerradas"
          className={`btn ${f === "encerradas" ? "btn-primary" : ""}`}
        >
          Sessões Encerradas Recentes
        </Link>
      </nav>

      {sessions.length === 0 && !error && (
        <section className="card text-center text-slate-700">
          Nenhuma sessão {f === "abertas" ? "aberta" : "encerrada"} encontrada.
        </section>
      )}

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sessions.map((s) => {
          const consumed = s.orders
            .filter((o) => VALID_CONSUMPTION_STATUSES.has(o.status))
            .reduce((acc, o) => acc + o.total_cents, 0);
          const unconfirmed = s.orders
            .filter(
              (o) => o.status === "AGUARDANDO_CONFIRMACAO" || o.status === "EM_VERIFICACAO",
            )
            .reduce((acc, o) => acc + o.total_cents, 0);
          const adj = s.session_adjustments.reduce((acc, a) => acc + a.amount_cents, 0);
          const paid = s.session_payments
            .filter((p) => !p.reversed_at)
            .reduce((acc, p) => acc + p.amount_cents, 0);
          const net = Math.max(0, consumed + adj);
          const balance = Math.max(0, net - paid);

          return (
            <li
              key={s.id}
              className={`card flex flex-col gap-3 ${
                s.status === "open" ? "border-l-4 border-l-turquoise" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-bold text-ocean">
                  {s.dining_tables?.display_name ?? "Mesa"}
                </h2>
                <span className={`chip ${s.status === "open" ? "chip-open" : "chip-on"}`}>
                  {s.status === "open" ? "Sessão aberta" : "Encerrada"}
                </span>
              </div>

              <p className="text-xs text-slate-700">
                Aberta em{" "}
                {new Date(s.opened_at).toLocaleString("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </p>

              <dl className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-600">Consumo confirmado</dt>
                  <dd className="font-bold">{formatCents(consumed)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-600">Recebido</dt>
                  <dd className="font-bold text-emerald-800">{formatCents(paid)}</dd>
                </div>
                {unconfirmed > 0 && (
                  <div className="col-span-2">
                    <dt className="text-xs text-amber-900">Aguardando confirmação presencial</dt>
                    <dd className="font-semibold text-amber-900">{formatCents(unconfirmed)}</dd>
                  </div>
                )}
                <div className="col-span-2 border-t pt-2">
                  <dt className="text-xs font-semibold text-slate-700">Saldo pendente</dt>
                  <dd className="text-lg font-bold text-ocean">{formatCents(balance)}</dd>
                </div>
              </dl>

              <Link href={`/admin/contas/${s.id}`} className="btn btn-primary mt-auto w-full">
                Abrir Conta e Recebimentos
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
