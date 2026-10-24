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

async function as(uid: string | null, role: "authenticated" | "anon", sql: string) {
  await db.exec(`select set_config('app.uid','${uid ?? ""}', false); set role ${role};`);
  try { return await db.query<any>(sql); } finally { await db.exec("reset role;"); }
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec("create extension pgcrypto;");
  await db.exec(STUB);
  // storage não existe no PGlite: aplica apenas migrations sem dependência do Supabase Storage
  for (const f of readdirSync(dir).sort().filter((x) => !x.includes("storage"))) {
    await db.exec(readFileSync(join(dir, f), "utf8"));
  }
  await db.exec(`insert into auth.users values ('${ADMIN}'),('${ATT}');
    insert into public.profiles(id,full_name,role) values ('${ADMIN}','Admin','admin'),('${ATT}','Atendente','attendant');
    grant select on all tables in schema public to authenticated;`);
});

describe("cardápio", () => {
  it("nasce completamente vazio", async () => {
    for (const t of ["menu_categories", "products", "option_groups", "options"]) {
      const r = await db.query<any>(`select count(*)::int c from ${t}`);
      expect(r.rows[0].c, t).toBe(0);
    }
  });

  let cat: string, prod: string;
  it("atendente não cria categoria; admin cria", async () => {
    await expect(as(ATT, "authenticated", "insert into menu_categories(name) values ('X')")).rejects.toThrow();
    const r = await as(ADMIN, "authenticated", "insert into menu_categories(name,status) values ('Teste Cat','published') returning id");
    cat = r.rows[0].id;
  });
  it("rejeita preço negativo e preço decimal (inteiro em centavos)", async () => {
    await expect(as(ADMIN, "authenticated", `insert into products(category_id,name,price_cents) values ('${cat}','P',-1)`)).rejects.toThrow();
    const r = await as(ADMIN, "authenticated", `insert into products(category_id,name,price_cents,status) values ('${cat}','Produto Teste',1050.7,'published') returning id, price_cents`);
    prod = r.rows[0].id;
    expect(Number.isInteger(r.rows[0].price_cents)).toBe(true);
  });
  it("anônimo só vê publicados; rascunho e arquivado ficam ocultos", async () => {
    await as(ADMIN, "authenticated", `insert into products(category_id,name,price_cents,status) values ('${cat}','Rascunho',100,'draft'),('${cat}','Arquivado',100,'archived')`);
    const r = await as(null, "anon", "select name from products order by name");
    expect(r.rows.map((x: any) => x.name)).toEqual(["Produto Teste"]);
  });
  it("categoria não publicada oculta seus produtos do público", async () => {
    await as(ADMIN, "authenticated", `update menu_categories set status='draft' where id='${cat}'`);
    expect((await as(null, "anon", "select count(*)::int c from products")).rows[0].c).toBe(0);
    await as(ADMIN, "authenticated", `update menu_categories set status='published' where id='${cat}'`);
  });
  it("grupos de adicionais validam limites min/max", async () => {
    await expect(as(ADMIN, "authenticated", `insert into option_groups(product_id,name,min_select,max_select) values ('${prod}','G',3,2)`)).rejects.toThrow();
    await as(ADMIN, "authenticated", `insert into option_groups(product_id,name,min_select,max_select) values ('${prod}','G',1,2)`);
  });
  it("não há DELETE de produtos (somente arquivamento)", async () => {
    await expect(as(ADMIN, "authenticated", `delete from products where id='${prod}'`)).rejects.toThrow();
  });
  it("mudança de preço/status gera auditoria", async () => {
    await as(ADMIN, "authenticated", `update products set price_cents=2000 where id='${prod}'`);
    const r = await db.query<any>("select count(*)::int c from audit_log where action='product.update'");
    expect(r.rows[0].c).toBeGreaterThanOrEqual(1);
  });
});
