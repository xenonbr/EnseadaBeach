import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";

export const metadata: Metadata = {
  title: "Cardápio | Cabana Enseada Beach Trancoso",
  description: "Cardápio da Cabana Enseada Beach, Praia dos Coqueiros, Trancoso.",
};

type Prod = { id: string; name: string; description: string | null; price_cents: number; available: boolean; image_path: string | null; category_id: string };

export default async function CardapioPublico() {
  const supabase = await createClient();
  const [{ data: cats, error: e1 }, { data: prods, error: e2 }] = await Promise.all([
    supabase.from("menu_categories").select("id, name").order("sort_order"),
    supabase.from("products").select("id, name, description, price_cents, available, image_path, category_id").order("sort_order").order("name"),
  ]);
  const categories = cats ?? [];
  const products = (prods ?? []) as Prod[];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-4 md:p-8">
      <header className="flex items-center gap-3">
        <Link href="/" className="btn">← Início</Link>
        <h1 className="text-2xl font-bold text-ocean md:text-3xl">Cardápio</h1>
      </header>

      {(e1 || e2) && <p role="alert" className="rounded-xl border border-red-400 bg-red-50 p-3 text-red-900">Não foi possível carregar o cardápio agora. Tente novamente em instantes.</p>}

      {!e1 && !e2 && products.length === 0 && (
        <section className="card text-center">
          <p className="text-lg">Estamos preparando nosso cardápio. Em breve, teremos novidades para você.</p>
        </section>
      )}

      {categories.map((c) => {
        const list = products.filter((p) => p.category_id === c.id);
        if (list.length === 0) return null;
        return (
          <section key={c.id} className="flex flex-col gap-3">
            <h2 className="border-b-2 border-gold pb-1 text-xl font-bold">{c.name}</h2>
            <ul className="flex flex-col gap-3">
              {list.map((p) => (
                <li key={p.id} className="card flex gap-3">
                  {p.image_path && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={supabase.storage.from("menu-images").getPublicUrl(p.image_path).data.publicUrl}
                      alt={p.name}
                      className="size-24 shrink-0 rounded-xl object-cover"
                    />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-start gap-2">
                      <h3 className="mr-auto font-bold">{p.name}</h3>
                      <span className="font-bold text-ocean">{formatCents(p.price_cents)}</span>
                    </div>
                    {p.description && <p className="text-sm text-slate-700">{p.description}</p>}
                    {!p.available && <span className="chip chip-open w-fit">Indisponível no momento</span>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
