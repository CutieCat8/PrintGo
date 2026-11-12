/**
 * An in-memory stand-in for the Supabase client, for unit tests only. It is NOT Postgres or the
 * real Storage service: it imitates the query shapes our domain code uses (select, insert, update,
 * delete, upsert with eq/neq/in/lt/is/order/limit/single, and the Storage calls). Passing tests
 * against it prove our logic, not that the real services accept the same calls.
 * Every query yields once before running so concurrent calls really interleave.
 */
export type Row = Record<string, unknown>;
export type StoredObject = { size: number; contentType: string; createdAt: string };
type Result = { data: unknown; error: unknown };

// Unique constraints of the real tables that tests rely on (insert fails with Postgres code 23505).
// Rows inside one insert are not compared with each other.
const UNIQUES: Record<string, string[][]> = {
  profiles: [["auth_user_id"]],
  shop_hours: [["shop_id", "weekday"]],
  shop_pricing_rules: [["shop_id", "color", "paper", "sides"]],
  shop_discount_tiers: [["shop_id", "min_pages"]],
  webhook_events: [["id"]],
  push_subscriptions: [["endpoint"]],
};

// Column defaults of the real tables that code under test relies on.
const VALUE_DEFAULTS: Record<string, Row> = {
  shops: { is_paused: false, cutoff_minutes: 30 },
  shop_services: { is_active: true, sort_order: 0 },
};

// Columns that default to null in the real tables (so rows read back like real ones).
const NULLABLE_DEFAULTS: Record<string, string[]> = {
  orders: [
    "delivery_address",
    "delivery_lat",
    "delivery_lng",
    "delivery_recipient_name",
    "delivery_recipient_phone",
    "customer_note",
    "estimated_print_satang",
    "estimated_services_satang",
    "print_subtotal_satang",
    "platform_fee_satang",
    "total_satang",
    "reject_reason",
    "payment_deadline",
    "ready_in_minutes",
    "estimated_ready_at",
    "ready_note",
    "pickup_code",
    "paid_at",
    "completed_at",
  ],
  order_files: ["deleted_at"],
  messages: ["read_at", "push_sent_at"],
  push_subscriptions: ["user_agent", "last_success_at"],
};

let idCounter = 0;
export const fakeUuid = () => `00000000-0000-4000-8000-${String(++idCounter).padStart(12, "0")}`;

export class FakeSupabase {
  /** RPC response stand-in only; PostgreSQL integration tests prove actual transactions. */
  async rpc(name: string, args: Record<string, unknown>) {
    await Promise.resolve();
    if (name !== "transition_order_finance") throw new Error("Unknown test RPC");
    const order = this.rows("orders").find((row) => row.id === args.p_order_id);
    if (!order || !(args.p_from as string[]).includes(order.status as string))
      return { data: null, error: { code: "PT409" } };
    const table = args.p_to === "paid" ? "settlements" : "refunds";
    if (this.failures.has(`${table}.insert`) || this.failures.has("orders.update"))
      return { data: null, error: { code: "23514" } };
    Object.assign(order, args.p_values);
    this.rows(table).push({
      id: fakeUuid(),
      order_id: order.id,
      status: "pending",
      ...(table === "settlements"
        ? { shop_id: order.shop_id, amount_satang: order.print_subtotal_satang }
        : {
            amount_satang: args.p_refund_satang ?? order.total_satang,
            reason: order.reject_reason,
          }),
    });
    return { data: { order: { ...order }, changed: true }, error: null };
  }
  tables: Record<string, Row[]> = {};
  buckets: Record<string, Map<string, StoredObject>> = {};
  /** Make a query fail: `${table}.${op}` -> error message. */
  failures = new Map<string, string>();
  storageFailures = new Set<string>(); // "move" | "remove" | "list" | "createSignedUrl" | ...
  /** Make only the Nth `move` call (1-based) fail. */
  failMoveOnCall: number | null = null;
  failMoveCalls = new Set<number>(); // several calls
  moveCalls = 0;
  log: { op: string; target: string; args?: unknown }[] = [];
  private orderNo = 0;

  storage = { from: (bucket: string) => new FakeBucket(this, bucket) };

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }
  objects(bucket: string): Map<string, StoredObject> {
    return (this.buckets[bucket] ??= new Map());
  }
  put(bucket: string, key: string, over: Partial<StoredObject> = {}): void {
    this.objects(bucket).set(key, {
      size: 1000,
      contentType: "application/pdf",
      createdAt: new Date().toISOString(),
      ...over,
    });
  }
  from(table: string): Query {
    return new Query(this, table);
  }
  nextOrderNo(): string {
    return `PG-${String(++this.orderNo).padStart(4, "0")}`;
  }
}

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" | "upsert" | null = null;
  private columns: string[] | null = null;
  private payload: Row | Row[] | null = null;
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private filters: ((r: Row) => boolean)[] = [];
  private returning = false;
  private invalidInput = false;
  private mode: "maybe" | "one" | null = null;
  private limitN = Infinity;
  private orderBy: { col: string; asc: boolean } | null = null;

  constructor(
    private db: FakeSupabase,
    private table: string,
  ) {}

  select(cols = "*") {
    if (this.op === null) this.op = "select";
    else this.returning = true;
    this.columns = cols.trim() === "*" ? null : cols.split(",").map((c) => c.trim());
    return this;
  }
  insert(p: Row | Row[]) {
    this.op = "insert";
    this.payload = p;
    return this;
  }
  update(p: Row) {
    this.op = "update";
    this.payload = p;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  upsert(p: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert";
    this.payload = p;
    this.upsertOpts = opts;
    return this;
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => r[col] === v);
    return this;
  }
  neq(col: string, v: unknown) {
    this.filters.push((r) => r[col] !== v);
    return this;
  }
  in(col: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[col]));
    return this;
  }
  lt(col: string, v: unknown) {
    this.filters.push(
      (r) => r[col] !== null && r[col] !== undefined && (r[col] as string) < (v as string),
    );
    return this;
  }
  gte(col: string, v: unknown) {
    this.filters.push((r) => (r[col] as string) >= (v as string));
    return this;
  }
  /** SQL LIKE with `%` wildcards only. */
  like(col: string, pattern: string) {
    const escape = (part: string) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^${pattern.split("%").map(escape).join(".*")}$`);
    this.filters.push((r) => typeof r[col] === "string" && re.test(r[col] as string));
    return this;
  }
  gt(col: string, v: unknown) {
    // Postgres refuses "" as a uuid ("invalid input syntax for type uuid"); so does this fake.
    if (v === "" && col.endsWith("id")) this.invalidInput = true;
    this.filters.push((r) => (r[col] as string) > (v as string));
    return this;
  }
  is(col: string, v: null) {
    this.filters.push((r) => (r[col] ?? null) === v);
    return this;
  }
  order(col: string, opts: { ascending?: boolean } = {}) {
    this.orderBy = { col, asc: opts.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }
  /** Like Supabase: an error unless exactly one row. */
  single() {
    this.mode = "one";
    return this;
  }

  then<T1, T2>(
    ok?: ((v: Result) => T1 | PromiseLike<T1>) | null,
    bad?: ((e: unknown) => T2 | PromiseLike<T2>) | null,
  ) {
    return this.run().then(ok, bad);
  }

  private project(r: Row): Row {
    if (!this.columns) return { ...r };
    return Object.fromEntries(this.columns.map((c) => [c, r[c]]));
  }
  private shape(list: Row[]): Result {
    const rows = list.map((r) => this.project(r));
    if (this.mode === null) return { data: rows, error: null };
    if (this.mode === "one" && rows.length !== 1) {
      return { data: null, error: { code: "PGRST116", message: "expected one row" } };
    }
    return { data: rows[0] ?? null, error: null };
  }
  private defaults(row: Row): Row {
    const out: Row = { ...row };
    out.id ??= fakeUuid();
    out.created_at ??= new Date().toISOString();
    for (const [col, value] of Object.entries(VALUE_DEFAULTS[this.table] ?? {})) out[col] ??= value;
    for (const col of NULLABLE_DEFAULTS[this.table] ?? []) out[col] ??= null;
    if (this.table === "orders") {
      out.status ??= "submitted";
      out.order_no ??= this.db.nextOrderNo();
      out.updated_at ??= new Date().toISOString();
      out.delivery_fee_satang ??= 0;
    }
    return out;
  }

  private async run(): Promise<Result> {
    await Promise.resolve();
    if (this.invalidInput) {
      return {
        data: null,
        error: { code: "22P02", message: "invalid input syntax for type uuid" },
      };
    }
    const failure = this.db.failures.get(`${this.table}.${this.op}`);
    if (failure) return { data: null, error: { code: "XX000", message: failure } };

    const rows = this.db.rows(this.table);
    const matched = () => {
      let list = rows.filter((r) => this.filters.every((f) => f(r)));
      if (this.orderBy) {
        const { col, asc } = this.orderBy;
        list = [...list].sort((a, b) =>
          (a[col] as string) < (b[col] as string)
            ? asc
              ? -1
              : 1
            : (a[col] as string) > (b[col] as string)
              ? asc
                ? 1
                : -1
              : 0,
        );
      }
      return list.slice(0, this.limitN);
    };

    switch (this.op) {
      case "select":
        return this.shape(matched());
      case "insert": {
        const inserted = ([] as Row[])
          .concat(this.payload as Row | Row[])
          .map((r) => this.defaults(r));
        for (const row of inserted) {
          for (const cols of UNIQUES[this.table] ?? []) {
            if (rows.some((x) => cols.every((c) => x[c] === row[c]))) {
              return { data: null, error: { code: "23505", message: "duplicate key value" } };
            }
          }
        }
        rows.push(...inserted);
        return this.returning ? this.shape(inserted) : { data: null, error: null };
      }
      case "upsert": {
        // `onConflict` may name several columns ("shop_id,weekday"). On a conflict the row is
        // skipped (ignoreDuplicates) or updated in place, like Postgres ON CONFLICT.
        const keys = (this.upsertOpts.onConflict as string).split(",").map((k) => k.trim());
        const inserted: Row[] = [];
        for (const r of ([] as Row[]).concat(this.payload as Row | Row[])) {
          const existing = rows.find((x) => keys.every((k) => x[k] === r[k]));
          if (existing) {
            if (!this.upsertOpts.ignoreDuplicates) {
              Object.assign(existing, r);
              inserted.push(existing);
            }
            continue;
          }
          const row = this.defaults(r);
          rows.push(row);
          inserted.push(row);
        }
        return this.returning ? this.shape(inserted) : { data: null, error: null };
      }
      case "update": {
        const hit = matched();
        for (const r of hit) Object.assign(r, this.payload);
        return this.returning ? this.shape(hit) : { data: null, error: null };
      }
      case "delete": {
        const hit = matched();
        this.db.tables[this.table] = rows.filter((r) => !hit.includes(r));
        return this.returning ? this.shape(hit) : { data: null, error: null };
      }
      default:
        throw new Error("FakeSupabase: query without an operation");
    }
  }
}

class FakeBucket {
  constructor(
    private db: FakeSupabase,
    private bucket: string,
  ) {}
  private store() {
    return this.db.objects(this.bucket);
  }
  private fail(op: string) {
    return this.db.storageFailures.has(op)
      ? { data: null, error: new Error(`${op} failed`) }
      : null;
  }

  async createSignedUploadUrl(key: string) {
    this.db.log.push({ op: "createSignedUploadUrl", target: `${this.bucket}/${key}` });
    const failed = this.fail("createSignedUploadUrl");
    if (failed) return failed;
    return {
      data: {
        signedUrl: `https://storage.test/upload/sign/${this.bucket}/${key}?token=T-${key}`,
        token: `T-${key}`,
        path: key,
      },
      error: null,
    };
  }

  async createSignedUrl(key: string, expiresIn: number, options?: { download?: string | boolean }) {
    this.db.log.push({
      op: "createSignedUrl",
      target: `${this.bucket}/${key}`,
      args: { expiresIn, options },
    });
    const failed = this.fail("createSignedUrl");
    if (failed) return failed;
    if (!this.store().has(key)) return { data: null, error: new Error("Object not found") };
    const download = options?.download
      ? `&download=${encodeURIComponent(String(options.download))}`
      : "";
    return {
      data: {
        signedUrl: `https://storage.test/object/sign/${this.bucket}/${key}?token=S&exp=${expiresIn}${download}`,
      },
      error: null,
    };
  }

  async move(from: string, to: string) {
    this.db.log.push({ op: "move", target: `${this.bucket}/${from}`, args: { to } });
    this.db.moveCalls++;
    if (
      this.db.failMoveOnCall === this.db.moveCalls ||
      this.db.failMoveCalls.has(this.db.moveCalls)
    ) {
      return { data: null, error: new Error("move failed") };
    }
    const failed = this.fail("move");
    if (failed) return failed;
    const obj = this.store().get(from);
    if (!obj) return { data: null, error: new Error("Object not found") };
    if (this.store().has(to))
      return { data: null, error: new Error("The resource already exists") };
    this.store().delete(from);
    this.store().set(to, obj);
    return { data: { message: "Successfully moved" }, error: null };
  }

  async remove(keys: string[]) {
    this.db.log.push({ op: "remove", target: this.bucket, args: keys });
    const failed = this.fail("remove");
    if (failed) return failed;
    const removed = keys.filter((k) => this.store().delete(k));
    return { data: removed.map((name) => ({ name })), error: null };
  }

  async exists(key: string) {
    return { data: this.store().has(key), error: null };
  }

  async info(key: string) {
    const failed = this.fail("info");
    if (failed) return failed;
    const obj = this.store().get(key);
    if (!obj) return { data: null, error: new Error("Object not found") };
    return {
      data: {
        id: key,
        name: key,
        size: obj.size,
        contentType: obj.contentType,
        createdAt: obj.createdAt,
      },
      error: null,
    };
  }

  async list(prefix = "", opts: { limit?: number; offset?: number } = {}) {
    const failed = this.fail("list");
    if (failed) return failed;
    const base = prefix === "" ? "" : `${prefix.replace(/\/$/, "")}/`;
    const children = new Map<string, { id: string | null; created_at: string | null }>();
    for (const [key, obj] of this.store()) {
      if (!key.startsWith(base)) continue;
      const rest = key.slice(base.length);
      const [first, ...more] = rest.split("/");
      if (more.length > 0) children.set(first, { id: null, created_at: null });
      else children.set(first, { id: key, created_at: obj.createdAt });
    }
    const all = [...children.entries()].map(([name, v]) => ({ name, ...v }));
    const offset = opts.offset ?? 0;
    return { data: all.slice(offset, offset + (opts.limit ?? 100)), error: null };
  }
}
