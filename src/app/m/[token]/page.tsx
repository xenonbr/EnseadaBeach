import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TableOrderClient, type MenuCategory, type MenuProduct } from "./TableOrderClient";

export const metadata: Metadata = {
  title: "Mesa & Pedidos | Cabana Enseada Beach Trancoso",
  robots: { index: false, follow: false },
};

export default async function MesaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = /^[0-9a-f]{32,64}$/i.test(token);
  const supabase = await createClient();
  const { data } = valid ? await supabase.rpc("resolve_table", { p_token: token }) : { data: null };
  const mesa = data?.[0] as { display_name: string; active: boolean; has_open_session: boolean } | undefined;

  if (!mesa) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6 text-center bg-[#fbf8f2] text-[#14213d]">
        <div className="rounded-3xl border border-[#e8dcc6] bg-white p-8 shadow-lg">
          <span className="text-4xl">⚠️</span>
          <h1 className="mt-3 font-serif text-2xl font-bold text-[#0047ff]">
            QR Code não reconhecido
          </h1>
          <p className="mt-2 text-sm text-[#14213d]/70 leading-relaxed">
            Esta mesa não foi localizada ou o link foi modificado. Por favor, aponte a câmera novamente para o QR Code da sua mesa ou solicite ajuda a um de nossos atendentes na praia.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex h-10 items-center justify-center rounded-full bg-[#f6b600] px-6 font-sans text-xs font-bold text-[#14213d] uppercase tracking-wider hover:bg-[#e0a500]"
          >
            Ir para página inicial
          </Link>
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
    <div className="flex min-h-screen flex-col bg-[#fbf8f2] text-[#14213d] selection:bg-[#f6b600] selection:text-[#14213d]">
      {/* Header Institucional da Mesa */}
      <header className="sticky top-0 z-40 border-b border-[#e8dcc6]/70 bg-white/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.jpg"
              alt="Cabana Enseada Beach"
              className="h-10 w-10 rounded-full object-cover ring-2 ring-[#00c2d1]"
            />
            <div>
              <span className="font-sans text-[9px] font-extrabold tracking-[0.2em] text-[#0047ff] uppercase">
                Cabana Enseada Beach
              </span>
              <p className="font-serif text-sm font-bold text-[#14213d]">
                Trancoso • Praia dos Coqueiros
              </p>
            </div>
          </div>

          <Link
            href="/cardapio"
            className="text-[11px] font-bold text-[#0047ff] hover:underline"
          >
            Ver Cardápio Geral
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 p-4 sm:p-6">
        {/* Card de Identificação da Mesa */}
        <section className="rounded-3xl border border-[#e8dcc6] bg-white p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="font-sans text-[10px] font-bold tracking-[0.2em] text-[#00c2d1] uppercase">
                Atendimento Pé na Areia
              </span>
              <h1 className="font-serif text-3xl font-bold tracking-tight text-[#14213d]">
                {mesa.display_name}
              </h1>
            </div>

            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-sans text-xs font-bold tracking-wide ${
                canOrder
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-300"
                  : "bg-amber-50 text-amber-800 border border-amber-300"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  canOrder ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                }`}
              />
              {canOrder ? "Sessão aberta para pedidos" : "Aguardando abertura pelo garçom"}
            </span>
          </div>

          {!canOrder && (
            <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50/70 p-4 text-xs text-amber-950 leading-relaxed">
              <strong className="block text-sm font-bold text-amber-900">
                Seja bem-vindo à Cabana Enseada Beach!
              </strong>
              Você já pode consultar todas as opções do cardápio abaixo. Para enviar pedidos pelo seu celular, solicite ao garçom a abertura da sessão desta mesa.
            </div>
          )}
        </section>

        {/* Cliente Interativo da Mesa */}
        <TableOrderClient
          tableToken={token}
          canOrder={canOrder}
          categories={categories}
          products={products}
        />
      </main>

      {/* Mini Rodapé da Mesa */}
      <footer className="mt-auto border-t border-[#e8dcc6] bg-white py-6 text-center text-xs text-[#14213d]/60">
        <p>Cabana Enseada Beach Trancoso • Praia dos Coqueiros</p>
        <div className="mt-2 flex justify-center gap-4 text-[11px]">
          <Link href="/privacidade" className="text-[#0047ff] hover:underline">
            Privacidade & LGPD
          </Link>
          <Link href="/cardapio" className="hover:underline">
            Cardápio
          </Link>
        </div>
      </footer>
    </div>
  );
}
