import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { addTable, closeSession, openSession, renameTable, setActive } from "./actions";

type Row = { id: string; display_name: string; active: boolean; table_sessions: { id: string; status: string }[] };

export default async function MesasPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string; msg?: string }> }) {
  const { supabase } = await requireStaff(["admin", "manager", "attendant"]);
  const { q = "", f = "", msg } = await searchParams;
  let query = supabase
    .from("dining_tables")
    .select("id, display_name, active, table_sessions(id, status)")
    .order("sort_order")
    .order("display_name");
  if (q) query = query.ilike("display_name", `%${q.replace(/[%_]/g, "")}%`);
  if (f === "ativas") query = query.eq("active", true);
  if (f === "inativas") query = query.eq("active", false);
  const { data, error } = await query;
  const rows = (data ?? []) as unknown as Row[];
  const total = rows.length;
  const ativas = rows.filter((r) => r.active).length;
  const abertas = rows.filter((r) => r.table_sessions.some((s) => s.status === "open")).length;

  return (
    <main className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Mesas</h1>
        <p className="text-slate-700">As mesas cadastradas são capacidade inicial. Ative apenas as que existem de fato.</p>
      </header>

      {msg && <p role="status" className="rounded-xl border border-sky-400 bg-sky-50 p-3 text-sky-950">{msg}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-400 bg-red-50 p-3 text-red-900">Não foi possível carregar as mesas.</p>}

      <dl className="grid grid-cols-3 gap-3">
        {[["Exibidas", total], ["Ativas", ativas], ["Com sessão", abertas]].map(([l, v]) => (
          <div key={l as string} className="card text-center">
            <dd className="text-2xl font-bold text-ocean md:text-3xl">{v}</dd>
            <dt className="text-sm text-slate-700">{l}</dt>
          </div>
        ))}
      </dl>

      <section className="card grid gap-4 lg:grid-cols-2">
        <form className="flex flex-wrap gap-2" role="search">
          <input name="q" defaultValue={q} placeholder="Buscar mesa" aria-label="Buscar mesa" className="input min-w-0 flex-1" />
          <select name="f" defaultValue={f} aria-label="Filtrar" className="input">
            <option value="">Todas</option>
            <option value="ativas">Ativas</option>
            <option value="inativas">Desativadas</option>
          </select>
          <button className="btn">Filtrar</button>
        </form>
        <form action={addTable} className="flex flex-wrap gap-2">
          <input name="name" placeholder="Nova mesa (ex.: Mesa 41)" aria-label="Nome da nova mesa" className="input min-w-0 flex-1" />
          <button className="btn btn-primary">Adicionar mesa</button>
        </form>
      </section>

      {rows.length === 0 && !error && <p className="card text-center text-slate-700">Nenhuma mesa encontrada.</p>}

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((t) => {
          const open = t.table_sessions.find((s) => s.status === "open");
          return (
            <li key={t.id} className={`card flex flex-col gap-3 ${t.active ? "border-l-4 border-l-turquoise" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="mr-auto text-lg font-bold">{t.display_name}</h2>
                <span className={`chip ${t.active ? "chip-on" : ""}`}>{t.active ? "Ativa" : "Desativada"}</span>
                <span className={`chip ${open ? "chip-open" : ""}`}>{open ? "Sessão aberta" : "Sem sessão"}</span>
              </div>

              <form action={setActive} className="flex flex-col gap-2">
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="active" value={String(!t.active)} />
                {t.active && open && (
                  <label className="text-sm">
                    <input type="checkbox" name="force" value="true" className="mr-2" />
                    Forçar desativação (a sessão continua aberta)
                  </label>
                )}
                <button className={`btn w-full ${t.active ? "" : "btn-primary"}`}>{t.active ? "Desativar mesa" : "Ativar mesa"}</button>
              </form>

              <div className="grid grid-cols-2 gap-2">
                {open ? (
                  <form action={closeSession}>
                    <input type="hidden" name="session" value={open.id} />
                    <button className="btn w-full">Encerrar sessão</button>
                  </form>
                ) : t.active ? (
                  <form action={openSession}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="btn w-full">Abrir sessão</button>
                  </form>
                ) : (
                  <button className="btn w-full opacity-50" disabled>Abrir sessão</button>
                )}
                <Link href={`/admin/mesas/${t.id}/qr`} className="btn w-full">QR Code</Link>
              </div>

              {open && (
                <Link href={`/admin/contas/${open.id}`} className="btn border-ocean text-ocean w-full">
                  Ver conta / recebimentos desta sessão
                </Link>
              )}

              <details>
                <summary className="cursor-pointer text-sm font-semibold text-ocean">Renomear</summary>
                <form action={renameTable} className="mt-2 flex gap-2">
                  <input type="hidden" name="id" value={t.id} />
                  <input name="name" defaultValue={t.display_name} aria-label={`Renomear ${t.display_name}`} className="input min-w-0 flex-1" />
                  <button className="btn">Salvar</button>
                </form>
              </details>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
