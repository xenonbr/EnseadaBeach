"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCents } from "@/lib/money";

export type MenuOption = {
  id: string;
  name: string;
  price_cents: number;
  available: boolean;
};

export type MenuOptionGroup = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  options: MenuOption[];
};

export type MenuProduct = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  available: boolean;
  image_url: string | null;
  option_groups: MenuOptionGroup[];
};

export type MenuCategory = {
  id: string;
  name: string;
};

type CartItem = {
  cartItemId: string;
  product_id: string;
  product_name: string;
  unit_price_cents: number;
  quantity: number;
  option_ids: string[];
  options_summary: { id: string; name: string; price_cents: number }[];
  notes: string;
};

type MyOrder = {
  id: string;
  order_number: number;
  status: string;
  customer_name: string | null;
  total_cents: number;
  notes: string | null;
  cancel_reason: string | null;
  created_at: string;
  confirmed_at: string | null;
  items: {
    id: string;
    product_name: string;
    quantity: number;
    unit_price_cents: number;
    options_price_cents: number;
    line_total_cents: number;
    notes: string | null;
    options: { group_name: string; option_name: string; price_cents: number }[];
  }[];
};

const STATUS_INFO: Record<string, { label: string; desc: string; chipClass: string }> = {
  AGUARDANDO_CONFIRMACAO: {
    label: "Aguardando confirmação presencial",
    desc: "Seu pedido foi recebido. Um atendente irá até sua mesa para confirmar antes do preparo.",
    chipClass: "bg-amber-100 text-amber-900 border border-amber-300",
  },
  EM_VERIFICACAO: {
    label: "Atendente em verificação",
    desc: "Um atendente está conferindo seu pedido presencialmente na mesa.",
    chipClass: "bg-amber-100 text-amber-900 border border-amber-300",
  },
  CONFIRMADO: {
    label: "Confirmado — liberado para preparo",
    desc: "Confirmado pelo atendente e encaminhado para cozinha/bar.",
    chipClass: "bg-sky-100 text-sky-900 border border-sky-300",
  },
  EM_PREPARACAO: {
    label: "Em preparação",
    desc: "Seu pedido está sendo preparado com carinho.",
    chipClass: "bg-blue-100 text-blue-900 border border-blue-300",
  },
  PARCIALMENTE_PRONTO: {
    label: "Parcialmente pronto",
    desc: "Parte do seu pedido já ficou pronta.",
    chipClass: "bg-indigo-100 text-indigo-900 border border-indigo-300",
  },
  PRONTO: {
    label: "Pronto para entrega",
    desc: "Seu pedido está pronto e será levado à mesa.",
    chipClass: "bg-emerald-100 text-emerald-900 border border-emerald-300",
  },
  ENTREGUE: {
    label: "Entregue na mesa",
    desc: "Pedido entregue. Bom proveito na Praia dos Coqueiros!",
    chipClass: "bg-emerald-100 text-emerald-900 border border-emerald-300",
  },
  CANCELADO: {
    label: "Cancelado",
    desc: "Este pedido foi cancelado.",
    chipClass: "bg-rose-100 text-rose-900 border border-rose-300",
  },
};

function friendlyOrderError(msg: string): string {
  if (msg.includes("MESA_INATIVA")) return "Esta mesa está desativada no momento. Fale com um atendente.";
  if (msg.includes("SESSAO_FECHADA")) return "A sessão desta mesa foi encerrada ou ainda não foi aberta. Peça a um atendente.";
  if (msg.includes("PRODUTO_INDISPONIVEL")) return "Um dos produtos escolhidos acabou de ficar indisponível. Revise seu carrinho.";
  if (msg.includes("OPCAO_INVALIDA_OU_INDISPONIVEL")) return "Um adicional selecionado não está mais disponível. Revise seu carrinho.";
  if (msg.includes("LIMITE_ADICIONAIS_INVALIDO")) return "Verifique os adicionais obrigatórios de cada item.";
  if (msg.includes("QUANTIDADE_INVALIDA")) return "Quantidade inválida em um dos itens.";
  if (msg.includes("CARRINHO_VAZIO")) return "Seu carrinho está vazio.";
  return "Não foi possível enviar o pedido agora. Verifique sua conexão e tente novamente.";
}

export function TableOrderClient({
  tableToken,
  canOrder,
  categories,
  products,
}: {
  tableToken: string;
  canOrder: boolean;
  categories: MenuCategory[];
  products: MenuProduct[];
}) {
  const cartKey = `enseada_cart_${tableToken}`;
  const clientTokenKey = "enseada_client_token";

  const [clientToken] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      let tok = localStorage.getItem(clientTokenKey);
      if (!tok || tok.length < 16) {
        tok = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
        localStorage.setItem(clientTokenKey, tok);
      }
      return tok;
    } catch {
      return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
    }
  });

  const [cart, setCart] = useState<CartItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const savedCart = localStorage.getItem(cartKey);
      if (savedCart) {
        const parsed = JSON.parse(savedCart);
        if (Array.isArray(parsed)) return parsed as CartItem[];
      }
    } catch {
      // ignora erro de leitura
    }
    return [];
  });

  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    typeof crypto !== "undefined" ? crypto.randomUUID() : "",
  );
  const [customerName, setCustomerName] = useState<string>("");
  const [orderNotes, setOrderNotes] = useState<string>("");
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>("ALL");

  // Modal de configuração de item
  const [activeProduct, setActiveProduct] = useState<MenuProduct | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [itemQty, setItemQty] = useState<number>(1);
  const [itemNotes, setItemNotes] = useState<string>("");
  const [configError, setConfigError] = useState<string | null>(null);

  // Estado de submissão e consulta de pedidos próprios
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastPlacedMsg, setLastPlacedMsg] = useState<string | null>(null);
  const [myOrders, setMyOrders] = useState<MyOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Estado do botão separado "Chamar atendente"
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [callReason, setCallReason] = useState<"AJUDA" | "DUVIDA" | "PEDIR_CONTA" | "OUTRO">("AJUDA");
  const [callDetails, setCallDetails] = useState("");
  const [callingAttendant, setCallingAttendant] = useState(false);
  const [callFeedback, setCallFeedback] = useState<string | null>(null);

  const saveCart = useCallback(
    (next: CartItem[]) => {
      setCart(next);
      setIdempotencyKey(crypto.randomUUID());
      try {
        localStorage.setItem(cartKey, JSON.stringify(next));
      } catch {
        // Ignora erro de quota do navegador
      }
    },
    [cartKey],
  );

  const loadMyOrders = useCallback(async () => {
    if (!clientToken) return;
    setLoadingOrders(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_my_orders", {
        p_table_token: tableToken,
        p_client_token: clientToken,
      });
      if (!error && Array.isArray(data)) {
        setMyOrders(data as MyOrder[]);
      }
    } finally {
      setLoadingOrders(false);
    }
  }, [clientToken, tableToken]);

  useEffect(() => {
    if (!clientToken) return;
    const supabase = createClient();
    const poll = async () => {
      const { data, error } = await supabase.rpc("get_my_orders", {
        p_table_token: tableToken,
        p_client_token: clientToken,
      });
      if (!error && Array.isArray(data)) {
        setMyOrders(data as MyOrder[]);
      }
    };
    const initial = setTimeout(() => void poll(), 50);
    const timer = setInterval(() => void poll(), 10000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [clientToken, tableToken]);

  function openConfigurator(prod: MenuProduct) {
    setActiveProduct(prod);
    setSelectedOptions({});
    setItemQty(1);
    setItemNotes("");
    setConfigError(null);
  }

  function toggleOption(group: MenuOptionGroup, optId: string) {
    setSelectedOptions((prev) => {
      const current = prev[group.id] ?? [];
      if (current.includes(optId)) {
        return { ...prev, [group.id]: current.filter((x) => x !== optId) };
      }
      if (group.max_select === 1) {
        return { ...prev, [group.id]: [optId] };
      }
      if (current.length >= group.max_select) {
        return prev;
      }
      return { ...prev, [group.id]: [...current, optId] };
    });
  }

  function confirmAddToCart() {
    if (!activeProduct) return;
    for (const g of activeProduct.option_groups) {
      const chosen = selectedOptions[g.id] ?? [];
      if (chosen.length < g.min_select) {
        setConfigError(`Selecione pelo menos ${g.min_select} opção(ões) em "${g.name}".`);
        return;
      }
      if (chosen.length > g.max_select) {
        setConfigError(`Selecione no máximo ${g.max_select} opção(ões) em "${g.name}".`);
        return;
      }
    }

    const allOptionIds = Object.values(selectedOptions).flat();
    const summary: { id: string; name: string; price_cents: number }[] = [];
    for (const g of activeProduct.option_groups) {
      for (const o of g.options) {
        if (allOptionIds.includes(o.id)) {
          summary.push({ id: o.id, name: `${g.name}: ${o.name}`, price_cents: o.price_cents });
        }
      }
    }

    const nextItem: CartItem = {
      cartItemId: crypto.randomUUID(),
      product_id: activeProduct.id,
      product_name: activeProduct.name,
      unit_price_cents: activeProduct.price_cents,
      quantity: Math.min(50, Math.max(1, itemQty)),
      option_ids: allOptionIds,
      options_summary: summary,
      notes: itemNotes.trim(),
    };

    saveCart([...cart, nextItem]);
    setActiveProduct(null);
    setSubmitError(null);
  }

  function removeCartItem(cartItemId: string) {
    saveCart(cart.filter((i) => i.cartItemId !== cartItemId));
  }

  function changeCartQty(cartItemId: string, delta: number) {
    saveCart(
      cart
        .map((i) => (i.cartItemId === cartItemId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0 && i.quantity <= 50),
    );
  }

  const cartTotalCents = useMemo(() => {
    return cart.reduce((acc, item) => {
      const opts = item.options_summary.reduce((s, o) => s + o.price_cents, 0);
      return acc + item.quantity * (item.unit_price_cents + opts);
    }, 0);
  }, [cart]);

  async function handleSubmitOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!canOrder || cart.length === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    setLastPlacedMsg(null);

    try {
      const supabase = createClient();
      const payload = cart.map((i) => ({
        product_id: i.product_id,
        quantity: i.quantity,
        option_ids: i.option_ids,
        notes: i.notes || null,
      }));

      const { data, error } = await supabase.rpc("place_order", {
        p_table_token: tableToken,
        p_client_token: clientToken,
        p_idempotency_key: idempotencyKey || crypto.randomUUID(),
        p_customer_name: customerName.trim() || null,
        p_notes: orderNotes.trim() || null,
        p_items: payload,
      });

      if (error) {
        setSubmitError(friendlyOrderError(error.message));
        return;
      }

      const res = data as { order_number: number; total_cents: number };
      saveCart([]);
      setOrderNotes("");
      setLastPlacedMsg(
        `Pedido #${res.order_number} enviado (${formatCents(res.total_cents)})! O garçom virá confirmar presencialmente na mesa antes do início do preparo.`,
      );
      await loadMyOrders();
    } catch {
      setSubmitError("Falha de conexão ao enviar o pedido. Você pode tentar novamente com segurança (sem risco de duplicar).");
    } finally {
      setSubmitting(false);
    }
  }

  const visibleCategories = useMemo(() => {
    if (activeCategoryFilter === "ALL") return categories;
    return categories.filter((c) => c.id === activeCategoryFilter);
  }, [categories, activeCategoryFilter]);

  return (
    <div className="flex flex-col gap-6 text-left">
      {/* ========================================================
          CHAMAR ATENDENTE (SEPARADO DE PEDIDO DE PRODUTOS)
          ======================================================== */}
      {canOrder && (
        <section className="rounded-3xl border border-[#e8dcc6] bg-white p-5 shadow-xs">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#0047ff]/10 text-xl text-[#0047ff]">
                🔔
              </span>
              <div>
                <strong className="block font-serif text-base font-bold text-[#14213d]">
                  Precisa de atendimento na mesa?
                </strong>
                <span className="text-xs text-[#14213d]/70 leading-relaxed">
                  Chame o garçom para tirar dúvidas, solicitar talheres ou pedir a conferência da conta.
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setCallModalOpen(true);
                setCallFeedback(null);
              }}
              className="inline-flex h-10 items-center justify-center rounded-full border-2 border-[#0047ff] bg-white px-5 font-sans text-xs font-bold text-[#0047ff] uppercase tracking-wider transition-all hover:bg-[#0047ff] hover:text-white active:scale-95 shadow-xs"
            >
              Chamar atendente
            </button>
          </div>
        </section>
      )}

      {callFeedback && (
        <section role="status" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs font-semibold text-amber-950 shadow-xs">
          {callFeedback}
        </section>
      )}

      {/* Modal Chamar Atendente */}
      {callModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="call-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs p-0 sm:items-center sm:p-4"
        >
          <div className="w-full max-w-md rounded-t-3xl border border-[#e8dcc6] bg-white p-6 shadow-2xl sm:rounded-3xl">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#00c2d1]/15 text-xl text-[#00c2d1]">
                🔔
              </span>
              <div>
                <h2 id="call-title" className="font-serif text-xl font-bold text-[#14213d]">
                  Chamar Atendente
                </h2>
                <p className="text-[11px] text-[#14213d]/60">
                  Notifica nossa equipe de salão na Praia dos Coqueiros
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-xs font-bold text-[#14213d]">
                Qual é a necessidade?
                <select
                  value={callReason}
                  onChange={(e) =>
                    setCallReason(e.target.value as "AJUDA" | "DUVIDA" | "PEDIR_CONTA" | "OUTRO")
                  }
                  className="h-11 rounded-xl border border-[#e8dcc6] bg-white px-3 text-sm text-[#14213d] focus:border-[#0047ff] focus:outline-hidden"
                >
                  <option value="AJUDA">Preciso de ajuda na mesa</option>
                  <option value="DUVIDA">Dúvida sobre os pratos ou bebidas</option>
                  <option value="PEDIR_CONTA">Pedir a conta para conferência</option>
                  <option value="OUTRO">Outro motivo</option>
                </select>
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-bold text-[#14213d]">
                Observação curta (opcional)
                <input
                  type="text"
                  maxLength={200}
                  value={callDetails}
                  onChange={(e) => setCallDetails(e.target.value)}
                  placeholder="Ex.: trazer guardanapos extras ou gelo"
                  className="h-11 rounded-xl border border-[#e8dcc6] bg-white px-3 text-sm text-[#14213d] placeholder:text-[#14213d]/40 focus:border-[#0047ff] focus:outline-hidden"
                />
              </label>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setCallModalOpen(false)}
                className="h-11 flex-1 rounded-full border border-[#e8dcc6] bg-white text-xs font-bold text-[#14213d] uppercase tracking-wider hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={callingAttendant}
                onClick={async () => {
                  if (callingAttendant) return;
                  setCallingAttendant(true);
                  try {
                    const supabase = createClient();
                    const { data, error } = await supabase.rpc("create_service_call", {
                      p_table_token: tableToken,
                      p_client_token: clientToken,
                      p_reason: callReason,
                      p_details: callDetails.trim() || null,
                    });
                    if (error) {
                      setCallFeedback(
                        error.message.includes("AGUARDE_PARA_NOVA_CHAMADA")
                          ? "Recebemos seu chamado há instantes. Aguarde alguns segundos antes de enviar outro."
                          : "Não foi possível enviar o chamado agora. Tente novamente.",
                      );
                    } else {
                      const res = data as { already_open?: boolean };
                      setCallFeedback(
                        res?.already_open
                          ? "Já existe um chamado ativo para sua mesa. Um atendente virá em instantes!"
                          : "Chamado enviado! Um atendente virá até sua mesa na praia.",
                      );
                      setCallDetails("");
                    }
                    setCallModalOpen(false);
                  } finally {
                    setCallingAttendant(false);
                  }
                }}
                className="h-11 flex-1 rounded-full bg-[#0047ff] text-xs font-bold text-white uppercase tracking-wider shadow-md hover:bg-[#0036c4] disabled:opacity-50"
              >
                {callingAttendant ? "Chamando..." : "Confirmar Chamada"}
              </button>
            </div>
          </div>
        </div>
      )}

      {lastPlacedMsg && (
        <section role="status" className="rounded-3xl border-2 border-[#00c2d1] bg-sky-50/80 p-5 text-sky-950 shadow-sm">
          <p className="font-serif text-lg font-bold text-[#0047ff]">
            Pedido enviado com sucesso!
          </p>
          <p className="mt-1 text-xs text-sky-900 leading-relaxed">{lastPlacedMsg}</p>
        </section>
      )}

      {/* ========================================================
          FILTRO DE CATEGORIAS DA MESA
          ======================================================== */}
      {categories.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveCategoryFilter("ALL")}
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
              activeCategoryFilter === "ALL"
                ? "bg-[#0047ff] text-white shadow-sm"
                : "border border-[#e8dcc6] bg-white text-[#14213d]/80 hover:border-[#0047ff] hover:text-[#0047ff]"
            }`}
          >
            Todas
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveCategoryFilter(c.id)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                activeCategoryFilter === c.id
                  ? "bg-[#0047ff] text-white shadow-sm"
                  : "border border-[#e8dcc6] bg-white text-[#14213d]/80 hover:border-[#0047ff] hover:text-[#0047ff]"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* ========================================================
          LISTA DO CARDÁPIO NA MESA
          ======================================================== */}
      {products.length === 0 ? (
        <section className="rounded-3xl border border-[#e8dcc6] bg-white p-8 text-center shadow-xs">
          <p className="font-serif text-base font-bold text-[#14213d]">
            Estamos organizando o cardápio desta sessão. Em breve novas opções estarão ativas.
          </p>
        </section>
      ) : (
        visibleCategories.map((c) => {
          const list = products.filter((p) => p.category_id === c.id);
          if (list.length === 0) return null;
          return (
            <section key={c.id} className="flex flex-col gap-4">
              <div className="flex items-center gap-2 border-b-2 border-[#f6b600] pb-1.5">
                <span className="h-2 w-2 rounded-full bg-[#00c2d1]" />
                <h2 className="font-serif text-2xl font-bold text-[#14213d]">{c.name}</h2>
              </div>

              <ul className="flex flex-col gap-4">
                {list.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-col gap-4 rounded-3xl border border-[#e8dcc6] bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:p-5"
                  >
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="h-32 w-full shrink-0 rounded-2xl object-cover sm:h-24 sm:w-24"
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#0047ff]/5 text-2xl text-[#0047ff]">
                        🍽️
                      </div>
                    )}

                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-1">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-serif text-lg font-bold text-[#14213d]">{p.name}</h3>
                        <span className="shrink-0 rounded-xl bg-[#f6b600]/15 px-2.5 py-1 font-sans text-sm font-extrabold text-[#14213d]">
                          {formatCents(p.price_cents)}
                        </span>
                      </div>

                      {p.description && (
                        <p className="text-xs leading-relaxed text-[#14213d]/70">{p.description}</p>
                      )}

                      {!p.available ? (
                        <span className="mt-1 w-fit rounded-full bg-amber-100 px-3 py-0.5 text-[11px] font-bold text-amber-900">
                          Indisponível no momento
                        </span>
                      ) : canOrder ? (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => openConfigurator(p)}
                            className="inline-flex h-9 w-full items-center justify-center rounded-full bg-[#0047ff] px-4 font-sans text-xs font-bold text-white uppercase tracking-wider shadow-xs transition-colors hover:bg-[#0036c4] active:scale-95 sm:w-auto"
                          >
                            Adicionar ao Pedido
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}

      {/* ========================================================
          MODAL DE CONFIGURAÇÃO DE ITEM COM ADICIONAIS
          ======================================================== */}
      {activeProduct && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="config-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs p-0 sm:items-center sm:p-4"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[#e8dcc6] bg-white p-6 shadow-2xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3 border-b border-[#e8dcc6] pb-3">
              <div>
                <h2 id="config-title" className="font-serif text-2xl font-bold text-[#14213d]">
                  {activeProduct.name}
                </h2>
                <p className="font-sans text-base font-extrabold text-[#0047ff]">
                  {formatCents(activeProduct.price_cents)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveProduct(null)}
                className="h-8 w-8 rounded-full bg-slate-100 text-sm font-bold text-[#14213d] hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            {activeProduct.option_groups.map((g) => {
              const chosen = selectedOptions[g.id] ?? [];
              return (
                <fieldset key={g.id} className="mt-4 rounded-2xl border border-[#e8dcc6] bg-[#fbf8f2]/50 p-4">
                  <legend className="px-2 font-serif text-sm font-bold text-[#14213d]">
                    {g.name}{" "}
                    <span className="font-sans text-xs font-normal text-[#14213d]/60">
                      ({g.min_select > 0 ? `Obrigatório: mín. ${g.min_select}` : "Opcional"}, máx. {g.max_select})
                    </span>
                  </legend>
                  <div className="mt-2 flex flex-col gap-2">
                    {g.options
                      .filter((o) => o.available)
                      .map((o) => {
                        const checked = chosen.includes(o.id);
                        return (
                          <label
                            key={o.id}
                            className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 transition-colors ${
                              checked
                                ? "border-[#0047ff] bg-white shadow-xs"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          >
                            <span className="flex items-center gap-2.5">
                              <input
                                type={g.max_select === 1 ? "radio" : "checkbox"}
                                name={`grp-${g.id}`}
                                checked={checked}
                                onChange={() => toggleOption(g, o.id)}
                                className="h-4 w-4 accent-[#0047ff]"
                              />
                              <span className="text-xs font-semibold text-[#14213d]">{o.name}</span>
                            </span>
                            {o.price_cents > 0 && (
                              <span className="font-sans text-xs font-bold text-[#0047ff]">
                                + {formatCents(o.price_cents)}
                              </span>
                            )}
                          </label>
                        );
                      })}
                  </div>
                </fieldset>
              );
            })}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-xs font-bold text-[#14213d]">
                Quantidade
                <div className="flex h-11 items-center rounded-xl border border-[#e8dcc6] bg-white px-2">
                  <button
                    type="button"
                    onClick={() => setItemQty((q) => Math.max(1, q - 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold hover:bg-slate-200"
                  >
                    -
                  </button>
                  <span className="flex-1 text-center font-bold text-sm">{itemQty}</span>
                  <button
                    type="button"
                    onClick={() => setItemQty((q) => Math.min(50, q + 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold hover:bg-slate-200"
                  >
                    +
                  </button>
                </div>
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-bold text-[#14213d] sm:col-span-2">
                Observação para a cozinha/bar (opcional)
                <input
                  type="text"
                  maxLength={250}
                  value={itemNotes}
                  onChange={(e) => setItemNotes(e.target.value)}
                  placeholder="Ex.: sem cebola, gelo à parte, ponto da carne"
                  className="h-11 rounded-xl border border-[#e8dcc6] bg-white px-3 text-sm text-[#14213d] placeholder:text-[#14213d]/40 focus:border-[#0047ff] focus:outline-hidden"
                />
              </label>
            </div>

            {configError && (
              <p role="alert" className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-900">
                {configError}
              </p>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setActiveProduct(null)}
                className="h-11 flex-1 rounded-full border border-[#e8dcc6] bg-white text-xs font-bold text-[#14213d] uppercase tracking-wider hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmAddToCart}
                className="h-11 flex-1 rounded-full bg-[#0047ff] text-xs font-bold text-white uppercase tracking-wider shadow-md hover:bg-[#0036c4] active:scale-95"
              >
                Confirmar Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          CARRINHO INDIVIDUAL DO DISPOSITIVO
          ======================================================== */}
      {canOrder && cart.length > 0 && (
        <section aria-label="Seu carrinho" className="rounded-3xl border-2 border-[#0047ff] bg-white p-5 shadow-lg">
          <div className="flex items-center justify-between border-b border-[#e8dcc6] pb-3">
            <div>
              <span className="font-sans text-[10px] font-bold tracking-[0.2em] text-[#00c2d1] uppercase">
                Seu Aparelho
              </span>
              <h2 className="font-serif text-2xl font-bold text-[#14213d]">
                Carrinho de Pedidos
              </h2>
            </div>
            <span className="rounded-full bg-[#0047ff]/10 px-3 py-1 font-sans text-xs font-bold text-[#0047ff]">
              {cart.reduce((s, i) => s + i.quantity, 0)} {cart.reduce((s, i) => s + i.quantity, 0) === 1 ? "item" : "itens"}
            </span>
          </div>

          <p className="mt-2 text-xs text-[#14213d]/60 leading-relaxed">
            Cada celular na mesa possui seu próprio carrinho individual. Os preços são confirmados e congelados pelo servidor no momento do envio.
          </p>

          <ul className="mt-4 flex flex-col gap-3 divide-y divide-[#e8dcc6]/60">
            {cart.map((item) => {
              const optsPrice = item.options_summary.reduce((s, o) => s + o.price_cents, 0);
              const lineTotal = item.quantity * (item.unit_price_cents + optsPrice);
              return (
                <li key={item.cartItemId} className="flex flex-col gap-1.5 pt-3 first:pt-0">
                  <div className="flex items-start justify-between gap-3">
                    <strong className="font-serif text-base font-bold text-[#14213d]">
                      {item.quantity}x {item.product_name}
                    </strong>
                    <span className="font-sans text-sm font-extrabold text-[#0047ff]">
                      {formatCents(lineTotal)}
                    </span>
                  </div>

                  {item.options_summary.length > 0 && (
                    <p className="text-xs text-[#14213d]/70">
                      {item.options_summary.map((o) => o.name).join(" • ")}
                    </p>
                  )}

                  {item.notes && (
                    <p className="text-xs italic text-[#14213d]/60">Obs.: {item.notes}</p>
                  )}

                  <div className="mt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => changeCartQty(item.cartItemId, -1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#e8dcc6] text-xs font-bold hover:bg-slate-50"
                      aria-label="Diminuir quantidade"
                    >
                      -
                    </button>
                    <span className="font-bold text-xs px-1">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => changeCartQty(item.cartItemId, 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#e8dcc6] text-xs font-bold hover:bg-slate-50"
                      aria-label="Aumentar quantidade"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCartItem(item.cartItemId)}
                      className="ml-auto text-xs font-bold text-rose-600 hover:underline"
                    >
                      Remover
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <form onSubmit={handleSubmitOrder} className="mt-5 flex flex-col gap-4 border-t border-[#e8dcc6] pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-bold text-[#14213d]">
                Seu nome ou apelido na mesa (opcional)
                <input
                  type="text"
                  maxLength={60}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ex.: Rodrigo"
                  className="h-10 rounded-xl border border-[#e8dcc6] bg-white px-3 text-xs text-[#14213d] placeholder:text-[#14213d]/40 focus:border-[#0047ff] focus:outline-hidden"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-bold text-[#14213d]">
                Observação do pedido (opcional)
                <input
                  type="text"
                  maxLength={300}
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Ex.: copos com gelo à parte"
                  className="h-10 rounded-xl border border-[#e8dcc6] bg-white px-3 text-xs text-[#14213d] placeholder:text-[#14213d]/40 focus:border-[#0047ff] focus:outline-hidden"
                />
              </label>
            </div>

            <div className="rounded-2xl border border-amber-300 bg-amber-50/80 p-3.5 text-xs text-amber-950 leading-relaxed">
              <strong>🌴 Confirmação presencial:</strong> Ao enviar, seu pedido entra na fila da equipe. O garçom irá até sua mesa na praia confirmar os itens antes do preparo.
            </div>

            {submitError && (
              <p role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-3 text-xs text-red-900">
                {submitError}
              </p>
            )}

            <div className="flex items-center justify-between border-t border-[#e8dcc6] pt-3">
              <span className="font-serif text-lg font-bold text-[#14213d]">Total do Pedido</span>
              <span className="font-sans text-xl font-extrabold text-[#0047ff]">
                {formatCents(cartTotalCents)}
              </span>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[#f6b600] font-sans text-xs font-bold uppercase tracking-wider text-[#14213d] shadow-md transition-all hover:bg-[#e0a500] hover:shadow-lg disabled:opacity-50 active:scale-95"
            >
              {submitting ? "Enviando Pedido..." : "Enviar Pedido para Confirmação"}
            </button>
          </form>
        </section>
      )}

      {/* ========================================================
          ACOMPANHAMENTO DOS PRÓPRIOS PEDIDOS NESTA SESSÃO
          ======================================================== */}
      {canOrder && (
        <section aria-label="Meus pedidos nesta sessão" className="rounded-3xl border border-[#e8dcc6] bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between gap-3 border-b border-[#e8dcc6] pb-3">
            <div>
              <span className="font-sans text-[10px] font-bold tracking-[0.2em] text-[#00c2d1] uppercase">
                Acompanhamento
              </span>
              <h2 className="font-serif text-xl font-bold text-[#14213d]">
                Meus Pedidos na Mesa
              </h2>
            </div>
            <button
              type="button"
              onClick={() => void loadMyOrders()}
              disabled={loadingOrders}
              className="inline-flex h-8 items-center justify-center rounded-full border border-[#e8dcc6] px-3 font-sans text-[11px] font-bold text-[#14213d] uppercase tracking-wider hover:bg-slate-50"
            >
              {loadingOrders ? "Atualizando..." : "Atualizar"}
            </button>
          </div>

          {myOrders.length === 0 ? (
            <p className="mt-4 text-xs text-[#14213d]/60">
              Você ainda não enviou pedidos através deste celular na sessão atual.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-4">
              {myOrders.map((o) => {
                const st = STATUS_INFO[o.status] ?? { label: o.status, desc: "", chipClass: "" };
                return (
                  <li key={o.id} className="rounded-2xl border border-[#e8dcc6] bg-[#fbf8f2]/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="font-serif text-base font-bold text-[#14213d]">
                        Pedido #{o.order_number} {o.customer_name ? `(${o.customer_name})` : ""}
                      </strong>
                      <span className={`rounded-full px-3 py-1 font-sans text-[11px] font-bold ${st.chipClass}`}>
                        {st.label}
                      </span>
                    </div>

                    {st.desc && <p className="mt-1 text-xs text-[#14213d]/70">{st.desc}</p>}
                    {o.cancel_reason && (
                      <p className="mt-1 text-xs font-semibold text-rose-800">
                        Motivo do cancelamento: {o.cancel_reason}
                      </p>
                    )}

                    <ul className="mt-3 flex flex-col gap-1 border-t border-[#e8dcc6]/60 pt-2 text-xs">
                      {o.items.map((it) => (
                        <li key={it.id} className="flex justify-between gap-3">
                          <span>
                            {it.quantity}x {it.product_name}
                            {it.options.length > 0 && (
                              <span className="block text-[11px] text-[#14213d]/60">
                                {it.options.map((op) => `${op.group_name}: ${op.option_name}`).join(" • ")}
                              </span>
                            )}
                          </span>
                          <span className="font-semibold text-[#14213d]">
                            {formatCents(it.line_total_cents)}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-3 flex justify-between border-t border-[#e8dcc6]/60 pt-2 text-sm font-bold">
                      <span className="font-serif text-[#14213d]">Total</span>
                      <span className="font-sans font-extrabold text-[#0047ff]">
                        {formatCents(o.total_cents)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
