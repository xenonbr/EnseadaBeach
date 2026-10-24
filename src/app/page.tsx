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
      {/* Top Banner & Hero Institucional */}
      <section className="relative overflow-hidden bg-ocean px-4 py-12 text-center text-white md:py-16">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.jpg"
            alt="Cabana Enseada Beach Trancoso"
            className="w-full max-w-sm rounded-2xl shadow-2xl ring-4 ring-white/10 md:max-w-md"
          />

          <div className="flex flex-col gap-1">
            <span className="brand-tagline text-xs font-bold text-turquoise">
              Cabana • Praia dos Coqueiros
            </span>
            <p className="text-base text-white/90 md:text-lg">
              {cfg.address_line}
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link href="/cardapio" className="btn btn-gold px-8 text-base">
              Visualizar cardápio
            </Link>
          </div>

          <p className="max-w-md rounded-xl bg-white/10 px-4 py-2.5 text-xs text-white/90 backdrop-blur-xs">
            🌴 <strong>Na praia?</strong> Escaneie o QR Code individual da sua mesa para pedir bebidas e petiscos diretamente pelo celular.
          </p>
        </div>
      </section>

      {/* Seção Vídeo de Divulgação Oficial */}
      <section className="mx-auto -mt-6 w-full max-w-4xl px-4">
        <div className="card overflow-hidden border-2 border-turquoise shadow-xl">
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-sand pb-3">
            <div>
              <span className="brand-tagline block text-xs font-bold text-ocean">
                Experiência
              </span>
              <h2 className="text-xl font-bold text-[#14213d] md:text-2xl">
                Cabana Enseada Beach em Trancoso
              </h2>
            </div>
            <span className="chip chip-on hidden sm:inline-flex">Praia dos Coqueiros</span>
          </div>

          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
            <video
              controls
              playsInline
              preload="metadata"
              className="h-full w-full object-cover"
            >
              <source src="/video.mp4" type="video/mp4" />
              Seu navegador não suporta reprodução de vídeo.
            </video>
          </div>
          <p className="mt-2 text-center text-xs text-slate-700">
            Assista ao vídeo e sinta a atmosfera da Praia dos Coqueiros.
          </p>
        </div>
      </section>

      {/* Grid de Informações Institucionais */}
      <div className="mx-auto mt-6 grid w-full max-w-5xl gap-5 p-4 md:grid-cols-2 md:p-8">
        <section className="card flex flex-col gap-2">
          <span className="brand-tagline text-xs font-bold text-turquoise">Apresentação</span>
          <h3 className="text-lg font-bold text-ocean">Sobre a Cabana</h3>
          <p className="text-slate-700">
            {cfg.about_text || "A apresentação oficial será confirmada pelo proprietário."}
          </p>
        </section>

        <section className="card flex flex-col gap-2">
          <span className="brand-tagline text-xs font-bold text-turquoise">Atendimento</span>
          <h3 className="text-lg font-bold text-ocean">Horários de Funcionamento</h3>
          <p className="text-slate-700">
            {cfg.opening_hours || "Horário de funcionamento a confirmar pelo proprietário."}
          </p>
        </section>

        <section className="card flex flex-col gap-2">
          <span className="brand-tagline text-xs font-bold text-turquoise">Fale Conosco</span>
          <h3 className="text-lg font-bold text-ocean">Contato</h3>
          <div className="text-slate-700">
            {cfg.phone || cfg.whatsapp ? (
              <div className="flex flex-col gap-1">
                {cfg.phone && <span>Telefone: {cfg.phone}</span>}
                {cfg.whatsapp && <span>WhatsApp: {cfg.whatsapp}</span>}
              </div>
            ) : (
              "Telefone e WhatsApp a confirmar pelo proprietário."
            )}
          </div>
        </section>

        <section className="card flex flex-col gap-2">
          <span className="brand-tagline text-xs font-bold text-turquoise">Trancoso • Bahia</span>
          <h3 className="text-lg font-bold text-ocean">Como Chegar</h3>
          <p className="text-slate-700">{cfg.address_line}</p>
          {cfg.map_url ? (
            <a
              href={cfg.map_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex font-semibold text-ocean hover:underline"
            >
              Ver localização no Google Maps →
            </a>
          ) : (
            <p className="text-xs text-slate-700">Mapa detalhado a confirmar.</p>
          )}
        </section>

        <section className="card flex flex-col gap-2">
          <span className="brand-tagline text-xs font-bold text-turquoise">Conecte-se</span>
          <h3 className="text-lg font-bold text-ocean">Redes Sociais</h3>
          {cfg.instagram_url ? (
            <a
              href={cfg.instagram_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex font-semibold text-ocean hover:underline"
            >
              Acompanhe no Instagram →
            </a>
          ) : (
            <p className="text-slate-700">Links sociais oficiais a confirmar.</p>
          )}
        </section>

        <section className="card flex flex-col gap-2">
          <span className="brand-tagline text-xs font-bold text-turquoise">Ambiente</span>
          <h3 className="text-lg font-bold text-ocean">Galeria de Fotos</h3>
          {cfg.gallery_paths.length === 0 ? (
            <p className="text-slate-700">
              As fotos próprias do estabelecimento serão adicionadas pelo proprietário no painel administrativo.
            </p>
          ) : (
            <div className="mt-1 grid grid-cols-2 gap-2">
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

      {/* Rodapé com Transparência LGPD */}
      <footer className="mt-auto border-t border-sand bg-white p-5 text-center text-xs text-slate-700">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 sm:flex-row">
          <span>Cabana Enseada Beach Trancoso — Praia dos Coqueiros, Porto Seguro–BA</span>
          <div className="flex gap-4">
            <Link href="/cardapio" className="hover:underline">
              Cardápio
            </Link>
            <Link href="/privacidade" className="font-semibold text-ocean hover:underline">
              Privacidade e LGPD
            </Link>
            <Link href="/login" className="text-slate-600 hover:underline">
              Acesso Equipe
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
