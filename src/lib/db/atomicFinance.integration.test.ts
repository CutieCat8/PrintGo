import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Explicit opt-in: creates/drops ONLY a fresh test database in a disposable Docker container.
// No URL, credentials, network port, production database or real customer data is used.
const container = process.env.PRINTGO_ATOMIC_PG_CONTAINER;
const database = `printgo_atomic_${randomUUID().replaceAll("-", "")}`;
const base = [
  "exec",
  "-i",
  container ?? "",
  "psql",
  "-U",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
  "-At",
];
function sql(text: string, db = database) {
  return execFileSync("docker", [...base, "-d", db], {
    input: text,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}
const execute = promisify(execFile);
async function concurrent(text: string) {
  // execFile has no stdin option: psql -c receives SQL as one argv, never through a shell.
  const { stdout } = await execute("docker", [...base, "-d", database, "-c", text]);
  return stdout.trim();
}
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const shop = "00000000-0000-4000-8000-000000000001";
const customer = "00000000-0000-4000-8000-000000000002";
function order(status = "awaiting_payment", expired = false) {
  const id = randomUUID();
  sql(`insert into public.orders (id, customer_id, shop_id, status, fulfillment, requires_manual_price,
    print_subtotal_satang, platform_fee_satang, total_satang, response_deadline, payment_deadline, ready_in_minutes)
    values ('${id}','${customer}','${shop}','${status}','pickup',false,12000,600,12600,
    now()+interval '1 hour', now()+interval '${expired ? "-1" : "1"} hour',30);`);
  return id;
}
function payment(id: string, amount = 12600) {
  const pid = randomUUID();
  sql(`insert into public.payments(id,order_id,amount_satang,status,slip_path)
    values('${pid}','${id}',${amount},'pending_review','${id}/fictional.png');`);
  return pid;
}
function rpc(
  id: string,
  pid: string | null,
  options: {
    from?: string[];
    to?: string;
    actor?: string;
    amount?: number;
    ref?: string | null;
    code?: string;
    verifier?: string;
  } = {},
) {
  const {
    from = ["awaiting_payment"],
    to = "paid",
    actor = "system",
    ref = "FICTIONAL-REF",
    code = "4821",
    verifier = "slipok",
  } = options;
  return `select public.transition_order_finance('${id}',array[${from.map(literal).join(",")}]::public.order_status[],
    '${to}','${actor}','${JSON.stringify({ pickup_code: code, reject_reason: "ตัวอย่างสมมติ" })}'::jsonb,
    ${options.amount ?? "null"},${pid ? literal(pid) : "null"},${pid && ref !== null ? literal(ref) : "null"},${pid ? literal(verifier) : "null"});`;
}
function snapshot(id: string) {
  return JSON.parse(
    sql(`select jsonb_build_object('order', (select to_jsonb(o) from public.orders o where id='${id}'),
    'payments', (select coalesce(jsonb_agg(p), '[]') from public.payments p where order_id='${id}'),
    'settlements', (select coalesce(jsonb_agg(s), '[]') from public.settlements s where order_id='${id}'),
    'refunds', (select coalesce(jsonb_agg(r), '[]') from public.refunds r where order_id='${id}'));`),
  );
}
function failInsert(table: "settlements" | "refunds") {
  sql(`create function public.test_fail_${table}() returns trigger language plpgsql as $$ begin
    raise exception 'fictional injected failure'; end; $$;
    create trigger test_fail before insert on public.${table} for each row execute function public.test_fail_${table}();`);
}
function allowInsert(table: "settlements" | "refunds") {
  sql(`drop trigger test_fail on public.${table}; drop function public.test_fail_${table}();`);
}

describe.skipIf(!container)("financial RPC on actual PostgreSQL", () => {
  beforeAll(() => {
    sql(`create database ${database};`, "postgres");
    sql(`do $$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
      end $$;
      create schema auth; create table auth.users(id uuid primary key);
      create schema storage; create table storage.buckets(id text primary key, name text, public boolean,
        file_size_limit bigint, allowed_mime_types text[]);`);
    // Real application migrations. Only Supabase-managed auth/storage tables above are stubs.
    sql(readFileSync("supabase/migrations/20261110100632_init_schema.sql", "utf8"));
    sql(readFileSync("supabase/migrations/20261112090000_atomic_order_finance.sql", "utf8"));
  }, 30000);
  afterAll(() => {
    sql(`drop database if exists ${database} with (force);`, "postgres");
  });
  beforeEach(() => {
    sql(`truncate public.customers, public.shops cascade;
      insert into public.customers(id,line_user_id,display_name) values('${customer}','fictional','ตัวอย่างสมมติ');
      insert into public.shops(id,name,phone,address,lat,lng) values('${shop}','ตัวอย่างสมมติ','0000000000','ตัวอย่างสมมติ',0,0);`);
  });
  it("commits payment/order/settlement once across simultaneous replays", async () => {
    const id = order();
    const pid = payment(id);
    const results = await Promise.all([concurrent(rpc(id, pid)), concurrent(rpc(id, pid))]);
    expect(results.map((text) => JSON.parse(text).changed).sort()).toEqual([false, true]);
    const saved = snapshot(id);
    expect(saved.order.status).toBe("paid");
    expect(saved.order.pickup_code).toBe("4821");
    expect(saved.payments[0]).toMatchObject({
      status: "verified",
      verified_by: "slipok",
      slip_ref: "FICTIONAL-REF",
    });
    expect(saved.settlements).toHaveLength(1);
    expect(saved.settlements[0].amount_satang).toBe(12000);
    expect(Date.parse(saved.order.estimated_ready_at) - Date.parse(saved.order.paid_at)).toBe(
      30 * 60000,
    );
    sql(rpc(id, pid));
    expect(snapshot(id)).toEqual(saved);
  });
  it("rolls back payment and order when settlement insertion fails, then retries successfully", () => {
    const id = order();
    const pid = payment(id);
    const before = snapshot(id);
    failInsert("settlements");
    try {
      expect(() => sql(rpc(id, pid))).toThrow();
      expect(snapshot(id)).toEqual(before);
    } finally {
      allowInsert("settlements");
    }
    sql(rpc(id, pid));
    expect(snapshot(id).order.status).toBe("paid");
  });
  it("rolls back cancellation when refund insertion fails and supports an exact partial refund", () => {
    const id = order();
    const pid = payment(id);
    sql(rpc(id, pid));
    const before = snapshot(id);
    const cancel = rpc(id, null, { from: ["paid"], to: "cancelled", actor: "admin", amount: 123 });
    failInsert("refunds");
    try {
      expect(() => sql(cancel)).toThrow();
      expect(snapshot(id)).toEqual(before);
    } finally {
      allowInsert("refunds");
    }
    sql(cancel);
    const saved = snapshot(id);
    expect(saved.order.status).toBe("cancelled");
    expect(saved.refunds).toHaveLength(1);
    expect(saved.refunds[0].amount_satang).toBe(123);
    expect(() => sql(cancel)).toThrow();
    expect(snapshot(id)).toEqual(saved);
  });
  it("rejects expired orders, wrong amounts, wrong-order payments and over-refunds without writes", () => {
    const expired = order("awaiting_payment", true);
    const ep = payment(expired);
    const id = order();
    const wrong = payment(id, 1);
    const valid = payment(id);
    for (const query of [rpc(expired, ep), rpc(id, wrong), rpc(id, ep)])
      expect(() => sql(query)).toThrow();
    expect(snapshot(id).order.status).toBe("awaiting_payment");
    expect(snapshot(expired).payments[0].status).toBe("pending_review");
    sql(rpc(id, valid));
    const before = snapshot(id);
    expect(() =>
      sql(rpc(id, null, { from: ["paid"], to: "cancelled", actor: "admin", amount: 12601 })),
    ).toThrow();
    expect(snapshot(id)).toEqual(before);
  });
  it("arbitrates concurrent rejection, and never uses a duplicate slip reference or pickup code", async () => {
    const a = order();
    const ap = payment(a);
    sql(rpc(a, ap));
    const b = order();
    const bp = payment(b);
    const before = snapshot(b);
    expect(() => sql(rpc(b, bp, { ref: "ANOTHER", code: "4821" }))).toThrow();
    expect(() => sql(rpc(b, bp, { code: "4822" }))).toThrow();
    expect(snapshot(b)).toEqual(before);
    const reject = rpc(a, null, { from: ["paid", "printing"], to: "rejected", actor: "shop" });
    const results = await Promise.allSettled([concurrent(reject), concurrent(reject)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(snapshot(a).refunds).toHaveLength(1);
    expect(snapshot(a).refunds[0].amount_satang).toBe(12600);
  });
  it("recognizes an admin approval before the provider response without rewriting its audit fields", () => {
    const id = order();
    const pid = payment(id);
    sql(rpc(id, pid, { actor: "admin", verifier: "admin", ref: null }));
    const saved = snapshot(id);
    expect(saved.payments[0].verified_by).toBe("admin");
    expect(JSON.parse(sql(rpc(id, pid))).changed).toBe(false);
    expect(snapshot(id)).toEqual(saved);
    expect(() => sql(rpc(id, null, { from: ["paid"], to: "cancelled", actor: "shop" }))).toThrow();
    expect(snapshot(id)).toEqual(saved);
  });
  it("serializes cancellation against verification without leaving a paid fragment", async () => {
    const id = order();
    const pid = payment(id);
    await Promise.allSettled([
      concurrent(rpc(id, pid)),
      concurrent(
        `update public.orders set status='cancelled' where id='${id}' and status='awaiting_payment';`,
      ),
    ]);
    const saved = snapshot(id);
    if (saved.order.status === "paid") {
      expect(saved.payments[0].status).toBe("verified");
      expect(saved.settlements).toHaveLength(1);
    } else {
      expect(saved.order.status).toBe("cancelled");
      expect(saved.payments[0].status).toBe("pending_review");
      expect(saved.settlements).toHaveLength(0);
    }
  });
  it("checks the database deadline after waiting for the payment lock", async () => {
    const id = order();
    const pid = payment(id);
    const blocker = concurrent(`begin; select id from public.payments where id='${pid}' for update;
      select pg_sleep(1.5) /* ATOMIC_PAYMENT_LOCK */; commit;`);
    try {
      let acquired = false;
      for (let i = 0; i < 20; i++) {
        if (
          sql(
            `select count(*) from pg_stat_activity where query like '%ATOMIC_PAYMENT_LOCK%' and wait_event='PgSleep';`,
          ) === "1"
        ) {
          acquired = true;
          break;
        }
      }
      expect(acquired).toBe(true);
      sql(
        `update public.orders set payment_deadline=clock_timestamp()+interval '200ms' where id='${id}';`,
      );
      await expect(concurrent(rpc(id, pid))).rejects.toThrow();
      expect(snapshot(id).order.status).toBe("awaiting_payment");
      expect(snapshot(id).payments[0].status).toBe("pending_review");
      expect(snapshot(id).settlements).toHaveLength(0);
    } finally {
      await blocker;
    }
  });
  it("denies anon/authenticated execution and allows service_role", () => {
    for (const role of ["anon", "authenticated"]) {
      expect(
        sql(
          `select has_function_privilege('${role}', 'public.transition_order_finance(uuid,public.order_status[],public.order_status,text,jsonb,integer,uuid,text,public.payment_verifier)', 'execute');`,
        ),
      ).toBe("f");
      const id = order();
      const pid = payment(id);
      expect(() => sql(`set role ${role}; ${rpc(id, pid)}`)).toThrow();
    }
    const id = order();
    const pid = payment(id);
    expect(
      JSON.parse(
        sql(`set role service_role; ${rpc(id, pid)}`)
          .split("\n")
          .at(-1)!,
      ).changed,
    ).toBe(true);
  });
});
