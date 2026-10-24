import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireStaff } from "@/lib/auth";
import { PrintButton } from "./PrintButton";

export default async function QrPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireStaff(["admin", "manager", "attendant"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: t } = await supabase.from("dining_tables").select("display_name, public_token").eq("id", id).maybeSingle();
  if (!t) notFound();
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const url = `${base}/m/${t.public_token}`;
  const dataUrl = await QRCode.toDataURL(url, { width: 600, margin: 2, errorCorrectionLevel: "M" });
  return (
    <main className="flex flex-col items-center gap-4 text-center">
      <h1 className="text-2xl font-bold">{t.display_name}</h1>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dataUrl} alt={`QR Code da ${t.display_name}`} width={300} height={300} />
      <p className="text-sm text-slate-600">Escaneie para ver o cardápio</p>
      <div className="flex gap-2 print:hidden">
        <a href={dataUrl} download={`qr-${t.display_name.replace(/\s+/g, "-").toLowerCase()}.png`} className="inline-flex h-11 items-center rounded-lg border px-4">Baixar PNG</a>
        <PrintButton />
      </div>
      <p className="break-all text-xs text-slate-500 print:hidden">{url}</p>
    </main>
  );
}
