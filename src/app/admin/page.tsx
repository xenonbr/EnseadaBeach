import { requireStaff } from "@/lib/auth";

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { profile } = await requireStaff();
  const { erro } = await searchParams;
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Olá, {profile.full_name}</h1>
      {erro === "permissao" && (
        <p role="alert" className="rounded-lg border border-amber-400 bg-amber-50 p-3">Você não tem permissão para acessar essa área.</p>
      )}
      <p>Use o menu acima. Novos módulos (cardápio, pedidos, cozinha e bar) serão adicionados nas próximas etapas.</p>
    </main>
  );
}
