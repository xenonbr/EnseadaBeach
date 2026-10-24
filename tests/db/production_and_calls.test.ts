import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "supabase/migrations");
const STUB = `
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
create role anon; create role authenticated;
grant usage on schema public, auth to anon, authenticated;`;

const ADMIN = "00000000-0000-0000-0000-000000000001";
const ATT = "00000000-0000-0000-0000-000000000002";
const KIT = "00000000-0000-0000-0000-000000000003";
const BAR = "00000000-0000-0000-0000-000000000004";

let db: PGlite;
let tableToken: string;
let prodKitchenId: string;
let prodBarId: string;
let mixedOrderId: string;
let kitchenTaskId: string;
let barTaskId: string;

async function as(uid: string | null, role: "authenticated" | "anon", sql: string) {
  await db.exec(`select set_config('app.uid','${uid ?? ""}', false); set role ${role};`);
  try {
    return await db.query<any>(sql);
  } finally {
    await db.exec("reset role;");
  }
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec("create extension pgcrypto;");
  await db.exec(STUB);
  for (const f of readdirSync(dir).sort().filter((x) => !x.includes("storage"))) {
    await db.exec(readFileSync(join(dir, f), "utf8"));
  }
  await db.exec(`
    insert into auth.users values ('${ADMIN}'),('${ATT}'),('${KIT}'),('${BAR}');
    insert into public.profiles(id,full_name,role) values
      ('${ADMIN}','Admin','admin'),
      ('${ATT}','Atendente','attendant'),
      ('${KIT}','Cozinheiro','kitchen'),
      ('${BAR}','Bartender','bar');
  `);

  const t = await db.query<any>("select id, public_token from dining_tables where display_name='Mesa 01'");
  const tableId = t.rows[0].id;
  tableToken = t.rows[0].public_token;

  await as(ADMIN, "authenticated", `select set_table_active('${tableId}', true)`);
  await as(ATT, "authenticated", `select open_session('${tableId}')`);

  const c = await as(ADMIN, "authenticated", "insert into menu_categories(name,status) values ('Geral','published') returning id");
  const catId = c.rows[0].id;

  prodKitchenId = (
    await as(
      ADMIN,
      "authenticated",
      `insert into products(category_id,name,price_cents,status,available,sector) values ('${catId}','Isca de Peixe',6500,'published',true,'kitchen') returning id`,
    )
  ).rows[0].id;

  prodBarId = (
    await as(
      ADMIN,
      "authenticated",
      `insert into products(category_id,name,price_cents,status,available,sector) values ('${catId}','Água de Coco',1200,'published',true,'bar') returning id`,
    )
  ).rows[0].id;

  const items = JSON.stringify([
    { product_id: prodKitchenId, quantity: 1, option_ids: [] },
    { product_id: prodBarId, quantity: 2, option_ids: [] },
  ]);
  const ord = await as(null, "anon", `select place_order('${tableToken}','client-token-123456','idem-mix-1','Lucas',null,'${items}'::jsonb) as res`);
  mixedOrderId = ord.rows[0].res.order_id;
  await as(ATT, "authenticated", `select confirm_order_presencial('${mixedOrderId}')`);

  const tasks = await db.query<any>(`select id, sector::text as sector from production_tasks where order_id='${mixedOrderId}'`);
  kitchenTaskId = tasks.rows.find((x: any) => x.sector === "kitchen").id;
  barTaskId = tasks.rows.find((x: any) => x.sector === "bar").id;
});

describe("Fase 6: Cozinha, Bar, Preparo Parcial/Integral, Entrega e Chamadas", () => {
  it("bloqueia atuação cruzada entre setores (cozinha não mexe no bar e vice-versa)", async () => {
    await expect(as(KIT, "authenticated", `select start_production_task('${barTaskId}')`)).rejects.toThrow(/SEM_PERMISSAO_SETOR/);
    await expect(as(BAR, "authenticated", `select start_production_task('${kitchenTaskId}')`)).rejects.toThrow(/SEM_PERMISSAO_SETOR/);
  });

  it("evolui CONFIRMADO -> EM_PREPARACAO -> PARCIALMENTE_PRONTO -> PRONTO -> ENTREGUE", async () => {
    const s1 = await as(KIT, "authenticated", `select start_production_task('${kitchenTaskId}') as st`);
    expect(s1.rows[0].st).toBe("EM_PREPARACAO");

    const s2 = await as(KIT, "authenticated", `select complete_production_task('${kitchenTaskId}') as st`);
    expect(s2.rows[0].st).toBe("PARCIALMENTE_PRONTO");

    // Não permite entregar antes de estar integralmente PRONTO
    await expect(as(ATT, "authenticated", `select mark_order_delivered('${mixedOrderId}')`)).rejects.toThrow(/PEDIDO_AINDA_NAO_PRONTO/);

    // Bar conclui sua parte -> pedido passa a PRONTO
    const s3 = await as(BAR, "authenticated", `select complete_production_task('${barTaskId}') as st`);
    expect(s3.rows[0].st).toBe("PRONTO");

    // Atendente registra entrega na mesa -> ENTREGUE
    await as(ATT, "authenticated", `select mark_order_delivered('${mixedOrderId}')`);
    const ord = await db.query<any>(`select status, delivered_by from orders where id='${mixedOrderId}'`);
    expect(ord.rows[0]).toEqual({ status: "ENTREGUE", delivered_by: ATT });
  });

  it("permite que setor marque indisponibilidade apenas de produtos do próprio setor", async () => {
    await expect(as(KIT, "authenticated", `select set_product_availability_sector('${prodBarId}', false)`)).rejects.toThrow(/SEM_PERMISSAO_SETOR/);
    await as(BAR, "authenticated", `select set_product_availability_sector('${prodBarId}', false)`);
    const p = await db.query<any>(`select available from products where id='${prodBarId}'`);
    expect(p.rows[0].available).toBe(false);
    await as(BAR, "authenticated", `select set_product_availability_sector('${prodBarId}', true)`);
  });

  it("gerencia chamadas de atendente com deduplicação, rate limit e resolução", async () => {
    const c1 = await as(null, "anon", `select create_service_call('${tableToken}','client-call-9999','AJUDA','Preciso de cardápio físico') as res`);
    expect(c1.rows[0].res.status).toBe("PENDENTE");
    expect(c1.rows[0].res.already_open).toBe(false);
    const callId = c1.rows[0].res.call_id;

    // Chamada repetida do mesmo motivo na mesma sessão retorna o chamado já aberto
    const c2 = await as(null, "anon", `select create_service_call('${tableToken}','client-call-9999','AJUDA',null) as res`);
    expect(c2.rows[0].res.call_id).toBe(callId);
    expect(c2.rows[0].res.already_open).toBe(true);

    // Chamada de outro motivo em menos de 45s pelo mesmo dispositivo sofre rate limit
    await expect(
      as(null, "anon", `select create_service_call('${tableToken}','client-call-9999','PEDIR_CONTA',null)`),
    ).rejects.toThrow(/AGUARDE_PARA_NOVA_CHAMADA/);

    // Cozinha não atende chamado; Atendente assume e conclui
    await expect(as(KIT, "authenticated", `select update_service_call_status('${callId}','EM_ATENDIMENTO')`)).rejects.toThrow(/SEM_PERMISSAO/);
    await as(ATT, "authenticated", `select update_service_call_status('${callId}','EM_ATENDIMENTO')`);
    await as(ATT, "authenticated", `select update_service_call_status('${callId}','ATENDIDA','Atendido na mesa')`);

    const row = await db.query<any>(`select status, handled_by, resolved_by from service_calls where id='${callId}'`);
    expect(row.rows[0]).toEqual({ status: "ATENDIDA", handled_by: ATT, resolved_by: ATT });
  });
});
