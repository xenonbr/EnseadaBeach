"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";

function go(msg: string): never {
  redirect(`/admin/mesas?msg=${encodeURIComponent(msg)}`);
}
function friendly(m: string) {
  if (m.includes("SESSAO_ABERTA_REQUER_AUTORIZACAO")) return "Esta mesa tem sessão aberta. Confirme a desativação forçada.";
  if (m.includes("SEM_PERMISSAO")) return "Sem permissão para esta ação.";
  if (m.includes("dining_tables_name_uq")) return "Já existe uma mesa com esse nome.";
  return "Não foi possível concluir a ação.";
}

export async function setActive(formData: FormData) {
  const { supabase } = await requireStaff(["admin", "manager"]);
  const id = String(formData.get("id"));
  const active = formData.get("active") === "true";
  const force = formData.get("force") === "true";
  const { error } = await supabase.rpc("set_table_active", { p_table_id: id, p_active: active, p_force: force });
  revalidatePath("/admin/mesas");
  if (error) go(friendly(error.message));
}

export async function addTable(formData: FormData) {
  const { supabase } = await requireStaff(["admin", "manager"]);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) go("Informe um nome para a mesa.");
  const { data: last } = await supabase.from("dining_tables").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  const { error } = await supabase.from("dining_tables").insert({ display_name: name, active: false, sort_order: (last?.[0]?.sort_order ?? 0) + 1 });
  revalidatePath("/admin/mesas");
  if (error) go(friendly(error.message));
  go("Mesa adicionada (desativada).");
}

export async function renameTable(formData: FormData) {
  const { supabase } = await requireStaff(["admin", "manager"]);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) go("Informe um nome.");
  const { error } = await supabase.from("dining_tables").update({ display_name: name }).eq("id", String(formData.get("id")));
  revalidatePath("/admin/mesas");
  if (error) go(friendly(error.message));
}

export async function openSession(formData: FormData) {
  const { supabase } = await requireStaff(["admin", "manager", "attendant"]);
  const { error } = await supabase.rpc("open_session", { p_table_id: String(formData.get("id")) });
  revalidatePath("/admin/mesas");
  if (error) go(error.message.includes("MESA_INATIVA") ? "Ative a mesa antes de abrir sessão." : error.message.includes("SESSAO_JA_ABERTA") ? "Já existe sessão aberta." : friendly(error.message));
}

export async function closeSession(formData: FormData) {
  const { supabase } = await requireStaff(["admin", "manager", "attendant"]);
  const { error } = await supabase.rpc("close_session", { p_session_id: String(formData.get("session")) });
  revalidatePath("/admin/mesas");
  if (error) go(error.message.includes("PENDENCIAS") ? "Há pendências abertas nesta sessão." : friendly(error.message));
}
