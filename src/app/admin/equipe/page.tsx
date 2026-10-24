import { requireStaff } from "@/lib/auth";
import { linkStaffByEmailAction, updateStaffProfileAction } from "./actions";

type ProfileRow = {
  id: string;
  full_name: string;
  role: string;
  active: boolean;
  created_at: string;
};

export default async function EquipePage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const { supabase } = await requireStaff(["admin"]);
  const { msg } = await searchParams;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, active, created_at")
    .order("created_at", { ascending: true });

  const profiles = (data ?? []) as ProfileRow[];

  return (
    <main className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Equipe, Funções e Permissões</h1>
        <p className="text-slate-700">
          Gerencie os funcionários e suas permissões operacionais validadas no servidor e no banco.
        </p>
      </header>

      {msg && (
        <p role="status" className="rounded-xl border border-sky-400 bg-sky-50 p-3 text-sky-950">
          {msg}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-red-400 bg-red-50 p-3 text-red-900">
          Não foi possível carregar os perfis da equipe.
        </p>
      )}

      <section className="card flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ocean">Vincular ou atualizar funcionário por e-mail</h2>
        <p className="text-xs text-slate-700">
          Passo 1: Crie o usuário com e-mail e senha forte em <strong>Authentication &gt; Users</strong> no painel do Supabase. Passo 2: Informe o mesmo e-mail abaixo para liberar o papel no sistema.
        </p>
        <form action={linkStaffByEmailAction} className="grid gap-3 sm:grid-cols-4">
          <input
            name="email"
            type="email"
            required
            placeholder="E-mail cadastrado no Auth"
            aria-label="E-mail do funcionário"
            className="input"
          />
          <input
            name="full_name"
            required
            placeholder="Nome completo"
            aria-label="Nome completo"
            className="input"
          />
          <select name="role" defaultValue="attendant" aria-label="Função" className="input">
            <option value="attendant">Atendente (Mesas, Pedidos, Contas)</option>
            <option value="kitchen">Cozinha (Painel Cozinha)</option>
            <option value="bar">Bar (Painel Bar)</option>
            <option value="manager">Gerente (Cardápio, Relatórios, Estornos)</option>
            <option value="admin">Administrador (Acesso total)</option>
          </select>
          <button className="btn btn-primary">Vincular funcionário</button>
        </form>
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ocean">
          Funcionários cadastrados ({profiles.length})
        </h2>
        <ul className="flex flex-col gap-3">
          {profiles.map((p) => (
            <li key={p.id} className="rounded-xl border p-3">
              <form
                action={updateStaffProfileAction}
                className="flex flex-wrap items-center gap-2"
              >
                <input type="hidden" name="id" value={p.id} />
                <input
                  name="full_name"
                  defaultValue={p.full_name}
                  required
                  aria-label="Nome"
                  className="input min-w-0 flex-1 font-semibold"
                />
                <select name="role" defaultValue={p.role} aria-label="Função" className="input">
                  <option value="admin">Administrador</option>
                  <option value="manager">Gerente</option>
                  <option value="attendant">Atendente</option>
                  <option value="kitchen">Cozinha</option>
                  <option value="bar">Bar</option>
                </select>
                <select
                  name="active"
                  defaultValue={String(p.active)}
                  aria-label="Status de acesso"
                  className="input"
                >
                  <option value="true">Ativo</option>
                  <option value="false">Acesso revogado</option>
                </select>
                <button className="btn">Salvar</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
