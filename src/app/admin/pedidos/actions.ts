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
