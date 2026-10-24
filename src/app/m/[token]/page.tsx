import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { TableOrderClient, type MenuCategory, type MenuProduct } from "./TableOrderClient";

export const metadata: Metadata = { title: "Mesa | Cabana Enseada Beach", robots: { index: false, follow: false } };

export default async function MesaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = /^[0-9a-f]{32,64}$/i.test(token);
  const supabase = await createClient();
  const { data } = valid ? await supabase.rpc("resolve_table", { p_token: token }) : { data: null };
  const mesa = data?.[0] as { display_name: string; active: boolean; has_open_session: boolean } | undefined;

  if (!mesa) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6 text-center">
        <div className="card">
          <h1 className="text-2xl font-bold text-ocean">QR Code não reconhecido</h1>
          <p className="mt-2 text-slate-700">Peça ajuda a um atendente para acessar o cardápio da sua mesa.</p>
        </div>
      </main>
    );
  }

  const canOrder = mesa.active && mesa.has_open_session;

  const [{ data: cats }, { data: prods }] = await Promise.all([
    supabase.from("menu_categories").select("id, name").order("sort_order"),
    supabase
      .from("products")
      .select(
        "id, category_id, name, description, price_cents, available, image_path, option_groups(id, name, min_select, max_select, sort_order, options(id, name, price_cents, available, sort_order))",
      )
      .order("sort_order")
      .order("name"),
  ]);

  type RawProductRow = {
    id: string;
    category_id: string;
    name: string;
    description: string | null;
    price_cents: number;
    available: boolean;
    image_path: string | null;
    option_groups: {
      id: string;
      name: string;
      min_select: number;
      max_select: number;
      options: { id: string; name: string; price_cents: number; available: boolean }[];
    }[];
  };

  const categories: MenuCategory[] = (cats ?? []) as MenuCategory[];
  const rawProducts = (prods ?? []) as unknown as RawProductRow[];
  const products: MenuProduct[] = rawProducts.map((p) => ({
    id: p.id,
    category_id: p.category_id,
    name: p.name,
    description: p.description,
    price_cents: p.price_cents,
    available: p.available,
    image_url: p.image_path ? supabase.storage.from("menu-images").getPublicUrl(p.image_path).data.publicUrl : null,
    option_groups: (p.option_groups ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      min_select: g.min_select,
      max_select: g.max_select,
      options: g.options ?? [],
    })),
  }));

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 p-4 md:p-6">
      <header className="card flex flex-wrap items-center justify-between gap-3 border-t-4 border-t-turquoise">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Cabana Enseada Beach Trancoso</p>
          <h1 className="text-2xl font-bold text-ocean">{mesa.display_name}</h1>
        </div>
        <span className={`chip ${canOrder ? "chip-on" : "chip-open"}`}>
          {canOrder ? "Sessão aberta para pedidos" : "Aguardando abertura pelo atendente"}
        </span>
      </header>

      {!canOrder && (
        <section className="card border-l-4 border-l-gold">
          <p className="font-semibold">Você pode consultar o cardápio abaixo.</p>
          <p className="mt-1 text-sm text-slate-700">
            Para fazer pedidos pelo celular, peça a um atendente para abrir a sessão da <strong>{mesa.display_name}</strong>.
          </p>
        </section>
      )}

      <TableOrderClient tableToken={token} canOrder={canOrder} categories={categories} products={products} />
    </main>
  );
}
