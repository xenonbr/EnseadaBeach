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

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Mesas</h1>
      <p className="text-sm text-slate-700">
        As mesas cadastradas são capacidade inicial; ative apenas as que existem de fato.
      </p>
      {msg && <p role="status" className="rounded-lg border border-sky-300 bg-sky-50 p-3">{msg}</p>}
      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3">Não foi possível carregar as mesas.</p>}

      <form className="flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Buscar mesa" aria-label="Buscar mesa" className="h-11 rounded-lg border px-3" />
        <select name="f" defaultValue={f} aria-label="Filtrar" className="h-11 rounded-lg border px-3">
          <option value="">Todas</option><option value="ativas">Ativas</option><option value="inativas">Desativadas</option>
        </select>
        <button className="h-11 rounded-lg border px-4">Filtrar</button>
      </form>

      <form action={addTable} className="flex flex-wrap gap-2">
        <input name="name" placeholder="Nova mesa (ex.: Mesa 41)" aria-label="Nome da nova mesa" className="h-11 rounded-lg border px-3" />
        <button className="h-11 rounded-lg bg-[#0047FF] px-4 font-semibold text-white">Adicionar mesa</button>
      </form>

      {rows.length === 0 && !error && <p>Nenhuma mesa encontrada.</p>}
      <ul className="flex flex-col gap-3">
        {rows.map((t) => {
          const open = t.table_sessions.find((s) => s.status === "open");
          return (
            <li key={t.id} className="flex flex-col gap-2 rounded-xl border bg-white p-4">
              <div className="flex flex-wrap items-center gap-3">
                <strong className="text-lg">{t.display_name}</strong>
                <span className="rounded-full border px-3 py-1 text-sm">{t.active ? "Ativa" : "Desativada"}</span>
                <span className="rounded-full border px-3 py-1 text-sm">{open ? "Sessão aberta" : "Sem sessão"}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <form action={renameTable} className="flex gap-2">
                  <input type="hidden" name="id" value={t.id} />
                  <input name="name" defaultValue={t.display_name} aria-label={`Renomear ${t.display_name}`} className="h-10 rounded-lg border px-2" />
                  <button className="h-10 rounded-lg border px-3">Salvar nome</button>
                </form>
                <form action={setActive}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="active" value={String(!t.active)} />
                  {t.active && open && (
                    <label className="mr-2 text-sm"><input type="checkbox" name="force" value="true" /> Forçar (mantém a sessão aberta)</label>
                  )}
                  <button className="h-10 rounded-lg border px-3">{t.active ? "Desativar" : "Ativar"}</button>
                </form>
                {t.active && !open && (
                  <form action={openSession}><input type="hidden" name="id" value={t.id} /><button className="h-10 rounded-lg border px-3">Abrir sessão</button></form>
                )}
                {open && (
                  <form action={closeSession}><input type="hidden" name="session" value={open.id} /><button className="h-10 rounded-lg border px-3">Encerrar sessão</button></form>
                )}
                <Link href={`/admin/mesas/${t.id}/qr`} className="inline-flex h-10 items-center rounded-lg border px-3">QR Code</Link>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
