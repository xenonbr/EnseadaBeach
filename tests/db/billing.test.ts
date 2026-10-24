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

let db: PGlite;
let tableToken: string;
let sessionId: string;
let prodId: string;
let order1Id: string;
let order2Id: string;

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
    insert into auth.users values ('${ADMIN}'),('${ATT}'),('${KIT}');
    insert into public.profiles(id,full_name,role) values
      ('${ADMIN}','Admin','admin'),
      ('${ATT}','Atendente','attendant'),
      ('${KIT}','Cozinha','kitchen');
  `);

  const t = await db.query<any>("select id, public_token from dining_tables where display_name='Mesa 01'");
  const tableId = t.rows[0].id;
  tableToken = t.rows[0].public_token;

  await as(ADMIN, "authenticated", `select set_table_active('${tableId}', true)`);
  sessionId = (await as(ATT, "authenticated", `select open_session('${tableId}') as id`)).rows[0].id;

  const catId = (await as(ADMIN, "authenticated", "insert into menu_categories(name,status) values ('Pratos','published') returning id")).rows[0].id;
  prodId = (
    await as(
      ADMIN,
      "authenticated",
      `insert into products(category_id,name,price_cents,status,available,sector) values ('${catId}','Camarão na Moranga',15000,'published',true,'kitchen') returning id`,
    )
  ).rows[0].id;

  const items1 = JSON.stringify([{ product_id: prodId, quantity: 1, option_ids: [] }]);
  const items2 = JSON.stringify([{ product_id: prodId, quantity: 1, option_ids: [] }]);
  order1Id = (await as(null, "anon", `select place_order('${tableToken}','client-bill-1111','idem-bill-1','Ana',null,'${items1}'::jsonb) as res`)).rows[0].res.order_id;
  order2Id = (await as(null, "anon", `select place_order('${tableToken}','client-bill-2222','idem-bill-2','Beto',null,'${items2}'::jsonb) as res`)).rows[0].res.order_id;
});

describe("Fase 7: Consumo, Conta, Recebimentos Manuais, Estornos e Fechamento de Sessão", () => {
  it("separa pedidos não confirmados e cancelados do consumo válido", async () => {
    // Inicialmente ambos os pedidos estão AGUARDANDO_CONFIRMACAO (15000 cada = 30000 não confirmado, 0 consumo válido)
    let sum = (await as(ATT, "authenticated", `select * from get_session_account_summary('${sessionId}')`)).rows[0];
    expect(sum).toMatchObject({
      consumed_cents: 0,
      unconfirmed_cents: 30000,
      cancelled_cents: 0,
      paid_cents: 0,
      balance_due_cents: 0,
    });

    // Confirma pedido 1 e cancela pedido 2
    await as(ATT, "authenticated", `select confirm_order_presencial('${order1Id}')`);
    await as(ATT, "authenticated", `select cancel_order('${order2Id}', 'Cliente cancelou antes do preparo')`);

    sum = (await as(ATT, "authenticated", `select * from get_session_account_summary('${sessionId}')`)).rows[0];
    expect(sum).toMatchObject({
      consumed_cents: 15000,
      unconfirmed_cents: 0,
      cancelled_cents: 15000,
      paid_cents: 0,
      balance_due_cents: 15000,
    });
  });

  it("pedido ENTREGUE não significa pago e impede encerrar a sessão com saldo devedor", async () => {
    const taskId = (await db.query<any>(`select id from production_tasks where order_id='${order1Id}'`)).rows[0].id;
    await as(KIT, "authenticated", `select complete_production_task('${taskId}')`);
    await as(ATT, "authenticated", `select mark_order_delivered('${order1Id}')`);

    const sum = (await as(ATT, "authenticated", `select * from get_session_account_summary('${sessionId}')`)).rows[0];
    expect(sum.has_unsettled_orders).toBe(false);
    expect(sum.paid_cents).toBe(0);
    expect(sum.balance_due_cents).toBe(15000);

    // Tentar fechar sessão com saldo pendente deve falhar
    await expect(as(ATT, "authenticated", `select close_session('${sessionId}')`)).rejects.toThrow(/PENDENCIAS_ABERTAS/);
  });

  it("registra recebimento parcial com idempotência e bloqueia pagamento acima do saldo", async () => {
    const p1 = (
      await as(
        ATT,
        "authenticated",
        `select record_session_payment('${sessionId}', 5000, 'DINHEIRO', 'pay-idem-1', 'Nota de 50', 'Ana', '${order1Id}') as id`,
      )
    ).rows[0].id;

    // Repetição com mesma chave de idempotência retorna o mesmo ID e não duplica valor
    const p1Replay = (
      await as(
        ATT,
        "authenticated",
        `select record_session_payment('${sessionId}', 5000, 'DINHEIRO', 'pay-idem-1', 'Nota de 50', 'Ana', '${order1Id}') as id`,
      )
    ).rows[0].id;
    expect(p1Replay).toBe(p1);

    const sum = (await as(ATT, "authenticated", `select * from get_session_account_summary('${sessionId}')`)).rows[0];
    expect(sum.paid_cents).toBe(5000);
    expect(sum.balance_due_cents).toBe(10000);

    // Tentar receber 12000 quando faltam 10000 é bloqueado
    await expect(
      as(ATT, "authenticated", `select record_session_payment('${sessionId}', 12000, 'PIX_PRESENCIAL', 'pay-idem-over')`),
    ).rejects.toThrow(/VALOR_ACIMA_DO_SALDO_PENDENTE/);
  });

  it("restringe ajustes e estornos a admin/gerente e permite fechar sessão somente após quitação total", async () => {
    // Atendente não pode lançar desconto/ajuste
    await expect(as(ATT, "authenticated", `select record_session_adjustment('${sessionId}', -1000, 'Desconto')`)).rejects.toThrow(/SEM_PERMISSAO/);

    // Admin concede desconto de R$ 10,00 (-1000 centavos) -> saldo cai de 10000 para 9000
    await as(ADMIN, "authenticated", `select record_session_adjustment('${sessionId}', -1000, 'Cortesia da casa')`);
    let sum = (await as(ATT, "authenticated", `select * from get_session_account_summary('${sessionId}')`)).rows[0];
    expect(sum.net_payable_cents).toBe(14000);
    expect(sum.balance_due_cents).toBe(9000);

    // Atendente registra pagamento restante de 9000
    const p2 = (
      await as(ATT, "authenticated", `select record_session_payment('${sessionId}', 9000, 'CARTAO_CREDITO', 'pay-idem-2', 'NSU 1234') as id`)
    ).rows[0].id;

    // Atendente não pode estornar pagamento; Admin estorna com motivo
    await expect(as(ATT, "authenticated", `select reverse_session_payment('${p2}', 'Erro')`)).rejects.toThrow(/SEM_PERMISSAO/);
    await as(ADMIN, "authenticated", `select reverse_session_payment('${p2}', 'Lançado no cartão errado')`);

    sum = (await as(ATT, "authenticated", `select * from get_session_account_summary('${sessionId}')`)).rows[0];
    expect(sum.balance_due_cents).toBe(9000);

    // Registra novamente o recebimento correto de 9000
    await as(ATT, "authenticated", `select record_session_payment('${sessionId}', 9000, 'CARTAO_DEBITO', 'pay-idem-3', 'NSU 5678')`);

    sum = (await as(ATT, "authenticated", `select * from get_session_account_summary('${sessionId}')`)).rows[0];
    expect(sum.balance_due_cents).toBe(0);

    // Agora que pedidos estão entregues e saldo é zero, permite encerrar a sessão!
    await as(ATT, "authenticated", `select close_session('${sessionId}', 'Conta quitada e conferida')`);
    const sess = (await db.query<any>(`select status from table_sessions where id='${sessionId}'`)).rows[0];
    expect(sess.status).toBe("closed");
  });
});
