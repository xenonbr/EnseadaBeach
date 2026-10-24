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

  const defaultAbout =
    cfg.about_text ||
    "Localizada na charmosa Praia dos Coqueiros, a Cabana Enseada Beach combina a alta gastronomia baiana com o sossego e a sofisticação de Trancoso. Nossos pratos celebram os frutos do mar mais frescos da região, acompanhados por coquetéis autorais refrescantes e um atendimento acolhedor à beira-mar.";

  const defaultHours =
    cfg.opening_hours || "Todos os dias, das 09h às 18h (atendimento contínuo na praia e lounge).";

  return (
    <div className="flex min-h-screen flex-col bg-[#fbf8f2] text-[#14213d] selection:bg-[#f6b600] selection:text-[#14213d]">
      {/* ========================================================
          BARRA DE NAVEGAÇÃO REFINADA (ESTILO BEIJUPIRÁ)
          ======================================================== */}
      <header className="sticky top-0 z-50 border-b border-[#e8dcc6]/70 bg-white/90 backdrop-blur-md transition-all">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="group flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.jpg"
              alt="Logo Cabana Enseada Beach"
              className="h-12 w-12 rounded-full object-cover ring-2 ring-[#00c2d1] transition-transform duration-300 group-hover:scale-105"
            />
            <div className="flex flex-col">
              <span className="font-sans text-[10px] font-extrabold tracking-[0.25em] text-[#0047ff] uppercase">
                Cabana
              </span>
              <span className="font-serif text-lg font-bold tracking-tight text-[#14213d] sm:text-xl">
                Enseada Beach
              </span>
              <span className="font-sans text-[9px] font-semibold tracking-wider text-[#00c2d1] uppercase">
                Trancoso • Bahia
              </span>
            </div>
          </Link>

          {/* Links de ancoragem institucionais */}
          <nav className="hidden items-center gap-7 text-xs font-semibold tracking-widest text-[#14213d]/80 uppercase md:flex">
            <a href="#sobre" className="transition-colors hover:text-[#0047ff]">
              Sobre
            </a>
            <a href="#gastronomia" className="transition-colors hover:text-[#0047ff]">
              Gastronomia
            </a>
            <a href="#experiencia" className="transition-colors hover:text-[#0047ff]">
              Experiência
            </a>
            <a href="#localizacao" className="transition-colors hover:text-[#0047ff]">
              Como Chegar
            </a>
          </nav>

          {/* Botão de ação direta */}
          <div className="flex items-center gap-2">
            <Link
              href="/cardapio"
              className="inline-flex h-10 items-center justify-center rounded-full bg-[#f6b600] px-5 font-sans text-xs font-bold tracking-wider text-[#14213d] uppercase shadow-md transition-all hover:bg-[#e0a500] hover:shadow-lg active:scale-95"
            >
              Cardápio Digital
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ========================================================
            HERO SECTION DE ALTO PADRÃO (ATMOSFERA TRANCOSO)
            ======================================================== */}
        <section className="relative overflow-hidden bg-gradient-to-b from-[#0036c4] via-[#0047ff] to-[#00278a] px-4 py-16 text-center text-white sm:px-6 md:py-24">
          {/* Efeito sutil de textura de mar ao fundo */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/10 via-transparent to-black/30" />
          
          <div className="relative mx-auto flex max-w-4xl flex-col items-center">
            {/* Selo oficial de localização */}
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-[#00c2d1] animate-pulse" />
              <span className="font-sans text-xs font-bold tracking-[0.2em] text-[#00c2d1] uppercase">
                Praia dos Coqueiros • Trancoso
              </span>
            </div>

            {/* Imagem de Destaque / Logo com acabamento nobre */}
            <div className="mb-6 overflow-hidden rounded-2xl border-2 border-white/30 shadow-2xl ring-4 ring-[#f6b600]/30 transition-transform duration-500 hover:scale-102">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.jpg"
                alt="Cabana Enseada Beach Trancoso"
                className="h-44 w-auto object-cover sm:h-52 md:h-60"
              />
            </div>

            {/* Título editorial e subtítulo poético */}
            <h1 className="font-serif text-3xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
              Viva a Experiência <span className="italic text-[#f6b600]">Enseada</span>
            </h1>

            <p className="mt-4 max-w-2xl font-sans text-base text-white/90 sm:text-lg sm:leading-relaxed">
              Gastronomia baiana contemporânea, pescados nobres e coquetelaria autoral com os pés na
              areia sob a brisa e a sombra dos coqueiros mais famosos do Brasil.
            </p>

            {/* Chamadas de Ação */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/cardapio"
                className="inline-flex h-12 items-center justify-center rounded-full bg-[#f6b600] px-8 font-sans text-sm font-bold tracking-wider text-[#14213d] uppercase shadow-lg transition-all hover:bg-[#e0a500] hover:scale-105 active:scale-95"
              >
                Explorar Cardápio
              </Link>
              <a
                href="#localizacao"
                className="inline-flex h-12 items-center justify-center rounded-full border-2 border-white/60 bg-white/10 px-8 font-sans text-sm font-semibold tracking-wider text-white uppercase backdrop-blur-md transition-all hover:bg-white hover:text-[#0047ff]"
              >
                Como Chegar
              </a>
            </div>

            {/* Dica da mesa via QR Code */}
            <div className="mt-10 flex max-w-md items-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-3.5 text-left backdrop-blur-md">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#00c2d1]/20 text-xl text-[#00c2d1]">
                🌴
              </span>
              <p className="font-sans text-xs leading-relaxed text-white/95">
                <strong className="text-[#f6b600]">Está na praia?</strong> Aponte a câmera do seu celular para o QR Code da sua mesa e peça suas bebidas e pratos com atendimento imediato.
              </p>
            </div>
          </div>
        </section>

        {/* ========================================================
            SEÇÃO 1: SOBRE A CABANA & CONCEITO (INSPIRAÇÃO BEIJUPIRÁ)
            ======================================================== */}
        <section id="sobre" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-12">
            {/* Bloco de Imagem e Destaques Rústico-Chic */}
            <div className="relative lg:col-span-5">
              <div className="overflow-hidden rounded-3xl border-2 border-[#e8dcc6] bg-white p-3 shadow-xl">
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[#14213d]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logo.jpg"
                    alt="Cabana Enseada Beach"
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4 text-white">
                    <span className="font-sans text-[10px] font-bold tracking-[0.2em] text-[#00c2d1] uppercase">
                      Praia dos Coqueiros
                    </span>
                    <h4 className="font-serif text-lg font-bold text-white">
                      Trancoso, Porto Seguro - BA
                    </h4>
                  </div>
                </div>
              </div>

              {/* Card flutuante de sofisticação */}
              <div className="absolute -bottom-6 -right-3 hidden max-w-xs rounded-2xl border border-[#e8dcc6] bg-[#fbf8f2] p-4 shadow-xl sm:block">
                <span className="font-serif text-2xl text-[#f6b600]">“</span>
                <p className="font-serif text-xs italic text-[#14213d]/90">
                  Onde o mar calmo e o dendê encontram a melhor energia da Bahia.
                </p>
              </div>
            </div>

            {/* Bloco de Texto e Pilares Conceituais */}
            <div className="flex flex-col lg:col-span-7">
              <div className="inline-flex items-center gap-2">
                <span className="h-px w-8 bg-[#00c2d1]" />
                <span className="font-sans text-xs font-bold tracking-[0.25em] text-[#0047ff] uppercase">
                  A Experiência Enseada
                </span>
              </div>

              <h2 className="mt-3 font-serif text-3xl font-bold tracking-tight text-[#14213d] sm:text-4xl md:text-5xl">
                O refúgio perfeito à beira-mar de Trancoso
              </h2>

              <p className="mt-5 font-sans text-base leading-relaxed text-[#14213d]/80 sm:text-lg">
                {defaultAbout}
              </p>

              {/* 3 Pilares inspirados na experiência sensorial */}
              <div className="mt-8 grid gap-5 sm:grid-cols-3">
                <div className="rounded-2xl border border-[#e8dcc6] bg-white p-4 shadow-xs transition-all hover:border-[#00c2d1]">
                  <div className="mb-2 text-2xl">🦞</div>
                  <h3 className="font-serif text-base font-bold text-[#14213d]">Culinária Criativa</h3>
                  <p className="mt-1 text-xs text-[#14213d]/70">
                    Pescados do dia, moquecas artesanais e temperos nativos da Costa do Descobrimento.
                  </p>
                </div>

                <div className="rounded-2xl border border-[#e8dcc6] bg-white p-4 shadow-xs transition-all hover:border-[#00c2d1]">
                  <div className="mb-2 text-2xl">🍹</div>
                  <h3 className="font-serif text-base font-bold text-[#14213d]">Coquetelaria de Praia</h3>
                  <p className="mt-1 text-xs text-[#14213d]/70">
                    Caipirinhas com frutas tropicais, drinks assinados e cervejas no ponto ideal.
                  </p>
                </div>

                <div className="rounded-2xl border border-[#e8dcc6] bg-white p-4 shadow-xs transition-all hover:border-[#00c2d1]">
                  <div className="mb-2 text-2xl">☀️</div>
                  <h3 className="font-serif text-base font-bold text-[#14213d]">Lounge Pé na Areia</h3>
                  <p className="mt-1 text-xs text-[#14213d]/70">
                    Espreguiçadeiras, sombra natural de coqueiros e vista deslumbrante do oceano.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================
            SEÇÃO 2: VÍDEO EXCLUSIVO & ATMOSFERA (PUBLICIDADE OFICIAL)
            ======================================================== */}
        <section id="experiencia" className="border-y border-[#e8dcc6] bg-white py-16 md:py-24">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <span className="font-sans text-xs font-bold tracking-[0.25em] text-[#00c2d1] uppercase">
                Sinta a Atmosfera
              </span>
              <h2 className="mt-2 font-serif text-3xl font-bold tracking-tight text-[#14213d] sm:text-4xl">
                A brisa, as ondas e o sabor da Cabana
              </h2>
              <p className="mt-3 text-sm text-[#14213d]/70 sm:text-base">
                Dê play no vídeo oficial e sinta o clima acolhedor que espera por você na Praia dos Coqueiros.
              </p>
            </div>

            {/* Container Nobre de Reprodução de Vídeo */}
            <div className="mt-10 overflow-hidden rounded-3xl border-4 border-[#e8dcc6] bg-black shadow-2xl">
              <div className="relative aspect-video w-full">
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
            </div>

            <div className="mt-4 flex items-center justify-between px-2 text-xs text-[#14213d]/60">
              <span>Cabana Enseada Beach • Trancoso Oficial</span>
              <span>Praia dos Coqueiros, Bahia</span>
            </div>
          </div>
        </section>

        {/* ========================================================
            SEÇÃO 3: GASTRONOMIA & COQUETELARIA EM DESTAQUE
            ======================================================== */}
        <section id="gastronomia" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <div className="text-center">
            <span className="font-sans text-xs font-bold tracking-[0.25em] text-[#0047ff] uppercase">
              Sabores da Terra & do Mar
            </span>
            <h2 className="mt-2 font-serif text-3xl font-bold tracking-tight text-[#14213d] sm:text-4xl md:text-5xl">
              Gastronomia Praiana de Trancoso
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-[#14213d]/70 sm:text-base">
              Nossa cozinha valoriza a pesca artesanal local aliada a ingredientes frescos e técnicas
              que encantam o paladar dos clientes mais exigentes.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {/* Prato 1 */}
            <div className="group flex flex-col overflow-hidden rounded-3xl border border-[#e8dcc6] bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0047ff]/10 text-3xl text-[#0047ff]">
                🥘
              </div>
              <span className="font-sans text-[11px] font-bold tracking-wider text-[#00c2d1] uppercase">
                Pratos Principais
              </span>
              <h3 className="mt-1 font-serif text-2xl font-bold text-[#14213d]">
                Moquecas & Frutos do Mar
              </h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-[#14213d]/75">
                Moquecas preparadas no barro com camarões nobres, peixe fresco, azeite de dendê da terra, leite de coco natural, pirão e farofa crocante.
              </p>
              <div className="mt-6 border-t border-[#e8dcc6] pt-4">
                <Link
                  href="/cardapio"
                  className="inline-flex items-center text-xs font-bold tracking-wider text-[#0047ff] uppercase group-hover:underline"
                >
                  Ver no cardápio →
                </Link>
              </div>
            </div>

            {/* Prato 2 */}
            <div className="group flex flex-col overflow-hidden rounded-3xl border border-[#e8dcc6] bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f6b600]/15 text-3xl text-[#f6b600]">
                🥟
              </div>
              <span className="font-sans text-[11px] font-bold tracking-wider text-[#00c2d1] uppercase">
                Petiscos & Porções
              </span>
              <h3 className="mt-1 font-serif text-2xl font-bold text-[#14213d]">
                Petiscos Praianos
              </h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-[#14213d]/75">
                Casquinhas de siri com farofa de manteiga de garrafa, lulas crocantes, dadinhos de tapioca com melaço artesanal e pastéis fritos na hora.
              </p>
              <div className="mt-6 border-t border-[#e8dcc6] pt-4">
                <Link
                  href="/cardapio"
                  className="inline-flex items-center text-xs font-bold tracking-wider text-[#0047ff] uppercase group-hover:underline"
                >
                  Ver no cardápio →
                </Link>
              </div>
            </div>

            {/* Prato 3 */}
            <div className="group flex flex-col overflow-hidden rounded-3xl border border-[#e8dcc6] bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#00c2d1]/15 text-3xl text-[#00c2d1]">
                🍹
              </div>
              <span className="font-sans text-[11px] font-bold tracking-wider text-[#00c2d1] uppercase">
                Beach Bar
              </span>
              <h3 className="mt-1 font-serif text-2xl font-bold text-[#14213d]">
                Coquetelaria Autoral
              </h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-[#14213d]/75">
                Caipirinhas com frutas da região (cacau, caju, maracujá e tangerina), gins botânicos tropicais, cervejas selecionadas e água de coco gelada.
              </p>
              <div className="mt-6 border-t border-[#e8dcc6] pt-4">
                <Link
                  href="/cardapio"
                  className="inline-flex items-center text-xs font-bold tracking-wider text-[#0047ff] uppercase group-hover:underline"
                >
                  Ver no cardápio →
                </Link>
              </div>
            </div>
          </div>

          {/* Banner CTA integrado ao Cardápio Digital */}
          <div className="mt-12 rounded-3xl bg-gradient-to-r from-[#0036c4] via-[#0047ff] to-[#00c2d1] p-8 text-white shadow-xl sm:p-10">
            <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
              <div className="text-center md:text-left">
                <span className="font-sans text-xs font-bold tracking-[0.2em] text-[#f6b600] uppercase">
                  Cardápio Digital Interativo
                </span>
                <h3 className="mt-1 font-serif text-2xl font-bold sm:text-3xl">
                  Pronto para fazer o seu pedido?
                </h3>
                <p className="mt-2 text-sm text-white/90 sm:text-base">
                  Consulte todos os pratos, porções, bebidas e preços atualizados no nosso cardápio online.
                </p>
              </div>

              <Link
                href="/cardapio"
                className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-[#f6b600] px-8 font-sans text-xs font-bold tracking-widest text-[#14213d] uppercase shadow-lg transition-all hover:bg-white hover:text-[#0047ff] active:scale-95"
              >
                Acessar Cardápio Completo
              </Link>
            </div>
          </div>
        </section>

        {/* ========================================================
            SEÇÃO 4: COMO CHEGAR, LOCALIZAÇÃO & HORÁRIOS
            ======================================================== */}
        <section id="localizacao" className="border-t border-[#e8dcc6] bg-[#f4eee1] py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center">
              <span className="font-sans text-xs font-bold tracking-[0.25em] text-[#0047ff] uppercase">
                Destino Trancoso
              </span>
              <h2 className="mt-2 font-serif text-3xl font-bold tracking-tight text-[#14213d] sm:text-4xl">
                Como Chegar à Cabana Enseada Beach
              </h2>
              <p className="mt-2 text-sm text-[#14213d]/70 sm:text-base">
                Localização privilegiada na faixa de areia da Praia dos Coqueiros, a poucos minutos do Quadrado Histórico.
              </p>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {/* Card 1: Endereço & Acesso */}
              <div className="rounded-3xl border border-[#e8dcc6] bg-white p-7 shadow-sm">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0047ff]/10 text-2xl text-[#0047ff]">
                  📍
                </div>
                <h3 className="font-serif text-xl font-bold text-[#14213d]">Localização</h3>
                <p className="mt-2 text-sm text-[#14213d]/80 leading-relaxed">
                  {cfg.address_line}
                </p>
                <p className="mt-2 text-xs text-[#14213d]/60">
                  Acesso rápido a pé descendo pelo Quadrado de Trancoso ou via carro até o estacionamento da praia.
                </p>
                {cfg.map_url ? (
                  <a
                    href={cfg.map_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center text-xs font-bold tracking-wider text-[#0047ff] uppercase hover:underline"
                  >
                    Abrir no Google Maps →
                  </a>
                ) : (
                  <a
                    href="https://maps.google.com/?q=Praia+dos+Coqueiros+Trancoso+Porto+Seguro+Bahia"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center text-xs font-bold tracking-wider text-[#0047ff] uppercase hover:underline"
                  >
                    Abrir no Google Maps →
                  </a>
                )}
              </div>

              {/* Card 2: Horários */}
              <div className="rounded-3xl border border-[#e8dcc6] bg-white p-7 shadow-sm">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f6b600]/15 text-2xl text-[#f6b600]">
                  🕒
                </div>
                <h3 className="font-serif text-xl font-bold text-[#14213d]">Horários</h3>
                <p className="mt-2 text-sm text-[#14213d]/80 leading-relaxed">
                  {defaultHours}
                </p>
                <p className="mt-2 text-xs text-[#14213d]/60">
                  Cozinha e bar ativos continuamente para café da manhã, almoço praiano e entardecer.
                </p>
              </div>

              {/* Card 3: Atendimento & WhatsApp */}
              <div className="rounded-3xl border border-[#e8dcc6] bg-white p-7 shadow-sm sm:col-span-2 lg:col-span-1">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#00c2d1]/15 text-2xl text-[#00c2d1]">
                  💬
                </div>
                <h3 className="font-serif text-xl font-bold text-[#14213d]">Atendimento & Contato</h3>
                <p className="mt-2 text-sm text-[#14213d]/80 leading-relaxed">
                  Dúvidas sobre espreguiçadeiras, grupos ou eventos na praia? Fale diretamente conosco.
                </p>
                <div className="mt-3 flex flex-col gap-1 text-sm font-semibold text-[#14213d]">
                  {cfg.phone && <span>Telefone: {cfg.phone}</span>}
                  {cfg.whatsapp && <span>WhatsApp: {cfg.whatsapp}</span>}
                </div>
                {cfg.whatsapp && (
                  <a
                    href={`https://wa.me/${cfg.whatsapp.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-[#00c2d1] px-5 font-sans text-xs font-bold tracking-wider text-[#14213d] uppercase shadow-xs transition-colors hover:bg-[#00a8b5]"
                  >
                    Falar no WhatsApp
                  </a>
                )}
                {cfg.instagram_url && (
                  <a
                    href={cfg.instagram_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block text-xs font-bold text-[#0047ff] hover:underline"
                  >
                    Seguir no Instagram →
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================
            SEÇÃO 5: GALERIA DE FOTOS DO AMBIENTE
            ======================================================== */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="text-center">
            <span className="font-sans text-xs font-bold tracking-[0.25em] text-[#00c2d1] uppercase">
              Galeria
            </span>
            <h2 className="mt-2 font-serif text-3xl font-bold tracking-tight text-[#14213d] sm:text-4xl">
              Nosso Ambiente à Beira-Mar
            </h2>
            <p className="mt-2 text-sm text-[#14213d]/70">
              Registros da atmosfera, pratos e momentos inesquecíveis na Praia dos Coqueiros.
            </p>
          </div>

          <div className="mt-10">
            {cfg.gallery_paths.length === 0 ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="group relative aspect-[4/3] overflow-hidden rounded-3xl border border-[#e8dcc6] bg-white shadow-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logo.jpg"
                    alt="Cabana Enseada Beach"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80" />
                  <span className="absolute bottom-4 left-4 font-serif text-sm font-semibold text-white">
                    Pé na Areia • Praia dos Coqueiros
                  </span>
                </div>
                <div className="group relative aspect-[4/3] overflow-hidden rounded-3xl border border-[#e8dcc6] bg-white shadow-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logo.jpg"
                    alt="Gastronomia Trancoso"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80" />
                  <span className="absolute bottom-4 left-4 font-serif text-sm font-semibold text-white">
                    Gastronomia & Moquecas
                  </span>
                </div>
                <div className="group relative aspect-[4/3] overflow-hidden rounded-3xl border border-[#e8dcc6] bg-white shadow-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logo.jpg"
                    alt="Coquetelaria Enseada Beach"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80" />
                  <span className="absolute bottom-4 left-4 font-serif text-sm font-semibold text-white">
                    Beach Bar & Coquetéis
                  </span>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {cfg.gallery_paths.map((path) => {
                  const url = supabase.storage.from("menu-images").getPublicUrl(path).data.publicUrl;
                  return (
                    <div
                      key={path}
                      className="group relative aspect-[4/3] overflow-hidden rounded-3xl border border-[#e8dcc6] bg-white shadow-xs"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt="Cabana Enseada Beach Trancoso"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* ========================================================
          RODAPÉ DE ALTO PADRÃO (FOOTER LUXUOSO)
          ======================================================== */}
      <footer className="border-t border-[#14213d]/20 bg-[#14213d] text-white/80">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
          <div className="grid gap-8 md:grid-cols-12">
            {/* Coluna 1: Identidade da Marca */}
            <div className="md:col-span-5">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.jpg"
                  alt="Cabana Enseada Beach"
                  className="h-12 w-12 rounded-full object-cover ring-2 ring-[#f6b600]"
                />
                <div>
                  <span className="font-sans text-[10px] font-extrabold tracking-[0.25em] text-[#00c2d1] uppercase">
                    Cabana
                  </span>
                  <h4 className="font-serif text-xl font-bold text-white">
                    Enseada Beach Trancoso
                  </h4>
                </div>
              </div>

              <p className="mt-4 max-w-sm text-xs leading-relaxed text-white/70">
                Experiência gastronômica pé na areia na Praia dos Coqueiros, Trancoso, Bahia. Sabores autênticos do mar, coquetelaria refinada e o acolhimento baiano.
              </p>

              <p className="mt-4 text-[11px] text-white/50">
                {cfg.address_line}
              </p>
            </div>

            {/* Coluna 2: Navegação & Links */}
            <div className="md:col-span-3">
              <h5 className="font-sans text-xs font-bold tracking-[0.2em] text-[#f6b600] uppercase">
                Navegação
              </h5>
              <ul className="mt-4 flex flex-col gap-2.5 text-xs">
                <li>
                  <Link href="/cardapio" className="transition-colors hover:text-white">
                    Cardápio Digital
                  </Link>
                </li>
                <li>
                  <a href="#sobre" className="transition-colors hover:text-white">
                    Sobre a Cabana
                  </a>
                </li>
                <li>
                  <a href="#gastronomia" className="transition-colors hover:text-white">
                    Gastronomia do Mar
                  </a>
                </li>
                <li>
                  <a href="#experiencia" className="transition-colors hover:text-white">
                    Vídeo Oficial
                  </a>
                </li>
                <li>
                  <a href="#localizacao" className="transition-colors hover:text-white">
                    Como Chegar & Horários
                  </a>
                </li>
              </ul>
            </div>

            {/* Coluna 3: Transparência & Governança */}
            <div className="md:col-span-4">
              <h5 className="font-sans text-xs font-bold tracking-[0.2em] text-[#f6b600] uppercase">
                Segurança & Privacidade
              </h5>
              <p className="mt-4 text-xs leading-relaxed text-white/70">
                Respeitamos sua privacidade e operamos em total conformidade com a Lei Geral de Proteção de Dados (LGPD). Seus pedidos na mesa são tratados com segurança e integridade.
              </p>
              <div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold">
                <Link
                  href="/privacidade"
                  className="text-[#00c2d1] hover:underline"
                >
                  Política de Privacidade & LGPD →
                </Link>
                <Link
                  href="/login"
                  className="text-white/40 hover:text-white/80 transition-colors"
                >
                  Acesso Restrito Equipe
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-center text-[11px] text-white/50 sm:flex-row sm:text-left">
            <span>
              © {new Date().getFullYear()} Cabana Enseada Beach Trancoso. Todos os direitos reservados.
            </span>
            <span className="font-sans tracking-wider text-[#00c2d1]">
              Praia dos Coqueiros • Trancoso • Bahia
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
