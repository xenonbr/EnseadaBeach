import { NextResponse, type NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { supabase } = await requireStaff(["admin", "manager"]);
  const sp = request.nextUrl.searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const de = sp.get("de") && /^\d{4}-\d{2}-\d{2}$/.test(sp.get("de")!) ? sp.get("de")! : today;
  const ate = sp.get("ate") && /^\d{4}-\d{2}-\d{2}$/.test(sp.get("ate")!) ? sp.get("ate")! : today;

  const { data } = await supabase
    .from("orders")
    .select("order_number, status, total_cents, created_at, confirmed_at, delivered_at, dining_tables(display_name)")
    .gte("created_at", `${de}T00:00:00.000Z`)
    .lte("created_at", `${ate}T23:59:59.999Z`)
    .order("created_at", { ascending: false })
    .limit(1000);

  const lines = ["mesa,pedido,status,total_centavos,criado_em,confirmado_em,entregue_em"];
  for (const r of (data ?? []) as unknown as {
    order_number: number;
    status: string;
    total_cents: number;
    created_at: string;
    confirmed_at: string | null;
    delivered_at: string | null;
    dining_tables: { display_name: string } | null;
  }[]) {
    const mesa = (r.dining_tables?.display_name ?? "Mesa").replace(/,/g, " ");
    lines.push(
      `${mesa},${r.order_number},${r.status},${r.total_cents},${r.created_at},${r.confirmed_at ?? ""},${r.delivered_at ?? ""}`,
    );
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="relatorio-pedidos-${de}-${ate}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
