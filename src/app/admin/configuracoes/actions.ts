"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { MAX_IMAGE_BYTES, sniffImage } from "@/lib/image";

function back(msg: string): never {
  redirect(`/admin/configuracoes?msg=${encodeURIComponent(msg)}`);
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim() || null;

export async function saveSiteSettingsAction(formData: FormData) {
  const { supabase, user } = await requireStaff(["admin", "manager"]);
  const address = String(formData.get("address_line") ?? "").trim() || "Praia dos Coqueiros, Trancoso, Porto Seguro - BA";

  const { error } = await supabase
    .from("site_settings")
    .update({
      about_text: str(formData, "about_text"),
      opening_hours: str(formData, "opening_hours"),
      phone: str(formData, "phone"),
      whatsapp: str(formData, "whatsapp"),
      address_line: address,
      map_url: str(formData, "map_url"),
      instagram_url: str(formData, "instagram_url"),
      updated_by: user.id,
    })
    .eq("id", 1);

  revalidatePath("/");
  revalidatePath("/admin/configuracoes");
  if (error) back("Não foi possível salvar as informações institucionais.");
  back("Informações do site público atualizadas.");
}

export async function uploadGalleryImageAction(formData: FormData) {
  const { supabase, user } = await requireStaff(["admin", "manager"]);
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) back("Escolha uma foto própria para a galeria.");
  if (file.size > MAX_IMAGE_BYTES) back("Foto muito grande (máximo 5 MB).");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) back("Formato inválido. Use JPEG, PNG ou WebP.");

  const { data: cfg } = await supabase
    .from("site_settings")
    .select("gallery_paths")
    .eq("id", 1)
    .maybeSingle();

  const current = (cfg?.gallery_paths ?? []) as string[];
  if (current.length >= 12) back("Limite de 12 fotos na galeria atingido.");

  const newPath = `gallery/${crypto.randomUUID()}.${kind.ext}`;
  const up = await supabase.storage
    .from("menu-images")
    .upload(newPath, bytes, { contentType: kind.mime, upsert: false });
  if (up.error) back("Não foi possível enviar a foto.");

  const next = [...current, newPath];
  const { error } = await supabase
    .from("site_settings")
    .update({ gallery_paths: next, updated_by: user.id })
    .eq("id", 1);

  if (error) {
    await supabase.storage.from("menu-images").remove([newPath]);
    back("Erro ao salvar foto na galeria.");
  }

  revalidatePath("/");
  revalidatePath("/admin/configuracoes");
  back("Foto adicionada à galeria do site.");
}

export async function removeGalleryImageAction(formData: FormData) {
  const { supabase, user } = await requireStaff(["admin", "manager"]);
  const pathToRemove = String(formData.get("path") ?? "");
  if (!pathToRemove.startsWith("gallery/")) back("Caminho de imagem inválido.");

  const { data: cfg } = await supabase
    .from("site_settings")
    .select("gallery_paths")
    .eq("id", 1)
    .maybeSingle();

  const current = (cfg?.gallery_paths ?? []) as string[];
  const next = current.filter((p) => p !== pathToRemove);

  await supabase
    .from("site_settings")
    .update({ gallery_paths: next, updated_by: user.id })
    .eq("id", 1);
  await supabase.storage.from("menu-images").remove([pathToRemove]);

  revalidatePath("/");
  revalidatePath("/admin/configuracoes");
  back("Foto removida da galeria.");
}
