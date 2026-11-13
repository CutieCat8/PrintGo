import { beforeEach, describe, expect, it, vi } from "vitest";

const claim = vi.fn();
const apply = vi.fn();
let row: { order_id: string; status: string } | null = null;

vi.mock("@/lib/db/webhookEvents", () => ({ claimWebhookEvent: (...a: unknown[]) => claim(...a) }));
vi.mock("./index", () => ({ applyDeliveryUpdate: (...a: unknown[]) => apply(...a) }));
vi.mock("@/lib/db/server", () => {
  const b: Record<string, unknown> = {};
  for (const op of ["select", "eq"]) b[op] = () => b;
  b.maybeSingle = () => Promise.resolve({ data: row, error: null });
  return { getServiceClient: () => ({ from: () => b }) };
});

import { handleGrabWebhook } from "./grabWebhook";

const event = { deliveryID: "D1", timestamp: 1700000000, status: "IN_DELIVERY", trackURL: "https://t" };
function req(body: unknown, headers: Record<string, string> = { "authorization-id": "id", authorization: "secret" }) {
  return new Request("http://x/api/delivery/webhook/grab", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GRAB_CLIENT_ID", "id");
  vi.stubEnv("GRAB_CLIENT_SECRET", "secret");
  claim.mockResolvedValue(true);
  row = { order_id: "o1", status: "booked" };
});

describe("handleGrabWebhook", () => {
  it("is not available without credentials", async () => {
    vi.stubEnv("GRAB_CLIENT_ID", "");
    await expect(handleGrabWebhook(req(event))).resolves.toMatchObject({ status: 501 });
  });

  it("rejects missing or wrong credentials headers", async () => {
    await expect(handleGrabWebhook(req(event, {}))).rejects.toMatchObject({ status: 401 });
    await expect(
      handleGrabWebhook(req(event, { "authorization-id": "id", authorization: "nope" })),
    ).rejects.toMatchObject({ status: 401 });
    expect(apply).not.toHaveBeenCalled();
  });

  it("updates the delivery row with the mapped status and tracking url", async () => {
    const res = await handleGrabWebhook(req(event));
    expect(res.status).toBe(200);
    expect(apply).toHaveBeenCalledWith("o1", { status: "in_transit", trackingUrl: "https://t" });
  });

  it("does nothing for a copy it has already seen", async () => {
    claim.mockResolvedValue(false);
    await handleGrabWebhook(req(event));
    expect(apply).not.toHaveBeenCalled();
  });

  it("ignores unknown deliveries and late updates after the delivery ended", async () => {
    row = null;
    await expect(handleGrabWebhook(req(event))).resolves.toMatchObject({ status: 200 });
    row = { order_id: "o1", status: "delivered" };
    await handleGrabWebhook(req(event));
    expect(apply).not.toHaveBeenCalled();
  });

  it("stores the failure reason", async () => {
    await handleGrabWebhook(
      req({ ...event, status: "FAILED", trackURL: undefined, failedReason: "6|Could not find driver" }),
    );
    expect(apply).toHaveBeenCalledWith("o1", { status: "failed", note: "6|Could not find driver" });
  });
});
