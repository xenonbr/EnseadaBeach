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

let db: PGlite;
let tableId: string;
let catId: string;
let prodId: string;

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
    insert into auth.users values ('${ADMIN}'),('${ATT}');
    insert into public.profiles(id,full_name,role) values
      ('${ADMIN}','Admin','admin'),
      ('${ATT}','Atendente','attendant');
    grant all on all tables in schema public to authenticated;
  `);

  const t = await db.query<any>("select id from dining_tables where display_name='Mesa 01'");
  tableId = t.rows[0].id;
  await db.exec(`update dining_tables set active = true where id='${tableId}';`);

  const c = await db.query<any>(
    "insert into menu_categories(name,status) values ('Entradas','published') returning id",
  );
  catId = c.rows[0].id;

  const p = await db.query<any>(
    `insert into products(category_id,name,price_cents,sector,status) values ('${catId}','Pastel de Siri',3500,'kitchen','published') returning id`,
  );
  prodId = p.rows[0].id;
});

describe("history purge and cancelled order deletion", () => {
  it("atendente não tem permissão para expurgar histórico ou excluir pedidos", async () => {
    await expect(
      as(ATT, "authenticated", "select * from public.purge_closed_history(current_date)"),
    ).rejects.toThrow(/SEM_PERMISSAO/);

    await expect(
      as(
        ATT,
        "authenticated",
        "select public.delete_cancelled_order('00000000-0000-0000-0000-000000000000')",
      ),
    ).rejects.toThrow(/SEM_PERMISSAO/);
  });

  it("sessões abertas NUNCA são expurgadas", async () => {
    const s = await as(
      ADMIN,
      "authenticated",
      `select public.open_session('${tableId}') as id`,
    );
    const openSessionId = s.rows[0].id;

    // Tenta expurgar com data no futuro
    const res = await as(
      ADMIN,
      "authenticated",
      "select * from public.purge_closed_history(current_date + interval '1 day')",
    );
    expect(res.rows[0].purged_sessions_count).toBe(0);

    const check = await db.query<any>(
      `select count(*)::int c from table_sessions where id='${openSessionId}' and status='open'`,
    );
    expect(check.rows[0].c).toBe(1);

    // Fecha a sessão com data no passado para o teste seguinte
    await as(
      ADMIN,
      "authenticated",
      `select public.close_session('${openSessionId}')`,
    );
    await db.exec(
      `update table_sessions set closed_at = now() - interval '5 days' where id='${openSessionId}'`,
    );
  });

  it("sessão fechada antiga é expurgada com sucesso e auditada", async () => {
    const s = await db.query<any>(
      `select id from table_sessions where status='closed' limit 1`,
    );
    const closedSessionId = s.rows[0].id;

    // Cria pedido e itens como superuser para preparar o cenário
    const ord = await db.query<any>(
      `insert into orders(session_id,table_id,order_number,status,client_token_hash,idempotency_key,subtotal_cents,total_cents,confirmed_by,confirmed_at)
       values ('${closedSessionId}','${tableId}',1,'CONFIRMADO','hash1','idempotency-key-0001',3500,3500,'${ADMIN}',now()) returning id`,
    );
    const ordId = ord.rows[0].id;

    await db.exec(
      `insert into order_items(order_id,product_id,product_name_snapshot,unit_price_cents_snapshot,quantity,line_total_cents,sector_snapshot)
       values ('${ordId}','${prodId}','Pastel de Siri',3500,1,3500,'kitchen')`,
    );
    await db.exec(
      `insert into session_payments(session_id,amount_cents,method,idempotency_key,recorded_by)
       values ('${closedSessionId}',3500,'DINHEIRO','pay-idemp1','${ADMIN}')`,
    );

    // Executa purge_closed_history autenticado como ADMIN
    const purgeRes = await as(
      ADMIN,
      "authenticated",
      "select * from public.purge_closed_history(current_date + interval '1 day')",
    );
    expect(purgeRes.rows[0].purged_sessions_count).toBeGreaterThanOrEqual(1);
    expect(purgeRes.rows[0].purged_orders_count).toBeGreaterThanOrEqual(1);

    const checkSession = await db.query<any>(
      `select count(*)::int c from table_sessions where id='${closedSessionId}'`,
    );
    expect(checkSession.rows[0].c).toBe(0);

    const checkOrder = await db.query<any>(
      `select count(*)::int c from orders where id='${ordId}'`,
    );
    expect(checkOrder.rows[0].c).toBe(0);

    const audit = await db.query<any>(
      "select * from audit_log where action='history.purge' order by at desc limit 1",
    );
    expect(audit.rows.length).toBe(1);
    expect(audit.rows[0].actor_id).toBe(ADMIN);
  });

  it("delete_cancelled_order recusa pedidos que não estejam cancelados", async () => {
    // Nova sessão
    const s = await as(
      ADMIN,
      "authenticated",
      `select public.open_session('${tableId}') as id`,
    );
    const sessId = s.rows[0].id;

    const ord = await db.query<any>(
      `insert into orders(session_id,table_id,order_number,status,client_token_hash,idempotency_key,subtotal_cents,total_cents,confirmed_by,confirmed_at)
       values ('${sessId}','${tableId}',1,'CONFIRMADO','hash2','idempotency-key-0002',3500,3500,'${ADMIN}',now()) returning id`,
    );
    const ordId = ord.rows[0].id;

    await expect(
      as(ADMIN, "authenticated", `select public.delete_cancelled_order('${ordId}')`),
    ).rejects.toThrow(/APENAS_PEDIDOS_CANCELADOS_PODEM_SER_EXCLUIDOS/);

    // Cancela o pedido com motivo
    await db.exec(
      `update orders set status='CANCELADO', cancelled_by='${ADMIN}', cancelled_at=now(), cancel_reason='Cliente desistiu' where id='${ordId}'`,
    );

    // Agora sim o ADMIN pode excluir o pedido cancelado
    const delRes = await as(
      ADMIN,
      "authenticated",
      `select public.delete_cancelled_order('${ordId}')`,
    );
    expect(delRes.rows[0].delete_cancelled_order).toBe(true);

    const check = await db.query<any>(`select count(*)::int c from orders where id='${ordId}'`);
    expect(check.rows[0].c).toBe(0);

    const audit = await db.query<any>(
      `select * from audit_log where action='order.delete_cancelled' and entity_id='${ordId}'`,
    );
    expect(audit.rows.length).toBe(1);
  });
});
