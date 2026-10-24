"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";

export async function purgeClosedHistoryAction(formData: FormData) {
  const { supabase } = await requireStaff(["admin"]);

  const beforeDate = String(formData.get("before_date") ?? "").trim();
  const confirmation = String(formData.get("confirmation") ?? "").trim().toUpperCase();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(beforeDate)) {
    redirect(
      `/admin/relatorios?msg=${encodeURIComponent("Data de corte inválida. Utilize o formato AAAA-MM-DD.")}`,
    );
  }

  if (confirmation !== "CONFIRMAR") {
    redirect(
      `/admin/relatorios?msg=${encodeURIComponent("Para confirmar a exclusão do histórico, digite CONFIRMAR no campo correspondente.")}`,
    );
  }

  const { data, error } = await supabase.rpc("purge_closed_history", {
    p_before_date: beforeDate,
  });

  revalidatePath("/admin/relatorios");
  revalidatePath("/admin/contas");
  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/mesas");

  if (error) {
    redirect(
      `/admin/relatorios?msg=${encodeURIComponent(`Não foi possível expurgar o histórico: ${error.message}`)}`,
    );
  }

  const result = Array.isArray(data) ? data[0] : (data as { purged_sessions_count: number; purged_orders_count: number });
  const sessCount = result?.purged_sessions_count ?? 0;
  const ordCount = result?.purged_orders_count ?? 0;

  if (sessCount === 0) {
    redirect(
      `/admin/relatorios?msg=${encodeURIComponent(`Nenhuma sessão fechada encontrada anterior a ${beforeDate} para expurgo.`)}`,
    );
  }

  redirect(
    `/admin/relatorios?msg=${encodeURIComponent(`Fechamento concluído com sucesso! ${sessCount} sessões e ${ordCount} pedidos fechados anteriores a ${beforeDate} foram expurgados para economizar espaço.`)}`,
  );
}
