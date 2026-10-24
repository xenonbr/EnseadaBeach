import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type SiteSettings = {
  about_text: string | null;
  opening_hours: string | null;
  phone: string | null;
  whatsapp: string | null;
  address_line: string;
  map_url: string | null;
  instagram_url: string | null;
  gallery_paths: string[];
};

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.from("site_settings").select("*").eq("id", 1).maybeSingle();
  const cfg: SiteSettings = (data as SiteSettings) ?? {
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
    <main className="flex min-h-screen flex-col">
      <section className="flex flex-col items-center gap-6 bg-ocean px-4 py-10 text-center text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.jpg"
          alt="Cabana Enseada Beach Trancoso"
          className="w-full max-w-md rounded-2xl shadow-lg"
        />
        <p className="text-lg font-medium">{cfg.address_line}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/cardapio"
            className="btn border-gold bg-gold px-8 text-lg text-[#14213d] hover:bg-[#e0a500]"
          >
            Visualizar cardápio
          </Link>
        </div>
        <p className="max-w-md text-xs text-white/85">
          Está em uma de nossas mesas? Escaneie o QR Code da sua mesa para enviar pedidos diretamente da praia.
        </p>
      </section>

      <div className="mx-auto grid w-full max-w-5xl gap-4 p-4 md:grid-cols-2 md:p-8">
        <section className="card">
          <h2 className="text-lg font-bold text-ocean">Sobre</h2>
          <p className="mt-1 text-slate-700">
            {cfg.about_text || "A apresentação oficial será adicionada pelo proprietário."}
          </p>
        </section>

        <section className="card">
          <h2 className="text-lg font-bold text-ocean">Horários</h2>
          <p className="mt-1 text-slate-700">
            {cfg.opening_hours || "Horário de funcionamento a confirmar."}
          </p>
        </section>

        <section className="card">
          <h2 className="text-lg font-bold text-ocean">Contato</h2>
          <p className="mt-1 text-slate-700">
            {cfg.phone || cfg.whatsapp ? (
              <>
                {cfg.phone && <span className="block">Telefone: {cfg.phone}</span>}
                {cfg.whatsapp && <span className="block">WhatsApp: {cfg.whatsapp}</span>}
              </>
            ) : (
              "Telefone e WhatsApp a confirmar."
            )}
          </p>
        </section>

        <section className="card">
          <h2 className="text-lg font-bold text-ocean">Como chegar</h2>
          <p className="mt-1 text-slate-700">{cfg.address_line}</p>
          {cfg.map_url ? (
            <a
              href={cfg.map_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block font-semibold text-ocean underline"
            >
              Abrir localização no mapa
            </a>
          ) : (
            <p className="mt-1 text-xs text-slate-600">Mapa detalhado a confirmar.</p>
          )}
        </section>

        <section className="card">
          <h2 className="text-lg font-bold text-ocean">Redes sociais</h2>
          {cfg.instagram_url ? (
            <a
              href={cfg.instagram_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block font-semibold text-ocean underline"
            >
              Acompanhe no Instagram
            </a>
          ) : (
            <p className="mt-1 text-slate-700">Links oficiais a confirmar.</p>
          )}
        </section>

        <section className="card">
          <h2 className="text-lg font-bold text-ocean">Galeria</h2>
          {cfg.gallery_paths.length === 0 ? (
            <p className="mt-1 text-slate-700">
              As fotos próprias do espaço serão adicionadas em breve pelo proprietário.
            </p>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {cfg.gallery_paths.map((path) => {
                const url = supabase.storage.from("menu-images").getPublicUrl(path).data.publicUrl;
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={path}
                    src={url}
                    alt="Cabana Enseada Beach Trancoso"
                    className="h-32 w-full rounded-xl object-cover"
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>

      <footer className="mt-auto border-t bg-white p-4 text-center text-xs text-slate-700">
        <span>Cabana Enseada Beach Trancoso — Praia dos Coqueiros, Trancoso, Porto Seguro–BA</span>
        <span className="mx-2">•</span>
        <Link href="/privacidade" className="font-semibold text-ocean underline">
          Privacidade e LGPD
        </Link>
      </footer>
    </main>
  );
}
