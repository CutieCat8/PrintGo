import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { OrderRow, type PaymentRow } from "@/lib/db/types";
import { ApiError } from "@/lib/errors";
import type { PaymentStore } from "./store";
import { createPaymentService } from "./service";

const orderId = "00000000-0000-4000-8000-000000000001";
const customerId = "00000000-0000-4000-8000-000000000002";
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const path = () => `${orderId}/${randomUUID()}.png`;
const now = "2026-11-12T03:00:00Z";

/** Unit-test store only: does not prove actual PostgreSQL transaction behavior. */
class Store implements PaymentStore {
  order = OrderRow.parse({
    id: orderId,
    customerId,
    shopId: customerId,
    createdAt: now,
    updatedAt: now,
    orderNo: "PG-0001",
    status: "awaiting_payment",
    fulfillment: "pickup",
    deliveryAddress: null,
    deliveryLat: null,
    deliveryLng: null,
    deliveryRecipientName: null,
    deliveryRecipientPhone: null,
    customerNote: null,
    requiresManualPrice: false,
    estimatedPrintSatang: 12000,
    estimatedServicesSatang: 0,
    printSubtotalSatang: 12000,
    platformFeeSatang: 600,
    deliveryFeeSatang: 0,
    totalSatang: 12600,
    rejectReason: null,
    responseDeadline: now,
    paymentDeadline: "2026-11-12T03:30:00Z",
    readyInMinutes: 30,
    estimatedReadyAt: null,
    readyNote: null,
    pickupCode: null,
    paidAt: null,
    completedAt: null,
  });
  rows = new Map<string, PaymentRow>();
  blob = new Blob([png], { type: "image/png" });
  downloads = 0;
  async ownOrder(customer: string, id: string) {
    if (id !== this.order.id || customer !== this.order.customerId)
      throw new ApiError("NOT_FOUND", 404);
    return { ...this.order };
  }
  async attempts() {
    await Promise.resolve();
    return [...this.rows.values()].map((row) => ({ ...row }));
  }
  async insertAttempt(id: string, order: string, amount: number) {
    await Promise.resolve();
    if (!this.rows.has(id))
      this.rows.set(id, {
        id,
        orderId: order,
        amountSatang: amount,
        status: "pending",
        createdAt: now,
        slipPath: null,
        slipRef: null,
        verifiedBy: null,
        verifiedAt: null,
        rejectReason: null,
      });
    return { ...this.rows.get(id)! };
  }
  async claim(id: string, slipPath: string) {
    await Promise.resolve();
    const p = this.rows.get(id)!;
    if (p.status !== "pending") return false;
    p.status = "pending_review";
    p.slipPath = slipPath;
    return true;
  }
  async finish(id: string, slipPath: string, patch: Parameters<PaymentStore["finish"]>[2]) {
    const p = this.rows.get(id)!;
    if (p.status === "pending_review" && p.slipPath === slipPath) {
      Object.assign(p, patch);
      return true;
    }
    return false;
  }
  async sign() {
    return { uploadUrl: "https://storage.example.invalid/upload", token: "fictional-token" };
  }
  async download() {
    this.downloads++;
    return this.blob;
  }
}

function setup() {
  const store = new Store();
  const verifySlip = vi.fn().mockResolvedValue({ result: "review" });
  const createCharge = vi
    .fn()
    .mockResolvedValue({ promptpayPayload: "fictional", qrDataUrl: "data:image/png;base64,fake" });
  const expire = vi.fn(async (order: OrderRow) => order);
  const notifyRejected = vi.fn().mockResolvedValue(undefined);
  const deps = { store, provider: () => ({ verifySlip, createCharge }), expire, notifyRejected };
  return {
    store,
    verifySlip,
    createCharge,
    expire,
    notifyRejected,
    deps,
    service: createPaymentService(deps),
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
});
afterEach(() => vi.useRealTimers());

describe("charge and signing", () => {
  it("always uses the order amount and returns the existing pending charge", async () => {
    const h = setup();
    const a = await h.service.charge(customerId, orderId);
    const b = await h.service.charge(customerId, orderId);
    expect(a.paymentId).toBe(b.paymentId);
    expect(h.store.rows.size).toBe(1);
    expect(h.createCharge).toHaveBeenCalledWith({ orderId, amountSatang: 12600 });
    expect(a).toMatchObject({ amountSatang: 12600, expiresAt: h.store.order.paymentDeadline });
  });
  it("racing charge requests produce one deterministic payment primary key", async () => {
    const h = setup();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => h.service.charge(customerId, orderId)),
    );
    expect(new Set(results.map((r) => r.paymentId)).size).toBe(1);
    expect(h.store.rows.size).toBe(1);
  });
  it.each(["charge", "sign", "submit"] as const)(
    "another customer gets 404 on %s before side effects",
    async (action) => {
      const h = setup();
      const promise =
        action === "charge"
          ? h.service.charge("other", orderId)
          : action === "sign"
            ? h.service.sign("other", orderId, "image/png")
            : h.service.submit("other", orderId, path());
      await expect(promise).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
      expect(h.store.rows.size).toBe(0);
      expect(h.store.downloads).toBe(0);
      expect(h.verifySlip).not.toHaveBeenCalled();
    },
  );
  it.each(["paid", "expired", "cancelled", "submitted"] as const)(
    "rejects %s order",
    async (status) => {
      const h = setup();
      h.store.order.status = status;
      await expect(h.service.charge(customerId, orderId)).rejects.toMatchObject({ status: 409 });
      expect(h.store.rows.size).toBe(0);
    },
  );
  it.each([null, "invalid", now])(
    "rejects missing, malformed or reached deadline %s",
    async (deadline) => {
      const h = setup();
      h.store.order.paymentDeadline = deadline;
      await expect(h.service.charge(customerId, orderId)).rejects.toMatchObject({ status: 409 });
      expect(h.expire).toHaveBeenCalledOnce();
    },
  );
  it("creates separate UUID paths in the order's own private folder", async () => {
    const h = setup();
    const a = await h.service.sign(customerId, orderId, "image/png");
    const b = await h.service.sign(customerId, orderId, "image/jpeg");
    expect(a.path).toMatch(new RegExp(`^${orderId}/[0-9a-f-]{36}\\.png$`));
    expect(b.path.endsWith(".jpg")).toBe(true);
    expect(a.path).not.toBe(b.path);
    expect(h.store.rows.size).toBe(1);
  });
});

describe("submit slip", () => {
  it.each([
    `other/${randomUUID()}.png`,
    `${orderId}/../x.png`,
    `${orderId}/%2e%2e.png`,
    `${orderId}/${randomUUID()}.png?token=x`,
    `${orderId}/arbitrary.png`,
  ])("rejects invalid or cross-order path %s", async (badPath) => {
    const h = setup();
    await expect(h.service.submit(customerId, orderId, badPath)).rejects.toMatchObject({
      status: 422,
    });
    expect(h.store.downloads).toBe(0);
  });
  it.each([
    new Blob([], { type: "image/png" }),
    new Blob([png], { type: "text/plain" }),
    new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/png" }),
    new Blob(["fake png"], { type: "image/png" }),
  ])("validates actual uploaded bytes/type/size", async (blob) => {
    const h = setup();
    h.store.blob = blob;
    await expect(h.service.submit(customerId, orderId, path())).rejects.toMatchObject({
      status: 422,
    });
    expect(h.verifySlip).not.toHaveBeenCalled();
  });
  it("records manual review and repeated submission does not reverify", async () => {
    const h = setup();
    const key = path();
    expect(await h.service.submit(customerId, orderId, key)).toEqual({ status: "pending_review" });
    expect(await h.service.submit(customerId, orderId, key)).toEqual({ status: "pending_review" });
    expect(h.verifySlip).toHaveBeenCalledOnce();
    expect([...h.store.rows.values()][0].slipPath).toBe(key);
  });
  it("racing slip requests only claim/verify once", async () => {
    const h = setup();
    await h.service.charge(customerId, orderId);
    await Promise.all(
      Array.from({ length: 10 }, () => h.service.submit(customerId, orderId, path())),
    );
    expect(h.verifySlip).toHaveBeenCalledOnce();
    expect(h.store.rows.size).toBe(1);
  });
  it("rejects and notifies once per rejected submission, allows a different slip", async () => {
    const h = setup();
    h.verifySlip.mockResolvedValue({ result: "rejected", reason: "ยอดไม่ตรง" });
    const first = path();
    await h.service.submit(customerId, orderId, first);
    await h.service.submit(customerId, orderId, first);
    expect(h.notifyRejected).toHaveBeenCalledOnce();
    await h.service.submit(customerId, orderId, path());
    expect(h.store.rows.size).toBe(2);
  });
  it("enforces the five-attempt limit in persisted rows", async () => {
    const h = setup();
    h.verifySlip.mockResolvedValue({ result: "rejected" });
    for (let i = 0; i < 5; i++) await h.service.submit(customerId, orderId, path());
    await expect(h.service.submit(customerId, orderId, path())).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
    });
    expect(h.verifySlip).toHaveBeenCalledTimes(5);
  });
  it("a provider duplicate remains 409 and is not marked paid", async () => {
    const h = setup();
    h.verifySlip.mockRejectedValue(new ApiError("PAYMENT_DUPLICATE_SLIP", 409));
    const duplicatePath = path();
    await expect(h.service.submit(customerId, orderId, duplicatePath)).rejects.toMatchObject({
      code: "PAYMENT_DUPLICATE_SLIP",
      status: 409,
    });
    expect([...h.store.rows.values()][0].status).toBe("rejected");
    expect(h.store.order.status).toBe("awaiting_payment");
    await expect(h.service.submit(customerId, orderId, duplicatePath)).rejects.toMatchObject({
      status: 409,
    });
    expect(h.notifyRejected).toHaveBeenCalledOnce();
  });
  it("does not notify rejection when an admin already changed the payment", async () => {
    const h = setup();
    h.verifySlip.mockImplementation(async () => {
      [...h.store.rows.values()][0].status = "verified";
      h.store.order.status = "paid";
      return { result: "rejected", reason: "late provider response" };
    });
    expect(await h.service.submit(customerId, orderId, path())).toEqual({ status: "verified" });
    expect(h.notifyRejected).not.toHaveBeenCalled();
  });
  it("rechecks expiry after download and does not send an overdue slip", async () => {
    const h = setup();
    h.store.download = async () => {
      h.store.order.status = "expired";
      return h.store.blob;
    };
    await expect(h.service.submit(customerId, orderId, path())).rejects.toMatchObject({
      status: 409,
    });
    expect(h.verifySlip).not.toHaveBeenCalled();
  });
  it("verified SlipOK response stays pending_review until a shared atomic finalizer exists", async () => {
    const h = setup();
    h.verifySlip.mockResolvedValue({ result: "verified", slipRef: "FICTIONALREF" });
    expect(await h.service.submit(customerId, orderId, path())).toEqual({
      status: "pending_review",
    });
    expect(h.store.order.status).toBe("awaiting_payment");
    expect([...h.store.rows.values()][0].slipRef).toBe("FICTIONALREF");
  });
  it("simulated atomic finalizer is invoked once under concurrency (not a real transaction test)", async () => {
    const h = setup();
    h.verifySlip.mockResolvedValue({ result: "verified", slipRef: "FICTIONALREF" });
    const settlements: string[] = [];
    const finalizeVerified = vi.fn(async (_order: string, paymentId: string) => {
      h.store.order.status = "paid";
      h.store.rows.get(paymentId)!.status = "verified";
      settlements.push(paymentId);
    });
    const service = createPaymentService({ ...h.deps, finalizeVerified });
    await Promise.all([
      service.submit(customerId, orderId, path()),
      service.submit(customerId, orderId, path()),
    ]);
    expect(finalizeVerified).toHaveBeenCalledOnce();
    expect(settlements).toHaveLength(1);
  });
});
