import { requireStaff } from "@/lib/auth";
import {
  removeGalleryImageAction,
  saveSiteSettingsAction,
  uploadGalleryImageAction,
} from "./actions";

type SettingsRow = {
  about_text: string | null;
  opening_hours: string | null;
  phone: string | null;
  whatsapp: string | null;
  address_line: string;
  map_url: string | null;
  instagram_url: string | null;
  gallery_paths: string[];
};

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const { supabase } = await requireStaff(["admin", "manager"]);
  const { msg } = await searchParams;

  const { data } = await supabase
    .from("site_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  const cfg: SettingsRow = (data as SettingsRow) ?? {
    about_text: null,
    opening_hours: null,
    phone: null,
    whatsapp: null,
    address_line: "Praia dos Coqueiros, Trancoso, Porto Seguro - BA",
    map_url: null,
    instagram_url: null,
    gallery_paths: [],
  };

  return (
    <main className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Site Público e Galeria Institucional</h1>
        <p className="text-slate-700">
          Edite os dados oficiais exibidos na página inicial sem precisar de programação. Campos em branco permanecem como &ldquo;a confirmar&rdquo;.
        </p>
      </header>

      {msg && (
        <p role="status" className="rounded-xl border border-sky-400 bg-sky-50 p-3 text-sky-950">
          {msg}
        </p>
      )}

      <form action={saveSiteSettingsAction} className="card grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 font-medium md:col-span-2">
          Apresentação oficial (Sobre a Cabana Enseada Beach)
          <textarea
            name="about_text"
            rows={3}
            defaultValue={cfg.about_text ?? ""}
            placeholder="Descrição oficial validada pelo proprietário"
            className="input h-auto py-2"
          />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          Horário de funcionamento
          <input
            name="opening_hours"
            defaultValue={cfg.opening_hours ?? ""}
            placeholder="Ex.: Todos os dias, das 9h às 17h"
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          Localização / Endereço
          <input
            name="address_line"
            defaultValue={cfg.address_line}
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          Telefone
          <input
            name="phone"
            defaultValue={cfg.phone ?? ""}
            placeholder="Ex.: (73) 99999-9999"
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          WhatsApp
          <input
            name="whatsapp"
            defaultValue={cfg.whatsapp ?? ""}
            placeholder="Ex.: 5573999999999"
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          Link do Google Maps (opcional)
          <input
            name="map_url"
            type="url"
            defaultValue={cfg.map_url ?? ""}
            placeholder="https://maps.google.com/..."
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          Link do Instagram / Rede Social (opcional)
          <input
            name="instagram_url"
            type="url"
            defaultValue={cfg.instagram_url ?? ""}
            placeholder="https://instagram.com/..."
            className="input"
          />
        </label>
        <div className="md:col-span-2">
          <button className="btn btn-primary">Salvar informações institucionais</button>
        </div>
      </form>

      <section className="card flex flex-col gap-4">
        <h2 className="text-lg font-bold text-ocean">
          Galeria de Fotos Próprias ({cfg.gallery_paths.length}/12)
        </h2>
        <p className="text-xs text-slate-700">
          Envie apenas fotografias reais e autorizadas da Cabana Enseada Beach Trancoso (JPEG, PNG ou WebP até 5 MB).
        </p>

        {cfg.gallery_paths.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-400 p-6 text-center text-slate-700">
            Nenhuma foto enviada para a galeria ainda.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {cfg.gallery_paths.map((path) => {
              const url = supabase.storage.from("menu-images").getPublicUrl(path).data.publicUrl;
              return (
                <li key={path} className="flex flex-col gap-2 rounded-xl border p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt="Foto da Cabana Enseada Beach"
                    className="h-40 w-full rounded-lg object-cover"
                  />
                  <form action={removeGalleryImageAction}>
                    <input type="hidden" name="path" value={path} />
                    <button className="btn h-9 w-full text-xs text-red-700">
                      Remover da galeria
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        <form action={uploadGalleryImageAction} className="flex flex-wrap items-center gap-2 border-t pt-3">
          <input
            type="file"
            name="image"
            accept="image/jpeg,image/png,image/webp"
            required
            aria-label="Selecionar foto para a galeria"
            className="min-w-0 flex-1"
          />
          <button className="btn btn-primary">Enviar foto para a galeria</button>
        </form>
      </section>
    </main>
  );
}
