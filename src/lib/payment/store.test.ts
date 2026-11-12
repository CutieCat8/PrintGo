import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPaymentStore } from "./store";

const id = "00000000-0000-4000-8000-000000000001";
const row = {
  id,
  order_id: id,
  created_at: "2026-11-12T03:00:00Z",
  amount_satang: 12600,
  status: "pending",
  slip_path: null,
  slip_ref: null,
  verified_by: null,
  verified_at: null,
  reject_reason: null,
};

/** Query-shape mock, not a database or a proof of PostgreSQL atomicity. */
function harness(results: { data: unknown; error: unknown }[]) {
  const calls: { method: string; args: unknown[] }[][] = [];
  const from = vi.fn((table: string) => {
    const entries: { method: string; args: unknown[] }[] = [{ method: "from", args: [table] }];
    calls.push(entries);
    const reply = results.shift() ?? { data: null, error: null };
    const q: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "insert", "update", "maybeSingle"])
      q[method] = (...args: unknown[]) => {
        entries.push({ method, args });
        return q;
      };
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(reply).then(resolve, reject);
    return q;
  });
  const signed = vi.fn().mockResolvedValue({
    data: { signedUrl: "https://storage.example.invalid", token: "fake" },
    error: null,
  });
  const download = vi
    .fn()
    .mockResolvedValue({ data: new Blob(["test"], { type: "image/png" }), error: null });
  const bucket = vi.fn(() => ({ createSignedUploadUrl: signed, download }));
  const store = createPaymentStore({
    from,
    storage: { from: bucket },
  } as unknown as SupabaseClient);
  return { store, calls, bucket, signed, download };
}

describe("Supabase payment adapter", () => {
  it("filters orders by both ID and authenticated customer and hides missing/foreign orders", async () => {
    const h = harness([{ data: null, error: null }]);
    await expect(h.store.ownOrder("authenticated-customer", id)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
    expect(h.calls[0]).toContainEqual({
      method: "eq",
      args: ["customer_id", "authenticated-customer"],
    });
    expect(h.calls[0]).toContainEqual({ method: "eq", args: ["id", id] });
  });
  it("inserts pending attempt with supplied deterministic ID and returns parsed integer money", async () => {
    const h = harness([{ data: row, error: null }]);
    expect(await h.store.insertAttempt(id, id, 12600)).toMatchObject({
      id,
      amountSatang: 12600,
      status: "pending",
    });
    expect(h.calls[0].find((c) => c.method === "insert")?.args[0]).toMatchObject({
      id,
      order_id: id,
      amount_satang: 12600,
      status: "pending",
    });
  });
  it("a racing primary-key insertion reads the same attempt in the same order", async () => {
    const h = harness([
      { data: null, error: { code: "23505" } },
      { data: row, error: null },
    ]);
    expect((await h.store.insertAttempt(id, id, 12600)).id).toBe(id);
    expect(h.calls[1]).toContainEqual({ method: "eq", args: ["id", id] });
    expect(h.calls[1]).toContainEqual({ method: "eq", args: ["order_id", id] });
  });
  it("claims only pending rows and checks returning row count", async () => {
    const h = harness([
      { data: { id }, error: null },
      { data: null, error: null },
    ]);
    expect(await h.store.claim(id, "path")).toBe(true);
    expect(await h.store.claim(id, "other-path")).toBe(false);
    expect(h.calls[0]).toContainEqual({ method: "eq", args: ["status", "pending"] });
    expect(h.calls[0]).toContainEqual({
      method: "update",
      args: [{ status: "pending_review", slip_path: "path" }],
    });
  });
  it("finishing respects both the review state and claimed path; losing CAS returns false", async () => {
    const h = harness([{ data: null, error: null }]);
    expect(await h.store.finish(id, "own/path", { status: "rejected", rejectReason: "test" })).toBe(
      false,
    );
    expect(h.calls[0]).toContainEqual({ method: "eq", args: ["status", "pending_review"] });
    expect(h.calls[0]).toContainEqual({ method: "eq", args: ["slip_path", "own/path"] });
    expect(h.calls[0]).toContainEqual({ method: "select", args: ["id"] });
  });
  it("duplicate references map to 409 instead of being silently accepted", async () => {
    const h = harness([
      { data: null, error: { code: "23505", constraint: "payments_slip_ref_key" } },
    ]);
    await expect(h.store.finish(id, "path", { slipRef: "FICTIONALREF" })).rejects.toMatchObject({
      code: "PAYMENT_DUPLICATE_SLIP",
      status: 409,
    });
  });
  it("signs only in the private payment bucket without permitting overwrite", async () => {
    const h = harness([]);
    await h.store.sign("own/path");
    expect(h.bucket).toHaveBeenCalledWith("payment-slips");
    expect(h.signed).toHaveBeenCalledWith("own/path", { upsert: false });
  });
  it("hides raw database failures", async () => {
    const h = harness([{ data: null, error: { message: "private-account" } }]);
    await expect(h.store.attempts(id)).rejects.toMatchObject({ code: "INTERNAL", status: 500 });
  });
});
