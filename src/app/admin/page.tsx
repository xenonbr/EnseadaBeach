import Link from "next/link";
import { requireStaff } from "@/lib/auth";

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { profile } = await requireStaff();
  const { erro } = await searchParams;
  const canManage = profile.role === "admin" || profile.role === "manager";
  const canTables = canManage || profile.role === "attendant";
  const canKitchen = canTables || profile.role === "kitchen";
  const canBar = canTables || profile.role === "bar";

  return (
    <main className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Olá, {profile.full_name}</h1>
        <p className="text-slate-700">
          Central operacional da Cabana Enseada Beach Trancoso.
        </p>
      </header>

      {erro === "permissao" && (
        <p role="alert" className="rounded-xl border border-amber-500 bg-amber-50 p-3 text-amber-950">
          Você não tem permissão para acessar essa área.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {canTables && (
          <Link href="/admin/pedidos" className="card flex flex-col gap-2 border-l-4 border-l-gold hover:border-ocean">
            <h2 className="text-lg font-bold text-ocean">Atendimento e Confirmação</h2>
            <p className="text-sm text-slate-700">
              Fila de confirmação presencial na mesa, chamados de atendente e entrega de pedidos prontos.
            </p>
          </Link>
        )}

        {canKitchen && (
          <Link href="/admin/cozinha" className="card flex flex-col gap-2 border-l-4 border-l-turquoise hover:border-ocean">
            <h2 className="text-lg font-bold text-ocean">Painel da Cozinha</h2>
            <p className="text-sm text-slate-700">
              Tarefas de preparo liberadas para a cozinha (adequado para tablet).
            </p>
          </Link>
        )}

        {canBar && (
          <Link href="/admin/bar" className="card flex flex-col gap-2 border-l-4 border-l-turquoise hover:border-ocean">
            <h2 className="text-lg font-bold text-ocean">Painel do Bar</h2>
            <p className="text-sm text-slate-700">
              Tarefas de bebidas e drinks liberadas para o bar (adequado para tablet).
            </p>
          </Link>
        )}

        {canTables && (
          <Link href="/admin/contas" className="card flex flex-col gap-2 hover:border-ocean">
            <h2 className="text-lg font-bold text-ocean">Contas e Recebimentos</h2>
            <p className="text-sm text-slate-700">
              Extrato de consumo por sessão, recebimento manual presencial e fechamento de conta.
            </p>
          </Link>
        )}

        {canTables && (
          <Link href="/admin/mesas" className="card flex flex-col gap-2 hover:border-ocean">
            <h2 className="text-lg font-bold text-ocean">Mesas, Sessões e QR Codes</h2>
            <p className="text-sm text-slate-700">
              Ativar/desativar mesas, abrir/encerrar sessões e baixar/imprimir QR Codes individuais.
            </p>
          </Link>
        )}

        {canManage && (
          <Link href="/admin/cardapio" className="card flex flex-col gap-2 hover:border-ocean">
            <h2 className="text-lg font-bold text-ocean">Cardápio Digital</h2>
            <p className="text-sm text-slate-700">
              Categorias, produtos, fotos próprias, adicionais obrigatórios/opcionais e preços.
            </p>
          </Link>
        )}

        {canManage && (
          <Link href="/admin/relatorios" className="card flex flex-col gap-2 hover:border-ocean">
            <h2 className="text-lg font-bold text-ocean">Relatórios e Exportação CSV</h2>
            <p className="text-sm text-slate-700">
              Consumo válido, recebimentos, cancelamentos, tempos médios e produtos mais pedidos.
            </p>
          </Link>
        )}

        {canManage && (
          <Link href="/admin/configuracoes" className="card flex flex-col gap-2 hover:border-ocean">
            <h2 className="text-lg font-bold text-ocean">Site Público e Galeria</h2>
            <p className="text-sm text-slate-700">
              Editar apresentação, horários, WhatsApp, endereço/mapa e galeria de fotos.
            </p>
          </Link>
        )}

        {profile.role === "admin" && (
          <Link href="/admin/equipe" className="card flex flex-col gap-2 hover:border-ocean">
            <h2 className="text-lg font-bold text-ocean">Equipe e Permissões</h2>
            <p className="text-sm text-slate-700">
              Cadastrar/vincular funcionários e definir funções (Atendente, Cozinha, Bar, Gerente, Admin).
            </p>
          </Link>
        )}
      </div>
    </main>
  );
}
