import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CardapioClient, type PublicCategory, type PublicProduct } from "./CardapioClient";

export const metadata: Metadata = {
  title: "Cardápio Gastronômico | Cabana Enseada Beach Trancoso",
  description:
    "Cardápio oficial da Cabana Enseada Beach na Praia dos Coqueiros, Trancoso. Frutos do mar, moquecas, petiscos e coquetelaria autoral pé na areia.",
};

type RawProduct = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  available: boolean;
  image_path: string | null;
};

export default async function CardapioPublico() {
  const supabase = await createClient();
  const [{ data: cats, error: e1 }, { data: prods, error: e2 }, { data: siteData }] =
    await Promise.all([
      supabase.from("menu_categories").select("id, name").order("sort_order"),
      supabase
        .from("products")
        .select("id, name, description, price_cents, available, image_path, category_id")
        .order("sort_order")
        .order("name"),
      supabase.from("site_settings").select("address_line, opening_hours, whatsapp").eq("id", 1).maybeSingle(),
    ]);

  const categories = (cats ?? []) as PublicCategory[];
  const rawProducts = (prods ?? []) as RawProduct[];
  const addressLine = siteData?.address_line || "Praia dos Coqueiros, Trancoso, Porto Seguro - BA";
  const openingHours = siteData?.opening_hours || "Todos os dias, das 09h às 18h";

  const products: PublicProduct[] = rawProducts.map((p) => ({
    id: p.id,
    category_id: p.category_id,
    name: p.name,
    description: p.description,
    price_cents: p.price_cents,
    available: p.available,
    image_url: p.image_path
      ? supabase.storage.from("menu-images").getPublicUrl(p.image_path).data.publicUrl
      : null,
  }));

  return (
    <div className="flex min-h-screen flex-col bg-[#fbf8f2] text-[#14213d] selection:bg-[#f6b600] selection:text-[#14213d]">
      {/* ========================================================
          CABEÇALHO REFINADO COM IDENTIDADE DO BRAND KIT
          ======================================================== */}
      <header className="sticky top-0 z-40 border-b border-[#e8dcc6]/70 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="group flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.jpg"
              alt="Logo Cabana Enseada Beach"
              className="h-11 w-11 rounded-full object-cover ring-2 ring-[#00c2d1] transition-transform duration-300 group-hover:scale-105"
            />
            <div className="flex flex-col">
              <span className="font-sans text-[10px] font-extrabold tracking-[0.25em] text-[#0047ff] uppercase">
                Cabana
              </span>
              <span className="font-serif text-lg font-bold tracking-tight text-[#14213d]">
                Enseada Beach
              </span>
              <span className="font-sans text-[9px] font-semibold tracking-wider text-[#00c2d1] uppercase">
                Trancoso • Bahia
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex h-9 items-center justify-center rounded-full border border-[#e8dcc6] bg-white px-4 font-sans text-xs font-bold uppercase tracking-wider text-[#14213d] transition-colors hover:border-[#0047ff] hover:text-[#0047ff]"
            >
              ← Voltar ao Início
            </Link>
          </div>
        </div>
      </header>

      {/* ========================================================
          HERO DE APRESENTAÇÃO DO CARDÁPIO (ATMOSFERA DE PRAIA)
          ======================================================== */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#0036c4] via-[#0047ff] to-[#00278a] px-4 py-12 text-center text-white sm:px-6 md:py-16">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/10 via-transparent to-black/30" />

        <div className="relative mx-auto max-w-3xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1 backdrop-blur-md">
            <span className="font-sans text-[11px] font-bold tracking-[0.2em] text-[#00c2d1] uppercase">
              Gastronomia & Bar • Praia dos Coqueiros
            </span>
          </div>

          <h1 className="font-serif text-3xl font-bold tracking-tight text-white sm:text-5xl">
            Cardápio à Beira-Mar
          </h1>

          <p className="mt-3 font-sans text-sm text-white/90 sm:text-base sm:leading-relaxed">
            Sabores frescos da Costa do Descobrimento, moquecas perfumadas no dendê, pescados nobres e coquetelaria autoral para desfrutar com o pé na areia.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-white/80">
            <span className="rounded-full bg-white/10 px-3 py-1 backdrop-blur-xs">
              📍 {addressLine}
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 backdrop-blur-xs">
              🕒 {openingHours}
            </span>
          </div>
        </div>
      </section>

      {/* ========================================================
          CONTEÚDO PRINCIPAL DO CARDÁPIO (INTERATIVO)
          ======================================================== */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 md:py-12">
        {(e1 || e2) && (
          <div
            role="alert"
            className="mb-8 rounded-2xl border border-red-300 bg-red-50 p-4 text-center text-sm text-red-900 shadow-xs"
          >
            Não foi possível carregar o cardápio em tempo real no momento. Por favor, tente novamente em alguns instantes.
          </div>
        )}

        <CardapioClient categories={categories} products={products} />
      </main>

      {/* ========================================================
          RODAPÉ LUXUOSO (PADRÃO BEIJUPIRÁ)
          ======================================================== */}
      <footer className="mt-auto border-t border-[#14213d]/20 bg-[#14213d] text-white/80">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.jpg"
                alt="Cabana Enseada Beach"
                className="h-10 w-10 rounded-full object-cover ring-2 ring-[#f6b600]"
              />
              <div className="text-left">
                <span className="font-sans text-[10px] font-extrabold tracking-[0.2em] text-[#00c2d1] uppercase">
                  Cabana
                </span>
                <p className="font-serif text-base font-bold text-white">
                  Enseada Beach Trancoso
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 text-xs">
              <Link href="/" className="hover:text-white transition-colors">
                Início
              </Link>
              <Link href="/privacidade" className="text-[#00c2d1] hover:underline">
                Privacidade & LGPD
              </Link>
              <Link href="/login" className="text-white/40 hover:text-white/80 transition-colors">
                Acesso Equipe
              </Link>
            </div>
          </div>

          <div className="mt-8 border-t border-white/10 pt-6 text-center text-[11px] text-white/50">
            © {new Date().getFullYear()} Cabana Enseada Beach Trancoso • Praia dos Coqueiros, Porto Seguro - BA
          </div>
        </div>
      </footer>
    </div>
  );
}
