"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";

const ROLES = ["admin", "manager", "attendant"] as const;
const UUID = /^[0-9a-f-]{36}$/i;

function go(msg: string): never {
  redirect(`/admin/pedidos?msg=${encodeURIComponent(msg)}`);
}

function friendly(m: string): string {
  if (m.includes("EM_VERIFICACAO_POR_OUTRO_ATENDENTE")) {
    return "Outro atendente já assumiu a verificação deste pedido há menos de 5 minutos.";
  }
  if (m.includes("CONFLITO_VERSAO")) {
    return "Este pedido foi atualizado por outro funcionário. Confira o estado atual na fila.";
  }
  if (m.includes("TRANSICAO_INVALIDA")) {
    return "Ação não permitida para o estado atual do pedido.";
  }
  if (m.includes("MOTIVO_OBRIGATORIO")) {
    return "Informe o motivo do cancelamento (mínimo 3 caracteres).";
  }
  if (m.includes("CANCELAMENTO_PREPARO_RESTRITO")) {
    return "Pedidos já em preparo só podem ser cancelados por gerente ou administrador.";
  }
  if (m.includes("PEDIDO_AINDA_NAO_PRONTO")) {
    return "O pedido só pode ser marcado como entregue quando todos os setores concluírem o preparo.";
  }
  if (m.includes("APENAS_PEDIDOS_CANCELADOS_PODEM_SER_EXCLUIDOS")) {
    return "Apenas pedidos com status Cancelado podem ser excluídos.";
  }
  if (m.includes("PEDIDO_POSSUI_PAGAMENTO_VINCULADO")) {
    return "Não é possível excluir um pedido que possui registro de pagamento.";
  }
  if (m.includes("SEM_PERMISSAO")) {
    return "Você não tem permissão para executar esta ação.";
  }
  return "Não foi possível concluir a operação.";
}

export async function claimVerification(formData: FormData) {
  const { supabase } = await requireStaff([...ROLES]);
  const id = String(formData.get("id") ?? "");
  const version = Number(formData.get("version") ?? 0);
  if (!UUID.test(id)) go("Pedido inválido.");

  const { error } = await supabase.rpc("claim_order_verification", {
    p_order_id: id,
    p_expected_version: version || null,
  });
  revalidatePath("/admin/pedidos");
  if (error) go(friendly(error.message));
  go("Verificação assumida. Vá presencialmente à mesa confirmar com o cliente.");
}

export async function confirmOrderPresencial(formData: FormData) {
  const { supabase } = await requireStaff([...ROLES]);
  const id = String(formData.get("id") ?? "");
  const version = Number(formData.get("version") ?? 0);
  if (!UUID.test(id)) go("Pedido inválido.");

  const { error } = await supabase.rpc("confirm_order_presencial", {
    p_order_id: id,
    p_expected_version: version || null,
  });
  revalidatePath("/admin/pedidos");
  if (error) go(friendly(error.message));
  go("Pedido confirmado presencialmente e encaminhado para produção (cozinha/bar).");
}

export async function cancelOrderAction(formData: FormData) {
  const { supabase } = await requireStaff([...ROLES]);
  const id = String(formData.get("id") ?? "");
  const version = Number(formData.get("version") ?? 0);
  const reason = String(formData.get("reason") ?? "").trim();
  if (!UUID.test(id)) go("Pedido inválido.");
  if (reason.length < 3) go("Informe o motivo do cancelamento.");

  const { error } = await supabase.rpc("cancel_order", {
    p_order_id: id,
    p_reason: reason,
    p_expected_version: version || null,
  });
  revalidatePath("/admin/pedidos");
  if (error) go(friendly(error.message));
  go("Pedido cancelado e registrado na auditoria.");
}

export async function deliverOrderAction(formData: FormData) {
  const { supabase } = await requireStaff([...ROLES]);
  const id = String(formData.get("id") ?? "");
  const version = Number(formData.get("version") ?? 0);
  if (!UUID.test(id)) go("Pedido inválido.");

  const { error } = await supabase.rpc("mark_order_delivered", {
    p_order_id: id,
    p_expected_version: version || null,
  });
  revalidatePath("/admin/pedidos");
  if (error) go(friendly(error.message));
  go("Entrega registrada na mesa (lembrete: entrega não equivale a pagamento).");
}

export async function updateServiceCallAction(formData: FormData) {
  const { supabase } = await requireStaff([...ROLES]);
  const id = String(formData.get("id") ?? "");
  const nextStatus = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!UUID.test(id) || !["EM_ATENDIMENTO", "ATENDIDA", "CANCELADA"].includes(nextStatus)) {
    go("Dados do chamado inválidos.");
  }

  const { error } = await supabase.rpc("update_service_call_status", {
    p_call_id: id,
    p_next_status: nextStatus,
    p_note: note || null,
  });
  revalidatePath("/admin/pedidos");
  if (error) go(friendly(error.message));
  go(
    nextStatus === "EM_ATENDIMENTO"
      ? "Chamado assumido por você."
      : nextStatus === "ATENDIDA"
        ? "Chamado concluído."
        : "Chamado cancelado.",
  );
}

export async function deleteCancelledOrderAction(formData: FormData) {
  const { supabase } = await requireStaff(["admin"]);
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) go("Pedido inválido.");

  const { error } = await supabase.rpc("delete_cancelled_order", {
    p_order_id: id,
  });

  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/contas");
  if (error) go(friendly(error.message));
  go("Pedido cancelado excluído permanentemente da lista.");
}

