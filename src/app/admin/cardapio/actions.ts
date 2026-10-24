"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { parseBRLToCents } from "@/lib/money";
import { MAX_IMAGE_BYTES, sniffImage } from "@/lib/image";

const ROLES = ["admin", "manager"] as const;
const STATUSES = ["draft", "published", "archived"];
const SECTORS = ["kitchen", "bar"];
const UUID = /^[0-9a-f-]{36}$/i;

function back(path: string, msg: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}`);
}
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function createCategory(formData: FormData) {
  const { supabase } = await requireStaff([...ROLES]);
  const name = str(formData, "name");
  if (!name) back("/admin/cardapio", "Informe o nome da categoria.");
  const { data: last } = await supabase.from("menu_categories").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  const { error } = await supabase.from("menu_categories").insert({ name, sort_order: (last?.[0]?.sort_order ?? 0) + 1 });
  revalidatePath("/admin/cardapio");
  back("/admin/cardapio", error ? (error.message.includes("menu_categories_name_uq") ? "Já existe uma categoria com esse nome." : "Não foi possível criar a categoria.") : "Categoria criada como rascunho.");
}

export async function updateCategory(formData: FormData) {
  const { supabase } = await requireStaff([...ROLES]);
  const id = str(formData, "id");
  const name = str(formData, "name");
  const status = str(formData, "status");
  if (!UUID.test(id) || !name || !STATUSES.includes(status)) back("/admin/cardapio", "Dados inválidos.");
  const { error } = await supabase.from("menu_categories").update({ name, status }).eq("id", id);
  revalidatePath("/admin/cardapio");
  back("/admin/cardapio", error ? "Não foi possível salvar a categoria." : "Categoria salva.");
}

function readProduct(formData: FormData) {
  const name = str(formData, "name");
  const price = parseBRLToCents(str(formData, "price"));
  const status = str(formData, "status");
  const sector = str(formData, "sector");
  const category_id = str(formData, "category_id");
  if (!name) return { error: "Informe o nome do produto." };
  if (price === null) return { error: "Preço inválido. Use o formato 12,50." };
  if (!STATUSES.includes(status) || !SECTORS.includes(sector) || !UUID.test(category_id)) return { error: "Dados inválidos." };
  return {
    value: {
      name,
      description: str(formData, "description") || null,
      price_cents: price,
      status,
      sector,
      category_id,
      available: formData.get("available") === "on",
    },
  };
}

export async function createProduct(formData: FormData) {
  const { supabase } = await requireStaff([...ROLES]);
  const r = readProduct(formData);
  if (!r.value) back("/admin/cardapio/produto/novo", r.error!);
  const { data, error } = await supabase.from("products").insert(r.value).select("id").single();
  revalidatePath("/admin/cardapio");
  if (error || !data) back("/admin/cardapio/produto/novo", "Não foi possível criar o produto.");
  redirect(`/admin/cardapio/produto/${data.id}?msg=${encodeURIComponent("Produto criado. Agora você pode enviar a foto e configurar adicionais.")}`);
}

export async function updateProduct(formData: FormData) {
  const { supabase } = await requireStaff([...ROLES]);
  const id = str(formData, "id");
  const path = `/admin/cardapio/produto/${id}`;
  if (!UUID.test(id)) back("/admin/cardapio", "Produto inválido.");
  const r = readProduct(formData);
  if (!r.value) back(path, r.error!);
  const { error } = await supabase.from("products").update(r.value).eq("id", id);
  revalidatePath("/admin/cardapio");
  back(path, error ? "Não foi possível salvar o produto." : "Produto salvo.");
}

export async function uploadImage(formData: FormData) {
  const { supabase } = await requireStaff([...ROLES]);
  const id = str(formData, "id");
  const path = `/admin/cardapio/produto/${id}`;
  if (!UUID.test(id)) back("/admin/cardapio", "Produto inválido.");
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) back(path, "Escolha uma imagem.");
  if (file.size > MAX_IMAGE_BYTES) back(path, "Imagem muito grande (máximo 5 MB).");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) back(path, "Formato não aceito. Use JPEG, PNG ou WebP.");

  const { data: prod } = await supabase.from("products").select("image_path").eq("id", id).maybeSingle();
  if (!prod) back("/admin/cardapio", "Produto não encontrado.");
  // Nome novo a cada envio (evita cache antigo); o arquivo anterior é removido só após o sucesso.
  const newPath = `${id}/${crypto.randomUUID()}.${kind.ext}`;
  const up = await supabase.storage.from("menu-images").upload(newPath, bytes, { contentType: kind.mime, upsert: false });
  if (up.error) back(path, "Não foi possível enviar a imagem.");
  const { error } = await supabase.from("products").update({ image_path: newPath }).eq("id", id);
  if (error) {
    await supabase.storage.from("menu-images").remove([newPath]);
    back(path, "Não foi possível salvar a imagem.");
  }
  if (prod.image_path) await supabase.storage.from("menu-images").remove([prod.image_path]);
  revalidatePath("/admin/cardapio");
  back(path, "Imagem atualizada.");
}

export async function removeImage(formData: FormData) {
  const { supabase } = await requireStaff([...ROLES]);
  const id = str(formData, "id");
  const path = `/admin/cardapio/produto/${id}`;
  if (!UUID.test(id)) back("/admin/cardapio", "Produto inválido.");
  const { data: prod } = await supabase.from("products").select("image_path").eq("id", id).maybeSingle();
  if (prod?.image_path) {
    await supabase.from("products").update({ image_path: null }).eq("id", id);
    await supabase.storage.from("menu-images").remove([prod.image_path]);
  }
  revalidatePath("/admin/cardapio");
  back(path, "Imagem removida.");
}

export async function addGroup(formData: FormData) {
  const { supabase } = await requireStaff([...ROLES]);
  const product_id = str(formData, "product_id");
  const path = `/admin/cardapio/produto/${product_id}`;
  const name = str(formData, "name");
  const min = Number(str(formData, "min"));
  const max = Number(str(formData, "max"));
  if (!UUID.test(product_id) || !name) back(path, "Informe o nome do grupo.");
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1 || max < min) back(path, "Limites inválidos: o máximo deve ser pelo menos 1 e não menor que o mínimo.");
  const { error } = await supabase.from("option_groups").insert({ product_id, name, min_select: min, max_select: max });
  back(path, error ? "Não foi possível criar o grupo." : "Grupo criado.");
}

export async function deleteGroup(formData: FormData) {
  const { supabase } = await requireStaff([...ROLES]);
  const product_id = str(formData, "product_id");
  const id = str(formData, "id");
  if (UUID.test(id)) await supabase.from("option_groups").delete().eq("id", id);
  back(`/admin/cardapio/produto/${product_id}`, "Grupo removido.");
}

export async function addOption(formData: FormData) {
  const { supabase } = await requireStaff([...ROLES]);
  const product_id = str(formData, "product_id");
  const path = `/admin/cardapio/produto/${product_id}`;
  const group_id = str(formData, "group_id");
  const name = str(formData, "name");
  const price = parseBRLToCents(str(formData, "price") || "0");
  if (!UUID.test(group_id) || !name) back(path, "Informe o nome da opção.");
  if (price === null) back(path, "Preço inválido. Use o formato 2,00.");
  const { error } = await supabase.from("options").insert({ group_id, name, price_cents: price });
  back(path, error ? "Não foi possível criar a opção." : "Opção adicionada.");
}

export async function toggleOption(formData: FormData) {
  const { supabase } = await requireStaff([...ROLES]);
  const product_id = str(formData, "product_id");
  const id = str(formData, "id");
  if (UUID.test(id)) await supabase.from("options").update({ available: formData.get("available") === "true" }).eq("id", id);
  back(`/admin/cardapio/produto/${product_id}`, "Opção atualizada.");
}

export async function deleteOption(formData: FormData) {
  const { supabase } = await requireStaff([...ROLES]);
  const product_id = str(formData, "product_id");
  const id = str(formData, "id");
  if (UUID.test(id)) await supabase.from("options").delete().eq("id", id);
  back(`/admin/cardapio/produto/${product_id}`, "Opção removida.");
}
