import { requireStaff } from "@/lib/auth";

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { profile } = await requireStaff();
  const { erro } = await searchParams;
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold md:text-3xl">Olá, {profile.full_name}</h1>
      {erro === "permissao" && (
        <p role="alert" className="rounded-xl border border-amber-500 bg-amber-50 p-3 text-amber-950">
          Você não tem permissão para acessar essa área.
        </p>
      )}
      <section className="card">
        <h2 className="font-semibold">Bem-vindo ao painel</h2>
        <p className="mt-1 text-slate-700">
          Use o menu para gerenciar as mesas. Cardápio, pedidos, cozinha e bar serão adicionados nas próximas etapas.
        </p>
      </section>
    </main>
  );
}
