"use client";

import { useMemo, useState } from "react";
import { formatCents } from "@/lib/money";

export type PublicProduct = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  available: boolean;
  image_url: string | null;
};

export type PublicCategory = {
  id: string;
  name: string;
};

export function CardapioClient({
  categories,
  products,
}: {
  categories: PublicCategory[];
  products: PublicProduct[];
}) {
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCategory =
        selectedCategory === "ALL" || p.category_id === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        q === "" ||
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // Agrupamento por categoria quando visualizando "ALL"
  const groupedByCategory = useMemo(() => {
    if (selectedCategory !== "ALL") {
      const cat = categories.find((c) => c.id === selectedCategory);
      return [{ category: cat || { id: selectedCategory, name: "Itens" }, items: filteredProducts }];
    }

    return categories
      .map((c) => ({
        category: c,
        items: filteredProducts.filter((p) => p.category_id === c.id),
      }))
      .filter((g) => g.items.length > 0);
  }, [categories, filteredProducts, selectedCategory]);

  return (
    <div className="flex flex-col gap-8">
      {/* ========================================================
          BARRA DE BUSCA & FILTRO POR CATEGORIAS
          ======================================================== */}
      <div className="sticky top-20 z-30 -mx-4 border-b border-[#e8dcc6] bg-[#fbf8f2]/95 px-4 py-4 backdrop-blur-md sm:mx-0 sm:rounded-2xl sm:border sm:px-6 shadow-xs">
        <div className="flex flex-col gap-4">
          {/* Campo de Busca Rápida */}
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-base text-[#14213d]/40">
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por moqueca, peixe, petisco, caipirinha..."
              className="h-11 w-full rounded-xl border border-[#e8dcc6] bg-white pl-10 pr-10 text-sm text-[#14213d] placeholder:text-[#14213d]/40 focus:border-[#0047ff] focus:outline-hidden focus:ring-2 focus:ring-[#0047ff]/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-xs font-bold text-[#14213d]/50 hover:text-[#14213d]"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Abas / Pílulas de Categoria com rolagem suave */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedCategory("ALL")}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                selectedCategory === "ALL"
                  ? "bg-[#0047ff] text-white shadow-sm"
                  : "border border-[#e8dcc6] bg-white text-[#14213d]/80 hover:border-[#0047ff] hover:text-[#0047ff]"
              }`}
            >
              Todos os Itens
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCategory(c.id)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                  selectedCategory === c.id
                    ? "bg-[#0047ff] text-white shadow-sm"
                    : "border border-[#e8dcc6] bg-white text-[#14213d]/80 hover:border-[#0047ff] hover:text-[#0047ff]"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ========================================================
          LISTA DE PRODUTOS AGRUPADOS OU FILTRADOS
          ======================================================== */}
      {products.length === 0 ? (
        <div className="rounded-3xl border border-[#e8dcc6] bg-white p-12 text-center shadow-xs">
          <span className="text-4xl">🌴</span>
          <h3 className="mt-3 font-serif text-xl font-bold text-[#14213d]">
            Cardápio em preparação
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#14213d]/70">
            Estamos finalizando a seleção dos nossos pratos e bebidas com o melhor do litoral baiano. Em instantes novas opções estarão disponíveis.
          </p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="rounded-3xl border border-[#e8dcc6] bg-white p-12 text-center shadow-xs">
          <span className="text-4xl">🔎</span>
          <h3 className="mt-3 font-serif text-xl font-bold text-[#14213d]">
            Nenhum item encontrado
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#14213d]/70">
            Não encontramos nenhum prato ou bebida para a busca &ldquo;{searchQuery}&rdquo;. Tente buscar por outros termos como peixe, camarão ou caipirinha.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSelectedCategory("ALL");
            }}
            className="mt-4 inline-flex h-9 items-center justify-center rounded-full bg-[#f6b600] px-4 font-sans text-xs font-bold text-[#14213d] uppercase tracking-wider hover:bg-[#e0a500]"
          >
            Ver cardápio completo
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-12">
          {groupedByCategory.map((group) => (
            <section key={group.category.id} className="flex flex-col gap-5">
              {/* Cabeçalho da Categoria com divisor de marca */}
              <div className="flex items-center gap-3 border-b-2 border-[#f6b600] pb-2">
                <span className="h-2 w-2 rounded-full bg-[#00c2d1]" />
                <h2 className="font-serif text-2xl font-bold text-[#14213d] sm:text-3xl">
                  {group.category.name}
                </h2>
                <span className="ml-auto font-sans text-xs font-semibold text-[#14213d]/50">
                  {group.items.length} {group.items.length === 1 ? "opção" : "opções"}
                </span>
              </div>

              {/* Grade de Pratos & Bebidas */}
              <div className="grid gap-5 sm:grid-cols-2">
                {group.items.map((prod) => (
                  <article
                    key={prod.id}
                    className="group flex flex-col justify-between overflow-hidden rounded-3xl border border-[#e8dcc6] bg-white p-5 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-[#00c2d1] hover:shadow-lg"
                  >
                    <div>
                      {/* Imagem do Produto (se houver) */}
                      {prod.image_url ? (
                        <div className="relative mb-4 aspect-[16/10] w-full overflow-hidden rounded-2xl bg-[#14213d]/5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={prod.image_url}
                            alt={prod.name}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                          {!prod.available && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-xs">
                              <span className="rounded-full bg-amber-400 px-3 py-1 font-sans text-xs font-bold text-amber-950 uppercase tracking-wider">
                                Indisponível no momento
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="relative mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0047ff]/5 text-2xl text-[#0047ff]">
                          🍽️
                        </div>
                      )}

                      {/* Cabeçalho do Prato */}
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-serif text-xl font-bold text-[#14213d] transition-colors group-hover:text-[#0047ff]">
                          {prod.name}
                        </h3>
                        <span className="shrink-0 rounded-xl bg-[#f6b600]/15 px-3 py-1 font-sans text-base font-extrabold text-[#14213d]">
                          {formatCents(prod.price_cents)}
                        </span>
                      </div>

                      {/* Descrição Gastronômica */}
                      {prod.description && (
                        <p className="mt-2 text-sm leading-relaxed text-[#14213d]/75">
                          {prod.description}
                        </p>
                      )}
                    </div>

                    {/* Rodapé do Card */}
                    <div className="mt-4 flex items-center justify-between border-t border-[#e8dcc6]/60 pt-3 text-xs">
                      {prod.available ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          Disponível na praia
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-medium text-amber-800">
                          <span className="h-2 w-2 rounded-full bg-amber-500" />
                          Temporariamente esgotado
                        </span>
                      )}

                      <span className="font-sans text-[11px] font-semibold text-[#0047ff] group-hover:underline">
                        Pedir via QR na mesa
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* ========================================================
          BANNER DE INCENTIVO DE PEDIDO NA PRAIA
          ======================================================== */}
      <div className="rounded-3xl border border-[#e8dcc6] bg-gradient-to-br from-white to-[#fbf8f2] p-8 text-center shadow-md">
        <div className="mx-auto max-w-xl">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#00c2d1]/15 text-2xl text-[#00c2d1]">
            🌴
          </span>
          <h3 className="mt-3 font-serif text-2xl font-bold text-[#14213d]">
            Como pedir na sua mesa ou espreguiçadeira?
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[#14213d]/75">
            Ao se acomodar na Cabana Enseada Beach, aponte a câmera do seu celular para a plaquinha com o QR Code exclusivo da sua mesa. Você poderá montar seu pedido, escolher acompanhamentos e chamar o garçom diretamente pelo celular.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#0047ff]/10 px-4 py-1.5 text-xs font-bold text-[#0047ff]">
            <span>✨</span>
            <span>Atendimento ágil com o conforto dos pés na areia</span>
          </div>
        </div>
      </div>
    </div>
  );
}
