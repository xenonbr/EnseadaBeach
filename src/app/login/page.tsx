import type { Metadata } from "next";
import { login } from "./actions";

export const metadata: Metadata = {
  title: "Entrar | Painel",
  robots: { index: false, follow: false },
};

const MSG: Record<string, string> = {
  credenciais: "E-mail ou senha incorretos.",
  "sem-acesso": "Sua conta não tem acesso ao painel. Fale com o administrador.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold text-[#0047FF]">Entrar no painel</h1>
      {erro && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-800">
          {MSG[erro] ?? "Não foi possível entrar."}
        </p>
      )}
      <form action={login} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 font-medium">
          E-mail
          <input name="email" type="email" required autoComplete="username" className="h-12 rounded-lg border border-slate-400 px-3 text-base" />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          Senha
          <input name="password" type="password" required autoComplete="current-password" className="h-12 rounded-lg border border-slate-400 px-3 text-base" />
        </label>
        <button className="h-12 rounded-lg bg-[#0047FF] text-lg font-semibold text-white">Entrar</button>
      </form>
    </main>
  );
}
