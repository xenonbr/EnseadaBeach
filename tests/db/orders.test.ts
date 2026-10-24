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
const BAR = "00000000-0000-0000-0000-000000000005";

let db: PGlite;
let tableId: string;
let tableToken: string;
let sessionId: string;
let catId: string;
let prodKitchenId: string;
let prodBarId: string;
let optGroupReqId: string;
let opt1Id: string;
let opt2Id: string;

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
    insert into auth.users values ('${ADMIN}'),('${ATT1}'),('${ATT2}'),('${KIT}'),('${BAR}');
    insert into public.profiles(id,full_name,role) values
      ('${ADMIN}','Admin','admin'),
      ('${ATT1}','Atendente 1','attendant'),
      ('${ATT2}','Atendente 2','attendant'),
      ('${KIT}','Cozinha','kitchen'),
      ('${BAR}','Bar','bar');
  `);

  const t = await db.query<any>("select id, public_token from dining_tables where display_name='Mesa 01'");
  tableId = t.rows[0].id;
  tableToken = t.rows[0].public_token;

  await as(ADMIN, "authenticated", `select set_table_active('${tableId}', true)`);
  const s = await as(ATT1, "authenticated", `select open_session('${tableId}') as id`);
  sessionId = s.rows[0].id;

  const c = await as(ADMIN, "authenticated", "insert into menu_categories(name,status) values ('Pratos e Bebidas','published') returning id");
  catId = c.rows[0].id;

  const pk = await as(
    ADMIN,
    "authenticated",
    `insert into products(category_id,name,price_cents,status,available,sector) values ('${catId}','Moqueca',12000,'published',true,'kitchen') returning id`,
  );
  prodKitchenId = pk.rows[0].id;

  const pb = await as(
    ADMIN,
    "authenticated",
    `insert into products(category_id,name,price_cents,status,available,sector) values ('${catId}','Caipirinha',3500,'published',true,'bar') returning id`,
  );
  prodBarId = pb.rows[0].id;

  const g = await as(
    ADMIN,
    "authenticated",
    `insert into option_groups(product_id,name,min_select,max_select) values ('${prodKitchenId}','Acompanhamento',1,1) returning id`,
  );
  optGroupReqId = g.rows[0].id;

  const o1 = await as(ADMIN, "authenticated", `insert into options(group_id,name,price_cents) values ('${optGroupReqId}','Arroz',0) returning id`);
  opt1Id = o1.rows[0].id;
  const o2 = await as(ADMIN, "authenticated", `insert into options(group_id,name,price_cents) values ('${optGroupReqId}','Pirão Extra',1500) returning id`);
  opt2Id = o2.rows[0].id;
});

describe("Fase 5: pedidos, snapshots, idempotência e confirmação presencial", () => {
  const clientA = "client-token-aaaa-1111";
  const clientB = "client-token-bbbb-2222";
  let orderAId: string;

  it("rejeita pedido sem adicional obrigatório ou com quantidade inválida", async () => {
    await expect(
      as(
        null,
        "anon",
        `select place_order('${tableToken}','${clientA}','idem-err-1','João',null,'[{"product_id":"${prodKitchenId}","quantity":1,"option_ids":[]}]'::jsonb)`,
      ),
    ).rejects.toThrow(/LIMITE_ADICIONAIS_INVALIDO/);

    await expect(
      as(
        null,
        "anon",
        `select place_order('${tableToken}','${clientA}','idem-err-2','João',null,'[{"product_id":"${prodBarId}","quantity":0}]'::jsonb)`,
      ),
    ).rejects.toThrow(/QUANTIDADE_INVALIDA/);
  });

  it("ignora preço enviado pelo cliente, calcula no servidor e nasce AGUARDANDO_CONFIRMACAO sem tarefas de produção", async () => {
    const items = JSON.stringify([
      { product_id: prodKitchenId, quantity: 1, option_ids: [opt2Id], price_cents: 1, notes: "Sem coentro" },
      { product_id: prodBarId, quantity: 2, option_ids: [], price_cents: 0 },
    ]);
    const r = await as(null, "anon", `select place_order('${tableToken}','${clientA}','idem-ok-a1','João','Mesa perto do mar','${items}'::jsonb) as res`);
    const res = r.rows[0].res;
    orderAId = res.order_id;

    // 1x (12000 + 1500) + 2x 3500 = 13500 + 7000 = 20500
    expect(res.status).toBe("AGUARDANDO_CONFIRMACAO");
    expect(res.total_cents).toBe(20500);
    expect(res.order_number).toBe(1);
    expect(res.idempotent_replay).toBe(false);

    // Nenhuma tarefa de produção pode existir ainda!
    const tasks = await db.query<any>(`select count(*)::int c from production_tasks where order_id='${orderAId}'`);
    expect(tasks.rows[0].c).toBe(0);
  });

  it("garante idempotência em clique duplo/retry e bloqueia reuso da chave por outro cliente", async () => {
    const items = JSON.stringify([{ product_id: prodBarId, quantity: 1, option_ids: [] }]);
    const r = await as(null, "anon", `select place_order('${tableToken}','${clientA}','idem-ok-a1','João',null,'${items}'::jsonb) as res`);
    expect(r.rows[0].res.order_id).toBe(orderAId);
    expect(r.rows[0].res.idempotent_replay).toBe(true);
    expect(r.rows[0].res.total_cents).toBe(20500);

    await expect(
      as(null, "anon", `select place_order('${tableToken}','${clientB}','idem-ok-a1','Maria',null,'${items}'::jsonb)`),
    ).rejects.toThrow(/IDEMPOTENCY_CONFLITO/);
  });

  it("isola pedidos entre múltiplos clientes na mesma mesa e bloqueia leitura direta da tabela orders por anon", async () => {
    const itemsB = JSON.stringify([{ product_id: prodBarId, quantity: 1, option_ids: [] }]);
    const rb = await as(null, "anon", `select place_order('${tableToken}','${clientB}','idem-ok-b1','Maria',null,'${itemsB}'::jsonb) as res`);
    expect(rb.rows[0].res.order_number).toBe(2);
    expect(rb.rows[0].res.total_cents).toBe(3500);

    const myA = await as(null, "anon", `select get_my_orders('${tableToken}','${clientA}') as list`);
    const myB = await as(null, "anon", `select get_my_orders('${tableToken}','${clientB}') as list`);
    expect(myA.rows[0].list).toHaveLength(1);
    expect(myA.rows[0].list[0].customer_name).toBe("João");
    expect(myB.rows[0].list).toHaveLength(1);
    expect(myB.rows[0].list[0].customer_name).toBe("Maria");

    await expect(as(null, "anon", "select * from orders")).rejects.toThrow();
  });

  it("preserva snapshot histórico quando preço ou nome do produto muda depois", async () => {
    await as(ADMIN, "authenticated", `update products set name='Moqueca Reajustada', price_cents=19900 where id='${prodKitchenId}'`);
    const myA = await as(null, "anon", `select get_my_orders('${tableToken}','${clientA}') as list`);
    const item = myA.rows[0].list[0].items.find((i: any) => i.unit_price_cents === 12000);
    expect(item.product_name).toBe("Moqueca");
    expect(myA.rows[0].list[0].total_cents).toBe(20500);
  });

  it("bloqueia pedido de produto indisponível", async () => {
    await as(ADMIN, "authenticated", `update products set available=false where id='${prodBarId}'`);
    const items = JSON.stringify([{ product_id: prodBarId, quantity: 1, option_ids: [] }]);
    await expect(
      as(null, "anon", `select place_order('${tableToken}','${clientA}','idem-unavail','João',null,'${items}'::jsonb)`),
    ).rejects.toThrow(/PRODUTO_INDISPONIVEL/);
    await as(ADMIN, "authenticated", `update products set available=true where id='${prodBarId}'`);
  });

  it("impede encerrar sessão enquanto houver pedidos pendentes", async () => {
    await expect(as(ATT1, "authenticated", `select close_session('${sessionId}')`)).rejects.toThrow(/PENDENCIAS_ABERTAS/);
  });

  it("controla disputa de verificação (claim) e impede que cliente/cozinha/bar confirmem pedido", async () => {
    await expect(as(null, "anon", `select confirm_order_presencial('${orderAId}')`)).rejects.toThrow();
    await expect(as(KIT, "authenticated", `select confirm_order_presencial('${orderAId}')`)).rejects.toThrow(/SEM_PERMISSAO/);
    await expect(as(BAR, "authenticated", `select claim_order_verification('${orderAId}')`)).rejects.toThrow(/SEM_PERMISSAO/);

    // Atendente 1 assume verificação
    const v = await as(ATT1, "authenticated", `select claim_order_verification('${orderAId}', 1) as v`);
    expect(v.rows[0].v).toBe(2);

    // Atendente 2 tenta assumir ou confirmar dentro da janela de 5 min -> bloqueado
    await expect(as(ATT2, "authenticated", `select claim_order_verification('${orderAId}', 2)`)).rejects.toThrow(/EM_VERIFICACAO_POR_OUTRO_ATENDENTE/);
    await expect(as(ATT2, "authenticated", `select confirm_order_presencial('${orderAId}', 2)`)).rejects.toThrow(/EM_VERIFICACAO_POR_OUTRO_ATENDENTE/);
  });

  it("confirmação presencial cria tarefas por setor (cozinha e bar) de forma idempotente e sem duplicar valor", async () => {
    const v = await as(ATT1, "authenticated", `select confirm_order_presencial('${orderAId}', 2) as v`);
    expect(v.rows[0].v).toBe(3);

    // Chamada repetida é idempotente
    const vReplay = await as(ATT1, "authenticated", `select confirm_order_presencial('${orderAId}', 2) as v`);
    expect(vReplay.rows[0].v).toBe(3);

    const tasks = await db.query<any>(`select sector::text as sector, status from production_tasks where order_id='${orderAId}' order by sector::text`);
    expect(tasks.rows).toEqual([
      { sector: "bar", status: "PENDING" },
      { sector: "kitchen", status: "PENDING" },
    ]);

    // Cozinha vê apenas tarefa de cozinha; Bar vê apenas tarefa de bar
    const kitTasks = await as(KIT, "authenticated", `select sector from production_tasks where order_id='${orderAId}'`);
    expect(kitTasks.rows).toEqual([{ sector: "kitchen" }]);
    const barTasks = await as(BAR, "authenticated", `select sector from production_tasks where order_id='${orderAId}'`);
    expect(barTasks.rows).toEqual([{ sector: "bar" }]);
  });

  it("exige motivo para cancelar e cancela tarefas associadas", async () => {
    await expect(as(ATT1, "authenticated", `select cancel_order('${orderAId}', '')`)).rejects.toThrow(/MOTIVO_OBRIGATORIO/);
    await as(ATT1, "authenticated", `select cancel_order('${orderAId}', 'Cliente desistiu na confirmação')`);
    const tasks = await db.query<any>(`select status from production_tasks where order_id='${orderAId}'`);
    expect(tasks.rows.every((t: any) => t.status === "CANCELLED")).toBe(true);
  });
});
