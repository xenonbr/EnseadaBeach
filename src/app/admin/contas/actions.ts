"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { parseBRLToCents } from "@/lib/money";

const UUID = /^[0-9a-f-]{36}$/i;
const METHODS = ["DINHEIRO", "PIX_PRESENCIAL", "CARTAO_DEBITO", "CARTAO_CREDITO", "OUTRO"];

function back(sessionId: string, msg: string): never {
  const path = UUID.test(sessionId) ? `/admin/contas/${sessionId}` : "/admin/contas";
  redirect(`${path}?msg=${encodeURIComponent(msg)}`);
}

function friendly(m: string): string {
  if (m.includes("CONTA_JA_QUITADA")) return "Esta conta já está integralmente quitada.";
  if (m.includes("VALOR_ACIMA_DO_SALDO_PENDENTE")) {
    return "O valor informado é maior que o saldo pendente da conta.";
  }
  if (m.includes("PENDENCIAS_ABERTAS")) {
    return "Não é possível encerrar a sessão enquanto houver pedidos não entregues ou saldo pendente.";
  }
  if (m.includes("MOTIVO_OBRIGATORIO")) return "Informe uma justificativa (mínimo 3 caracteres).";
  if (m.includes("SEM_PERMISSAO")) return "Você não tem permissão para esta operação.";
  return "Não foi possível concluir a operação financeira.";
}

export async function recordPaymentAction(formData: FormData) {
  const { supabase } = await requireStaff(["admin", "manager", "attendant"]);
  const sessionId = String(formData.get("session_id") ?? "");
  const method = String(formData.get("method") ?? "");
  const amount = parseBRLToCents(String(formData.get("amount") ?? ""));
  const idempotencyKey = String(formData.get("idempotency_key") ?? "").trim();
  const payerLabel = String(formData.get("payer_label") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();
  const orderIdRaw = String(formData.get("order_id") ?? "").trim();

  if (!UUID.test(sessionId)) back("", "Sessão inválida.");
  if (amount === null || amount <= 0) back(sessionId, "Informe um valor válido maior que zero (ex.: 45,00).");
  if (!METHODS.includes(method)) back(sessionId, "Selecione o método de recebimento.");

  const { error } = await supabase.rpc("record_session_payment", {
    p_session_id: sessionId,
    p_amount_cents: amount,
    p_method: method,
    p_idempotency_key: idempotencyKey.length >= 8 ? idempotencyKey : crypto.randomUUID(),
    p_reference: reference || null,
    p_payer_label: payerLabel || null,
    p_order_id: UUID.test(orderIdRaw) ? orderIdRaw : null,
  });

  revalidatePath("/admin/contas");
  revalidatePath(`/admin/contas/${sessionId}`);
  revalidatePath("/admin/mesas");
  if (error) back(sessionId, friendly(error.message));
  back(sessionId, "Recebimento presencial confirmado e registrado.");
}

export async function reversePaymentAction(formData: FormData) {
  const { supabase } = await requireStaff(["admin", "manager"]);
  const sessionId = String(formData.get("session_id") ?? "");
  const paymentId = String(formData.get("payment_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!UUID.test(sessionId) || !UUID.test(paymentId)) back(sessionId, "Registro inválido.");
  if (reason.length < 3) back(sessionId, "Informe o motivo do estorno.");

  const { error } = await supabase.rpc("reverse_session_payment", {
    p_payment_id: paymentId,
    p_reason: reason,
  });

  revalidatePath("/admin/contas");
  revalidatePath(`/admin/contas/${sessionId}`);
  if (error) back(sessionId, friendly(error.message));
  back(sessionId, "Recebimento estornado com registro em auditoria.");
}

export async function recordAdjustmentAction(formData: FormData) {
  const { supabase } = await requireStaff(["admin", "manager"]);
  const sessionId = String(formData.get("session_id") ?? "");
  const kind = String(formData.get("kind") ?? "discount");
  const absAmount = parseBRLToCents(String(formData.get("amount") ?? ""));
  const reason = String(formData.get("reason") ?? "").trim();

  if (!UUID.test(sessionId)) back("", "Sessão inválida.");
  if (absAmount === null || absAmount <= 0) back(sessionId, "Informe um valor válido (ex.: 10,00).");
  if (reason.length < 3) back(sessionId, "Informe a justificativa do ajuste.");

  const signedAmount = kind === "surcharge" ? absAmount : -absAmount;

  const { error } = await supabase.rpc("record_session_adjustment", {
    p_session_id: sessionId,
    p_amount_cents: signedAmount,
    p_reason: reason,
  });

  revalidatePath("/admin/contas");
  revalidatePath(`/admin/contas/${sessionId}`);
  if (error) back(sessionId, friendly(error.message));
  back(sessionId, "Ajuste registrado na conta.");
}

export async function closeSessionFromAccountAction(formData: FormData) {
  const { supabase } = await requireStaff(["admin", "manager", "attendant"]);
  const sessionId = String(formData.get("session_id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!UUID.test(sessionId)) back("", "Sessão inválida.");

  const { error } = await supabase.rpc("close_session", {
    p_session_id: sessionId,
    p_note: note || null,
  });

  revalidatePath("/admin/contas");
  revalidatePath(`/admin/contas/${sessionId}`);
  revalidatePath("/admin/mesas");
  if (error) back(sessionId, friendly(error.message));
  back(sessionId, "Sessão encerrada com sucesso.");
}
