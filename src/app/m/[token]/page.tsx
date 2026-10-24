import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mesa", robots: { index: false, follow: false } };

export default async function MesaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = /^[0-9a-f]{32}$/.test(token);
  const supabase = await createClient();
  const { data } = valid ? await supabase.rpc("resolve_table", { p_token: token }) : { data: null };
  const mesa = data?.[0] as { display_name: string; active: boolean; has_open_session: boolean } | undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6 text-center">
      {!mesa ? (
        <>
          <h1 className="text-2xl font-bold">QR Code não reconhecido</h1>
          <p>Peça ajuda a um atendente.</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-[#0047FF]">{mesa.display_name}</h1>
          <p>Estamos preparando nosso cardápio. Em breve, teremos novidades para você.</p>
          {mesa.active && mesa.has_open_session ? (
            <p className="rounded-lg border p-3">Sessão aberta. Os pedidos serão liberados quando o cardápio estiver disponível.</p>
          ) : (
            <p className="rounded-lg border p-3">Para fazer pedidos, peça a um atendente para abrir sua mesa.</p>
          )}
        </>
      )}
    </main>
  );
}
