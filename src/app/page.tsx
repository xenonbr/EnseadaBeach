import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
      <section className="flex flex-col items-center gap-6 bg-ocean px-4 py-10 text-center text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpg" alt="Cabana Enseada Beach Trancoso" className="w-full max-w-md rounded-2xl" />
        <p className="text-lg">Praia dos Coqueiros, Trancoso, Porto Seguro - BA</p>
        <Link href="/cardapio" className="btn border-gold bg-gold px-8 text-lg text-[#14213d] hover:bg-[#e0a500]">Ver cardápio</Link>
      </section>

      <div className="mx-auto grid w-full max-w-5xl gap-4 p-4 md:grid-cols-2 md:p-8">
        {[
          ["Sobre", "A apresentação oficial será adicionada pelo proprietário."],
          ["Horários", "Horário de funcionamento a confirmar."],
          ["Contato", "Telefone e WhatsApp a confirmar."],
          ["Como chegar", "Endereço completo e mapa a confirmar."],
          ["Redes sociais", "Links a confirmar."],
          ["Galeria", "As fotos do espaço serão adicionadas em breve."],
        ].map(([t, d]) => (
          <section key={t} className="card">
            <h2 className="text-lg font-bold text-ocean">{t}</h2>
            <p className="mt-1 text-slate-700">{d}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
