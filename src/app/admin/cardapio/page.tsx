import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { createCategory, updateCategory } from "./actions";

type Prod = { id: string; name: string; price_cents: number; status: string; available: boolean; sector: string; image_path: string | null; category_id: string };
type Cat = { id: string; name: string; status: string };

const STATUS: Record<string, string> = { draft: "Rascunho", published: "Publicado", archived: "Arquivado" };

export default async function CardapioPage({ searchParams }: { searchParams: Promise<{ q?: string; s?: string; msg?: string }> }) {
  const { supabase, profile } = await requireStaff(["admin", "manager"]);
  void profile;
  const { q = "", s = "", msg } = await searchParams;

  const { data: cats, error: e1 } = await supabase.from("menu_categories").select("id, name, status").order("sort_order");
  let pq = supabase.from("products").select("id, name, price_cents, status, available, sector, image_path, category_id").order("sort_order").order("name");
  if (q) pq = pq.ilike("name", `%${q.replace(/[%_]/g, "")}%`);
  if (s) pq = pq.eq("status", s);
  const { data: prods, error: e2 } = await pq;
  const categories = (cats ?? []) as Cat[];
  const products = (prods ?? []) as Prod[];
  const empty = categories.length === 0 && products.length === 0 && !q && !s;

  return (
    <main className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold md:text-3xl">Cardápio</h1>
        {categories.length > 0 && <Link href="/admin/cardapio/produto/novo" className="btn btn-primary">Novo produto</Link>}
      </header>

      {msg && <p role="status" className="rounded-xl border border-sky-400 bg-sky-50 p-3 text-sky-950">{msg}</p>}
      {(e1 || e2) && <p role="alert" className="rounded-xl border border-red-400 bg-red-50 p-3 text-red-900">Não foi possível carregar o cardápio.</p>}

      {empty && (
        <section className="card text-center">
          <h2 className="text-xl font-bold">Seu cardápio ainda está vazio</h2>
          <p className="mt-1 text-slate-700">Comece criando uma categoria (ex.: Bebidas, Porções) e depois cadastre seu primeiro produto.</p>
        </section>
      )}

      <section className="card">
        <h2 className="mb-2 font-semibold">Nova categoria</h2>
        <form action={createCategory} className="flex flex-wrap gap-2">
          <input name="name" placeholder="Nome da categoria" aria-label="Nome da categoria" required className="input min-w-0 flex-1" />
          <button className="btn btn-primary">Criar categoria</button>
        </form>
      </section>

      {categories.length === 0 && empty === false && <p className="card text-center">Nenhuma categoria cadastrada.</p>}
      {categories.length > 0 && products.length === 0 && empty && null}
      {categories.length > 0 && !products.length && !q && !s && (
        <section className="card text-center">
          <p className="mb-3">Nenhum produto ainda.</p>
          <Link href="/admin/cardapio/produto/novo" className="btn btn-primary">Cadastrar primeiro produto</Link>
        </section>
      )}

      {categories.length > 0 && (
        <>
          <form className="card flex flex-wrap gap-2" role="search">
            <input name="q" defaultValue={q} placeholder="Buscar produto" aria-label="Buscar produto" className="input min-w-0 flex-1" />
            <select name="s" defaultValue={s} aria-label="Filtrar por status" className="input">
              <option value="">Todos os status</option>
              <option value="draft">Rascunho</option>
              <option value="published">Publicado</option>
              <option value="archived">Arquivado</option>
            </select>
            <button className="btn">Filtrar</button>
          </form>

          {categories.map((c) => {
            const list = products.filter((p) => p.category_id === c.id);
            return (
              <section key={c.id} className="flex flex-col gap-3">
                <form action={updateCategory} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="name" defaultValue={c.name} aria-label={`Nome da categoria ${c.name}`} className="input min-w-0 flex-1 text-lg font-bold" />
                  <select name="status" defaultValue={c.status} aria-label="Status da categoria" className="input">
                    <option value="draft">Rascunho</option>
                    <option value="published">Publicada</option>
                    <option value="archived">Arquivada</option>
                  </select>
                  <button className="btn">Salvar</button>
                </form>
                {list.length === 0 ? (
                  <p className="text-sm text-slate-700">Sem produtos {q || s ? "para este filtro" : "nesta categoria"}.</p>
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {list.map((p) => (
                      <li key={p.id}>
                        <Link href={`/admin/cardapio/produto/${p.id}`} className="card flex h-full flex-col gap-2 hover:border-ocean">
                          <div className="flex items-start gap-2">
                            <h3 className="mr-auto font-bold">{p.name}</h3>
                            <span className="font-bold text-ocean">{formatCents(p.price_cents)}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className={`chip ${p.status === "published" ? "chip-on" : ""}`}>{STATUS[p.status]}</span>
                            {!p.available && <span className="chip chip-open">Indisponível</span>}
                            <span className="chip">{p.sector === "bar" ? "Bar" : "Cozinha"}</span>
                            {!p.image_path && <span className="chip">Sem foto</span>}
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </>
      )}
    </main>
  );
}
