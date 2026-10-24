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
    chipClass: "chip-open",
  },
  EM_VERIFICACAO: {
    label: "Atendente em verificação",
    desc: "Um atendente está conferindo seu pedido presencialmente na mesa.",
    chipClass: "chip-open",
  },
  CONFIRMADO: {
    label: "Confirmado — liberado para preparo",
    desc: "Confirmado pelo atendente e encaminhado para cozinha/bar.",
    chipClass: "chip-on",
  },
  EM_PREPARACAO: {
    label: "Em preparação",
    desc: "Seu pedido está sendo preparado.",
    chipClass: "chip-on",
  },
  PARCIALMENTE_PRONTO: {
    label: "Parcialmente pronto",
    desc: "Parte do seu pedido já ficou pronta.",
    chipClass: "chip-on",
  },
  PRONTO: {
    label: "Pronto para entrega",
    desc: "Seu pedido está pronto e será levado à mesa.",
    chipClass: "chip-on",
  },
  ENTREGUE: {
    label: "Entregue na mesa",
    desc: "Pedido entregue. Bom proveito!",
    chipClass: "chip-on",
  },
  CANCELADO: {
    label: "Cancelado",
    desc: "Este pedido foi cancelado.",
    chipClass: "",
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
      // Nova edição do carrinho gera nova chave de idempotência para o próximo envio
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
        `Pedido #${res.order_number} enviado (${formatCents(res.total_cents)})! Aguarde o atendente ir até sua mesa para confirmar antes do preparo.`,
      );
      await loadMyOrders();
    } catch {
      setSubmitError("Falha de conexão ao enviar o pedido. Você pode tentar novamente com segurança (sem risco de duplicar).");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 text-left">
      {canOrder && (
        <section className="card flex flex-wrap items-center justify-between gap-3 bg-white">
          <div>
            <strong className="block text-ocean">Precisa de atendimento presencial?</strong>
            <span className="text-xs text-slate-700">
              Chame um atendente para tirar dúvidas, pedir apoio ou solicitar o fechamento da conta.
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setCallModalOpen(true);
              setCallFeedback(null);
            }}
            className="btn border-ocean text-ocean"
          >
            Chamar atendente
          </button>
        </section>
      )}

      {callFeedback && (
        <section role="status" className="rounded-2xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
          {callFeedback}
        </section>
      )}

      {callModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="call-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
        >
          <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <h2 id="call-title" className="text-xl font-bold text-ocean">
              Chamar atendente na mesa
            </h2>
            <p className="mt-1 text-xs text-slate-700">
              Esta chamada avisa a equipe de atendimento (não envia pedido de produtos nem realiza pagamento).
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1 font-medium">
                Motivo
                <select
                  value={callReason}
                  onChange={(e) =>
                    setCallReason(e.target.value as "AJUDA" | "DUVIDA" | "PEDIR_CONTA" | "OUTRO")
                  }
                  className="input"
                >
                  <option value="AJUDA">Preciso de ajuda na mesa</option>
                  <option value="DUVIDA">Dúvida sobre o cardápio</option>
                  <option value="PEDIR_CONTA">Pedir a conta para conferência</option>
                  <option value="OUTRO">Outro motivo</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 font-medium">
                Observação curta (opcional)
                <input
                  type="text"
                  maxLength={200}
                  value={callDetails}
                  onChange={(e) => setCallDetails(e.target.value)}
                  placeholder="Ex.: trazer guardanapos"
                  className="input"
                />
              </label>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setCallModalOpen(false)}
                className="btn flex-1"
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
                          ? "Recebemos sua chamada há instantes. Aguarde alguns segundos antes de enviar outra."
                          : "Não foi possível enviar o chamado agora. Tente novamente.",
                      );
                    } else {
                      const res = data as { already_open?: boolean };
                      setCallFeedback(
                        res?.already_open
                          ? "Já existe um chamado aberto para sua mesa. Um atendente virá em instantes!"
                          : "Chamado enviado! Um atendente foi avisado e virá até sua mesa.",
                      );
                      setCallDetails("");
                    }
                    setCallModalOpen(false);
                  } finally {
                    setCallingAttendant(false);
                  }
                }}
                className="btn btn-primary flex-1"
              >
                {callingAttendant ? "Chamando..." : "Confirmar chamada"}
              </button>
            </div>
          </div>
        </div>
      )}

      {lastPlacedMsg && (
        <section role="status" className="rounded-2xl border-2 border-turquoise bg-sky-50 p-4 text-sky-950">
          <p className="font-bold">Pedido recebido — aguardando confirmação presencial</p>
          <p className="mt-1 text-sm">{lastPlacedMsg}</p>
        </section>
      )}

      {/* Lista do cardápio por categoria */}
      {products.length === 0 ? (
        <section className="card text-center">
          <p className="text-lg">Estamos preparando nosso cardápio. Em breve, teremos novidades para você.</p>
        </section>
      ) : (
        categories.map((c) => {
          const list = products.filter((p) => p.category_id === c.id);
          if (list.length === 0) return null;
          return (
            <section key={c.id} className="flex flex-col gap-3">
              <h2 className="border-b-2 border-gold pb-1 text-xl font-bold text-ocean">{c.name}</h2>
              <ul className="flex flex-col gap-3">
                {list.map((p) => (
                  <li key={p.id} className="card flex flex-col gap-3 sm:flex-row sm:items-center">
                    {p.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image_url} alt={p.name} className="h-28 w-full shrink-0 rounded-xl object-cover sm:size-24" />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold">{p.name}</h3>
                        <span className="shrink-0 font-bold text-ocean">{formatCents(p.price_cents)}</span>
                      </div>
                      {p.description && <p className="text-sm text-slate-700">{p.description}</p>}
                      {!p.available ? (
                        <span className="chip chip-open w-fit">Indisponível no momento</span>
                      ) : canOrder ? (
                        <div className="mt-2">
                          <button type="button" onClick={() => openConfigurator(p)} className="btn btn-primary w-full sm:w-auto">
                            Adicionar ao pedido
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

      {/* Modal/painel de configuração de item */}
      {activeProduct && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="config-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 id="config-title" className="text-xl font-bold text-ocean">
                  {activeProduct.name}
                </h2>
                <p className="font-semibold">{formatCents(activeProduct.price_cents)}</p>
              </div>
              <button type="button" onClick={() => setActiveProduct(null)} className="btn h-9 px-3">
                Fechar
              </button>
            </div>

            {activeProduct.option_groups.map((g) => {
              const chosen = selectedOptions[g.id] ?? [];
              return (
                <fieldset key={g.id} className="mt-4 rounded-xl border border-slate-300 p-3">
                  <legend className="px-1 font-bold">
                    {g.name}{" "}
                    <span className="text-xs font-normal text-slate-700">
                      ({g.min_select > 0 ? `Obrigatório: mín. ${g.min_select}` : "Opcional"}, máx. {g.max_select})
                    </span>
                  </legend>
                  <div className="mt-2 flex flex-col gap-2">
                    {g.options
                      .filter((o) => o.available)
                      .map((o) => {
                        const checked = chosen.includes(o.id);
                        return (
                          <label key={o.id} className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-2">
                            <span className="flex items-center gap-2">
                              <input
                                type={g.max_select === 1 ? "radio" : "checkbox"}
                                name={`grp-${g.id}`}
                                checked={checked}
                                onChange={() => toggleOption(g, o.id)}
                                className="size-5"
                              />
                              <span>{o.name}</span>
                            </span>
                            {o.price_cents > 0 && <span className="font-semibold text-ocean">+ {formatCents(o.price_cents)}</span>}
                          </label>
                        );
                      })}
                  </div>
                </fieldset>
              );
            })}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 font-medium">
                Quantidade
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={itemQty}
                  onChange={(e) => setItemQty(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                  className="input"
                />
              </label>
              <label className="flex flex-col gap-1 font-medium sm:col-span-2">
                Observação do item (opcional)
                <input
                  type="text"
                  maxLength={250}
                  value={itemNotes}
                  onChange={(e) => setItemNotes(e.target.value)}
                  placeholder="Ex.: sem cebola, gelo à parte"
                  className="input"
                />
              </label>
            </div>

            {configError && (
              <p role="alert" className="mt-3 rounded-xl border border-red-400 bg-red-50 p-3 text-sm text-red-900">
                {configError}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setActiveProduct(null)} className="btn flex-1">
                Cancelar
              </button>
              <button type="button" onClick={confirmAddToCart} className="btn btn-primary flex-1">
                Confirmar item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Carrinho individual do dispositivo */}
      {canOrder && cart.length > 0 && (
        <section aria-label="Seu carrinho" className="card border-2 border-ocean">
          <h2 className="text-xl font-bold text-ocean">Seu carrinho neste aparelho</h2>
          <p className="mt-1 text-xs text-slate-700">
            Cada celular na mesa tem seu próprio carrinho separado. Os preços são validados e fixados no servidor no momento do envio.
          </p>

          <ul className="mt-3 flex flex-col gap-3 divide-y">
            {cart.map((item) => {
              const optsPrice = item.options_summary.reduce((s, o) => s + o.price_cents, 0);
              const lineTotal = item.quantity * (item.unit_price_cents + optsPrice);
              return (
                <li key={item.cartItemId} className="flex flex-col gap-1 pt-3 first:pt-0">
                  <div className="flex items-start justify-between gap-2">
                    <strong>
                      {item.quantity}x {item.product_name}
                    </strong>
                    <span className="font-bold text-ocean">{formatCents(lineTotal)}</span>
                  </div>
                  {item.options_summary.length > 0 && (
                    <p className="text-xs text-slate-700">{item.options_summary.map((o) => o.name).join(" • ")}</p>
                  )}
                  {item.notes && <p className="text-xs italic text-slate-700">Obs.: {item.notes}</p>}
                  <div className="mt-1 flex items-center gap-2">
                    <button type="button" onClick={() => changeCartQty(item.cartItemId, -1)} className="btn h-8 px-3" aria-label="Diminuir quantidade">
                      -
                    </button>
                    <span className="font-semibold">{item.quantity}</span>
                    <button type="button" onClick={() => changeCartQty(item.cartItemId, 1)} className="btn h-8 px-3" aria-label="Aumentar quantidade">
                      +
                    </button>
                    <button type="button" onClick={() => removeCartItem(item.cartItemId)} className="btn ml-auto h-8 px-3 text-xs">
                      Remover
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <form onSubmit={handleSubmitOrder} className="mt-4 flex flex-col gap-3 border-t pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-medium">
                Seu nome ou apelido (opcional)
                <input
                  type="text"
                  maxLength={60}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ex.: Rodrigo"
                  className="input"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Observação geral (opcional)
                <input
                  type="text"
                  maxLength={300}
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Ex.: trazer copos extras"
                  className="input"
                />
              </label>
            </div>

            <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-950">
              <strong>Confirmação presencial obrigatória:</strong> Ao enviar, seu pedido entra na fila do atendente. Ele irá até sua mesa confirmar os itens antes do preparo na cozinha ou bar.
            </div>

            {submitError && (
              <p role="alert" className="rounded-xl border border-red-400 bg-red-50 p-3 text-sm text-red-900">
                {submitError}
              </p>
            )}

            <div className="flex items-center justify-between text-lg font-bold">
              <span>Total estimado</span>
              <span className="text-ocean">{formatCents(cartTotalCents)}</span>
            </div>

            <button type="submit" disabled={submitting} className="btn btn-primary h-12 w-full text-lg">
              {submitting ? "Enviando pedido..." : "Enviar pedido para confirmação"}
            </button>
          </form>
        </section>
      )}

      {/* Acompanhamento apenas dos próprios pedidos do aparelho na sessão aberta */}
      {canOrder && (
        <section aria-label="Meus pedidos nesta sessão" className="card flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-ocean">Meus pedidos nesta sessão</h2>
            <button type="button" onClick={() => void loadMyOrders()} disabled={loadingOrders} className="btn h-9 px-3 text-sm">
              {loadingOrders ? "Atualizando..." : "Atualizar"}
            </button>
          </div>

          {myOrders.length === 0 ? (
            <p className="text-sm text-slate-700">Você ainda não enviou pedidos neste aparelho durante a sessão atual.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {myOrders.map((o) => {
                const st = STATUS_INFO[o.status] ?? { label: o.status, desc: "", chipClass: "" };
                return (
                  <li key={o.id} className="rounded-xl border border-slate-300 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong>
                        Pedido #{o.order_number} {o.customer_name ? `(${o.customer_name})` : ""}
                      </strong>
                      <span className={`chip ${st.chipClass}`}>{st.label}</span>
                    </div>
                    {st.desc && <p className="mt-1 text-xs text-slate-700">{st.desc}</p>}
                    {o.cancel_reason && <p className="mt-1 text-xs font-semibold text-red-800">Motivo do cancelamento: {o.cancel_reason}</p>}
                    <ul className="mt-2 flex flex-col gap-1 border-t pt-2 text-sm">
                      {o.items.map((it) => (
                        <li key={it.id} className="flex justify-between gap-2">
                          <span>
                            {it.quantity}x {it.product_name}
                            {it.options.length > 0 && (
                              <span className="block text-xs text-slate-600">
                                {it.options.map((op) => `${op.group_name}: ${op.option_name}`).join(" • ")}
                              </span>
                            )}
                          </span>
                          <span className="font-semibold">{formatCents(it.line_total_cents)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex justify-between border-t pt-2 font-bold">
                      <span>Total do pedido</span>
                      <span className="text-ocean">{formatCents(o.total_cents)}</span>
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
