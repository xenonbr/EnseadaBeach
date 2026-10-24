import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Banco isolado em memória (NÃO toca o Supabase real). Simula auth.uid() e os papéis do Supabase.
const mig = (f: string) => readFileSync(join(process.cwd(), "supabase/migrations", f), "utf8");
const STUB = `
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
create role anon; create role authenticated;
grant usage on schema public, auth to anon, authenticated;
`;

const ADMIN = "00000000-0000-0000-0000-000000000001";
const ATT = "00000000-0000-0000-0000-000000000002";
const KIT = "00000000-0000-0000-0000-000000000003";
let db: PGlite;

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
  await db.exec(mig("20261024000001_foundation.sql"));
  await db.exec(mig("20261024000002_tables_sessions.sql"));
  await db.exec(`insert into auth.users values ('${ADMIN}'),('${ATT}'),('${KIT}');
    insert into public.profiles(id,full_name,role) values
    ('${ADMIN}','Admin Teste','admin'),('${ATT}','Atendente Teste','attendant'),('${KIT}','Cozinha Teste','kitchen');
    grant select on all tables in schema public to authenticated;`);
});

describe("carga inicial de mesas", () => {
  it("cria Mesa 01..Mesa 40, todas desativadas", async () => {
    const r = await db.query<any>("select count(*)::int c, count(*) filter (where active)::int a, min(display_name) mn, max(display_name) mx from dining_tables");
    expect(r.rows[0]).toMatchObject({ c: 40, a: 0, mn: "Mesa 01", mx: "Mesa 40" });
  });
  it("é idempotente e não sobrescreve dados existentes", async () => {
    await db.exec("update dining_tables set active = true, sort_order = 99 where display_name = 'Mesa 05'");
    const r = await db.query<any>("select public.seed_initial_tables(40) n");
    expect(r.rows[0].n).toBe(0);
    const t = await db.query<any>("select count(*)::int c, bool_or(active) a from dining_tables");
    expect(t.rows[0]).toMatchObject({ c: 40, a: true });
    const m5 = await db.query<any>("select active, sort_order from dining_tables where display_name='Mesa 05'");
    expect(m5.rows[0]).toEqual({ active: true, sort_order: 99 });
    await db.exec("update dining_tables set active=false, sort_order=5 where display_name='Mesa 05'");
  });
  it("permite expansão sem limite fixo", async () => {
    const r = await db.query<any>("select public.seed_initial_tables(45) n");
    expect(r.rows[0].n).toBe(5);
  });
  it("tokens públicos são únicos e não sequenciais", async () => {
    const r = await db.query<any>("select count(distinct public_token)::int c from dining_tables");
    expect(r.rows[0].c).toBe(45);
  });
});

describe("ativação, sessões e permissões", () => {
  let tableId: string;
  beforeAll(async () => {
    tableId = (await db.query<any>("select id from dining_tables where display_name='Mesa 01'")).rows[0].id;
  });
  it("atendente não ativa mesa", async () => {
    await expect(as(ATT, "authenticated", `select set_table_active('${tableId}', true)`)).rejects.toThrow(/SEM_PERMISSAO/);
  });
  it("admin ativa mesa e gera auditoria", async () => {
    await as(ADMIN, "authenticated", `select set_table_active('${tableId}', true)`);
    const a = await db.query<any>("select count(*)::int c from audit_log where action='table.set_active'");
    expect(a.rows[0].c).toBe(1);
  });
  it("não abre sessão em mesa inativa", async () => {
    const off = (await db.query<any>("select id from dining_tables where display_name='Mesa 02'")).rows[0].id;
    await expect(as(ATT, "authenticated", `select open_session('${off}')`)).rejects.toThrow(/MESA_INATIVA/);
  });
  it("cozinha não abre sessão; atendente abre; segunda sessão é bloqueada", async () => {
    await expect(as(KIT, "authenticated", `select open_session('${tableId}')`)).rejects.toThrow(/SEM_PERMISSAO/);
    await as(ATT, "authenticated", `select open_session('${tableId}')`);
    await expect(as(ATT, "authenticated", `select open_session('${tableId}')`)).rejects.toThrow(/SESSAO_JA_ABERTA/);
  });
  it("desativar com sessão aberta exige autorização e não encerra a sessão", async () => {
    await expect(as(ADMIN, "authenticated", `select set_table_active('${tableId}', false)`)).rejects.toThrow(/SESSAO_ABERTA/);
    await as(ADMIN, "authenticated", `select set_table_active('${tableId}', false, true)`);
    const s = await db.query<any>(`select status from table_sessions where table_id='${tableId}'`);
    expect(s.rows[0].status).toBe("open");
  });
  it("encerra sessão e registra responsável", async () => {
    const sid = (await db.query<any>(`select id from table_sessions where table_id='${tableId}'`)).rows[0].id;
    await as(ATT, "authenticated", `select close_session('${sid}')`);
    const s = await db.query<any>(`select status, closed_by from table_sessions where id='${sid}'`);
    expect(s.rows[0]).toEqual({ status: "closed", closed_by: ATT });
  });
  it("anônimo não lê tabelas nem escreve; resolve_table só expõe o mínimo", async () => {
    const t = await as(null, "anon", "select count(*)::int c from dining_tables").catch(() => ({ rows: [{ c: 0 }] }));
    expect(t.rows[0].c).toBe(0);
    const tok = (await db.query<any>("select public_token from dining_tables where display_name='Mesa 01'")).rows[0].public_token;
    const r = await as(null, "anon", `select * from resolve_table('${tok}')`);
    expect(Object.keys(r.rows[0]).sort()).toEqual(["active", "display_name", "has_open_session"]);
  });
  it("rotacionar token invalida o antigo", async () => {
    const old = (await db.query<any>("select public_token from dining_tables where display_name='Mesa 01'")).rows[0].public_token;
    await as(ADMIN, "authenticated", `select rotate_table_token('${tableId}')`);
    const r = await as(null, "anon", `select * from resolve_table('${old}')`);
    expect(r.rows.length).toBe(0);
  });
  it("não remove o último administrador", async () => {
    await expect(db.exec(`update profiles set active=false where id='${ADMIN}'`)).rejects.toThrow(/ULTIMO_ADMIN/);
  });
});
