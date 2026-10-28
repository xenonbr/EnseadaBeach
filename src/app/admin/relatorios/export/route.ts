import { NextResponse, type NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { supabase } = await requireStaff(["admin", "manager"]);
  const sp = request.nextUrl.searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const de = sp.get("de") && /^\d{4}-\d{2}-\d{2}$/.test(sp.get("de")!) ? sp.get("de")! : today;
  const ate = sp.get("ate") && /^\d{4}-\d{2}-\d{2}$/.test(sp.get("ate")!) ? sp.get("ate")! : today;

  const [{ data }, { data: profilesData }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "order_number, status, total_cents, created_at, claimed_by, confirmed_at, confirmed_by, delivered_at, delivered_by, dining_tables(display_name)",
      )
      .gte("created_at", `${de}T00:00:00.000Z`)
      .lte("created_at", `${ate}T23:59:59.999Z`)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("profiles").select("id, full_name"),
  ]);

  const staffMap = new Map<string, string>();
  for (const p of (profilesData ?? []) as { id: string; full_name: string }[]) {
    staffMap.set(p.id, p.full_name);
  }
  const cleanCsv = (v: string | null | undefined) => (v ?? "").replace(/,/g, " ");

  const lines = [
    "mesa,pedido,status,total_centavos,criado_em,confirmado_em,entregue_em,verificado_por,confirmado_por,entregue_por",
  ];
  for (const r of (data ?? []) as unknown as {
    order_number: number;
    status: string;
    total_cents: number;
    created_at: string;
    claimed_by: string | null;
    confirmed_at: string | null;
    confirmed_by: string | null;
    delivered_at: string | null;
    delivered_by: string | null;
    dining_tables: { display_name: string } | null;
  }[]) {
    const mesa = cleanCsv(r.dining_tables?.display_name ?? "Mesa");
    const verifPor = r.claimed_by ? cleanCsv(staffMap.get(r.claimed_by) ?? r.claimed_by) : "";
    const confPor = r.confirmed_by ? cleanCsv(staffMap.get(r.confirmed_by) ?? r.confirmed_by) : "";
    const entrPor = r.delivered_by ? cleanCsv(staffMap.get(r.delivered_by) ?? r.delivered_by) : "";
    lines.push(
      `${mesa},${r.order_number},${r.status},${r.total_cents},${r.created_at},${r.confirmed_at ?? ""},${r.delivered_at ?? ""},${verifPor},${confPor},${entrPor}`,
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
