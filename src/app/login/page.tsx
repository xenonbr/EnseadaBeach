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
      {/* eslint-disable-next-line @next/next/no-img-element */}<img src="/logo.jpg" alt="Cabana Enseada Beach" className="mx-auto h-24 w-auto" /><h1 className="text-2xl font-bold text-ocean">Entrar no painel</h1>
      {erro && (
        <p role="alert" className="rounded-xl border border-red-400 bg-red-50 p-3 text-red-900 text-red-800">
          {MSG[erro] ?? "Não foi possível entrar."}
        </p>
      )}
      <form action={login} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 font-medium">
          E-mail
          <input name="email" type="email" required autoComplete="username" className="input h-12" />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          Senha
          <input name="password" type="password" required autoComplete="current-password" className="input h-12" />
        </label>
        <button className="btn btn-primary h-12 text-lg">Entrar</button>
      </form>
    </main>
  );
}
