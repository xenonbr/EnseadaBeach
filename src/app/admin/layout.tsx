import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { logout } from "../login/actions";
import { NavLink } from "./NavLink";

export const metadata: Metadata = { title: "Painel", robots: { index: false, follow: false } };

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  manager: "Gerente",
  attendant: "Atendente",
  kitchen: "Cozinha",
  bar: "Bar",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireStaff();
  const canManage = profile.role === "admin" || profile.role === "manager";
  const canTables = canManage || profile.role === "attendant";
  const canKitchen = canTables || profile.role === "kitchen";
  const canBar = canTables || profile.role === "bar";
  return (
    <div className="min-h-screen md:grid md:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 z-10 flex flex-col gap-3 bg-ocean p-3 text-white md:h-screen md:gap-6 md:p-5">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="Cabana Enseada Beach Trancoso" className="h-12 w-auto rounded-lg md:h-auto md:w-full" />
          <form action={logout} className="ml-auto md:hidden">
            <button className="btn h-10">Sair</button>
          </form>
        </div>
        <nav aria-label="Principal" className="-mx-1 flex gap-1 overflow-x-auto px-1 md:flex-col">
          <NavLink href="/admin" exact>Início</NavLink>
          {canTables && <NavLink href="/admin/pedidos">Pedidos</NavLink>}
          {canKitchen && <NavLink href="/admin/cozinha">Cozinha</NavLink>}
          {canBar && <NavLink href="/admin/bar">Bar</NavLink>}
          {canTables && <NavLink href="/admin/mesas">Mesas</NavLink>}
          {canManage && <NavLink href="/admin/cardapio">Cardápio</NavLink>}
        </nav>
        <div className="mt-auto hidden flex-col gap-3 border-t border-white/25 pt-4 md:flex">
          <div>
            <p className="font-semibold">{profile.full_name}</p>
            <p className="text-sm text-white/85">{ROLE_LABEL[profile.role] ?? profile.role}</p>
          </div>
          <form action={logout}><button className="btn w-full">Sair</button></form>
        </div>
      </aside>
      <div className="min-w-0 p-4 md:p-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </div>
    </div>
  );
}
