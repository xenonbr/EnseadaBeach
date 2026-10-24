import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { logout } from "../login/actions";

export const metadata: Metadata = { title: "Painel", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireStaff();
  const canManage = profile.role === "admin" || profile.role === "manager";
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex flex-wrap items-center gap-4 border-b bg-white p-4">
        <Link href="/admin" className="font-bold text-[#0047FF]">Painel Enseada</Link>
        {canManage && <Link href="/admin/mesas" className="underline">Mesas</Link>}
        <span className="ml-auto text-sm text-slate-700">{profile.full_name} ({profile.role})</span>
        <form action={logout}><button className="h-10 rounded-lg border px-4">Sair</button></form>
      </header>
      <div className="mx-auto max-w-5xl p-4">{children}</div>
    </div>
  );
}
