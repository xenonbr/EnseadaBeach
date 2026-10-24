"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";

const UUID = /^[0-9a-f-]{36}$/i;

function back(returnTo: string, msg: string): never {
  const safePath = returnTo.startsWith("/admin/") ? returnTo : "/admin";
  redirect(`${safePath}${safePath.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}`);
}

export async function startTaskAction(formData: FormData) {
  const { supabase } = await requireStaff(["admin", "manager", "kitchen", "bar"]);
  const id = String(formData.get("id") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/admin");
  if (!UUID.test(id)) back(returnTo, "Tarefa inválida.");

  const { error } = await supabase.rpc("start_production_task", { p_task_id: id });
  revalidatePath("/admin/cozinha");
  revalidatePath("/admin/bar");
  revalidatePath("/admin/pedidos");
  if (error) back(returnTo, "Não foi possível iniciar o preparo desta tarefa.");
  back(returnTo, "Preparo iniciado.");
}

export async function completeTaskAction(formData: FormData) {
  const { supabase } = await requireStaff(["admin", "manager", "kitchen", "bar"]);
  const id = String(formData.get("id") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/admin");
  if (!UUID.test(id)) back(returnTo, "Tarefa inválida.");

  const { error } = await supabase.rpc("complete_production_task", { p_task_id: id });
  revalidatePath("/admin/cozinha");
  revalidatePath("/admin/bar");
  revalidatePath("/admin/pedidos");
  if (error) back(returnTo, "Não foi possível concluir o preparo desta tarefa.");
  back(returnTo, "Tarefa concluída e status do pedido atualizado.");
}

export async function toggleSectorProductAction(formData: FormData) {
  const { supabase } = await requireStaff(["admin", "manager", "kitchen", "bar"]);
  const id = String(formData.get("id") ?? "");
  const available = formData.get("available") === "true";
  const returnTo = String(formData.get("return_to") ?? "/admin");
  if (!UUID.test(id)) back(returnTo, "Produto inválido.");

  const { error } = await supabase.rpc("set_product_availability_sector", {
    p_product_id: id,
    p_available: available,
  });
  revalidatePath("/admin/cozinha");
  revalidatePath("/admin/bar");
  revalidatePath("/admin/cardapio");
  if (error) back(returnTo, "Sem permissão ou erro ao alterar disponibilidade.");
  back(returnTo, available ? "Produto marcado como disponível." : "Produto marcado como indisponível.");
}
