"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";

const ROLES = ["admin", "manager", "attendant", "kitchen", "bar"];
const UUID = /^[0-9a-f-]{36}$/i;

function back(msg: string): never {
  redirect(`/admin/equipe?msg=${encodeURIComponent(msg)}`);
}

function friendly(m: string): string {
  if (m.includes("USUARIO_AUTH_NAO_ENCONTRADO")) {
    return "E-mail não encontrado em Authentication > Users. Crie primeiro o login no painel do Supabase Auth e depois vincule aqui.";
  }
  if (m.includes("ULTIMO_ADMIN")) {
    return "Não é permitido desativar ou remover o papel do último administrador ativo.";
  }
  if (m.includes("SEM_PERMISSAO")) return "Somente o administrador pode alterar perfis de equipe.";
  return "Não foi possível salvar os dados do funcionário.";
}

export async function linkStaffByEmailAction(formData: FormData) {
  const { supabase } = await requireStaff(["admin"]);
  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "");

  if (!email || !fullName || !ROLES.includes(role)) {
    back("Preencha o e-mail, nome e função corretamente.");
  }

  const { error } = await supabase.rpc("upsert_staff_by_email", {
    p_email: email,
    p_full_name: fullName,
    p_role: role,
    p_active: true,
  });

  revalidatePath("/admin/equipe");
  if (error) back(friendly(error.message));
  back("Funcionário vinculado/atualizado com sucesso.");
}

export async function updateStaffProfileAction(formData: FormData) {
  const { supabase } = await requireStaff(["admin"]);
  const id = String(formData.get("id") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  const active = formData.get("active") === "true";

  if (!UUID.test(id) || !fullName || !ROLES.includes(role)) {
    back("Dados inválidos.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, role, active })
    .eq("id", id);

  revalidatePath("/admin/equipe");
  if (error) back(friendly(error.message));
  back("Perfil atualizado.");
}
