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
const ATT1 = "00000000-0000-0000-0000-000000000002";
const ATT2 = "00000000-0000-0000-0000-000000000003";
const KIT = "00000000-0000-0000-0000-000000000004";

let db: PGlite;
let tableId: string;
let tableToken: string;
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
    insert into auth.users values ('${ADMIN}'),('${ATT1}'),('${ATT2}'),('${KIT}');
    insert into public.profiles(id,full_name,role) values
      ('${ADMIN}','Rodrigo Admin','admin'),
      ('${ATT1}','Carlos Garçom','attendant'),
      ('${ATT2}','Marina Garçonete','attendant'),
      ('${KIT}','Chef Bahia','kitchen');
    grant select on all tables in schema public to authenticated;
  `);

  const t = await db.query<any>(
    "select id, public_token from dining_tables where display_name='Mesa 01'",
  );
  tableId = t.rows[0].id;
  tableToken = t.rows[0].public_token;
  await db.exec(`update dining_tables set active = true where id='${tableId}';`);

  const c = await db.query<any>(
    "insert into menu_categories(name,status) values ('Pratos','published') returning id",
  );
  catId = c.rows[0].id;

  const p = await db.query<any>(
    `insert into products(category_id,name,price_cents,sector,status) values ('${catId}','Moqueca Baiana',12000,'kitchen','published') returning id`,
  );
  prodId = p.rows[0].id;
});

describe("rastreabilidade de funcionários e avaliação de atendimento pós-encerramento", () => {
  const clientToken = "cliente-device-token-123456";
  let sessionId: string;
  let orderId: string;

  it("permite que qualquer funcionário autenticado leia os nomes da equipe em profiles", async () => {
    const res = await as(
      ATT1,
      "authenticated",
      "select id, full_name, role from public.profiles order by full_name",
    );
    expect(res.rows.length).toBe(4);
  });

  it("registra o funcionário responsável em cada etapa (abertura, chamado, pedido, cozinha, entrega e fechamento)", async () => {
    // 1. ATT1 abre a sessão da mesa
    const s = await as(ATT1, "authenticated", `select public.open_session('${tableId}') as id`);
    sessionId = s.rows[0].id;

    // 2. Cliente faz chamado e ATT2 assume e conclui a ida à mesa
    const callRes = await as(
      null,
      "anon",
      `select public.create_service_call('${tableToken}','${clientToken}','AJUDA','Trazer gelo') as res`,
    );
    const callId = callRes.rows[0].res.call_id;
    await as(
      ATT2,
      "authenticated",
      `select public.update_service_call_status('${callId}','EM_ATENDIMENTO',null)`,
    );
    await as(
      ATT2,
      "authenticated",
      `select public.update_service_call_status('${callId}','ATENDIDA','Gelo entregue')`,
    );

    const callRow = await db.query<any>(
      `select handled_by, resolved_by from service_calls where id='${callId}'`,
    );
    expect(callRow.rows[0].handled_by).toBe(ATT2);
    expect(callRow.rows[0].resolved_by).toBe(ATT2);

    // 3. Cliente faz pedido; ATT1 assume verificação e confirma; KIT prepara; ATT2 entrega
    const ordRes = await as(
      null,
      "anon",
      `select public.place_order('${tableToken}','${clientToken}','idemp-rating-001','Família Silva',null,'[{"product_id":"${prodId}","quantity":1,"option_ids":[]}]'::jsonb) as res`,
    );
    orderId = ordRes.rows[0].res.order_id;

    await as(ATT1, "authenticated", `select public.claim_order_verification('${orderId}', 1)`);
    await as(ATT1, "authenticated", `select public.confirm_order_presencial('${orderId}', 2)`);

    const taskRow = await db.query<any>(
      `select id from production_tasks where order_id='${orderId}'`,
    );
    const taskId = taskRow.rows[0].id;

    await as(KIT, "authenticated", `select public.start_production_task('${taskId}')`);
    await as(KIT, "authenticated", `select public.complete_production_task('${taskId}')`);

    const taskCheck = await db.query<any>(
      `select started_by, completed_by from production_tasks where id='${taskId}'`,
    );
    expect(taskCheck.rows[0].started_by).toBe(KIT);
    expect(taskCheck.rows[0].completed_by).toBe(KIT);

    const ordVer = await db.query<any>(`select version from orders where id='${orderId}'`);
    await as(
      ATT2,
      "authenticated",
      `select public.mark_order_delivered('${orderId}', ${ordVer.rows[0].version})`,
    );

    const ordCheck = await db.query<any>(
      `select claimed_by, confirmed_by, delivered_by from orders where id='${orderId}'`,
    );
    expect(ordCheck.rows[0].claimed_by).toBe(ATT1);
    expect(ordCheck.rows[0].confirmed_by).toBe(ATT1);
    expect(ordCheck.rows[0].delivered_by).toBe(ATT2);
  });

  it("impede avaliação enquanto a mesa ainda está aberta", async () => {
    await expect(
      as(
        null,
        "anon",
        `select public.submit_service_rating('${tableToken}','${clientToken}','${sessionId}','${ATT1}',5,'Ótimo','Silva')`,
      ),
    ).rejects.toThrow(/SESSAO_AINDA_ABERTA/);
  });

  it("após quitar e encerrar a mesa, lista os garçons que atenderam e permite ao cliente avaliá-los", async () => {
    // Registra pagamento e encerra a sessão
    await as(
      ATT1,
      "authenticated",
      `select public.record_session_payment('${sessionId}', 12000, 'PIX_PRESENCIAL', 'pay-rating-001', null, 'Silva', null)`,
    );
    await as(ATT1, "authenticated", `select public.close_session('${sessionId}', 'Conta encerrada')`);

    // Cliente consulta sessão encerrada disponível para avaliação
    const ratable = await as(
      null,
      "anon",
      `select public.get_ratable_closed_session('${tableToken}','${clientToken}') as res`,
    );
    const data = ratable.rows[0].res;
    expect(data).toBeTruthy();
    expect(data.session_id).toBe(sessionId);

    // Deve listar Carlos Garçom (ATT1) e Marina Garçonete (ATT2), mas não o cozinheiro (KIT)
    const staffNames = data.staff.map((s: any) => s.full_name);
    expect(staffNames).toContain("Carlos Garçom");
    expect(staffNames).toContain("Marina Garçonete");
    expect(staffNames).not.toContain("Chef Bahia");

    // Cliente avalia Carlos (5 estrelas) e Marina (5 estrelas)
    await as(
      null,
      "anon",
      `select public.submit_service_rating('${tableToken}','${clientToken}','${sessionId}','${ATT1}',5,'Carlos foi super atencioso!','Família Silva')`,
    );
    await as(
      null,
      "anon",
      `select public.submit_service_rating('${tableToken}','${clientToken}','${sessionId}','${ATT2}',4,'Entrega rápida na areia!','Família Silva')`,
    );

    // Verifica que as 2 avaliações foram salvas e podem ser lidas pela equipe
    const ratings = await as(
      ADMIN,
      "authenticated",
      `select staff_name_snapshot, stars, comment, customer_name from public.service_ratings where session_id='${sessionId}' order by stars desc`,
    );
    expect(ratings.rows.length).toBe(2);
    expect(ratings.rows[0]).toMatchObject({
      staff_name_snapshot: "Carlos Garçom",
      stars: 5,
      comment: "Carlos foi super atencioso!",
      customer_name: "Família Silva",
    });
    expect(ratings.rows[1]).toMatchObject({
      staff_name_snapshot: "Marina Garçonete",
      stars: 4,
      comment: "Entrega rápida na areia!",
      customer_name: "Família Silva",
    });
  });
});
