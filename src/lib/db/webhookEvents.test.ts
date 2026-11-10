import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimWebhookEvent } from "./webhookEvents";

const insert = vi.fn();
vi.mock("./server", () => ({ getServiceClient: () => ({ from: () => ({ insert }) }) }));

beforeEach(() => insert.mockReset());

describe("claimWebhookEvent", () => {
  it("is true the first time and records the id and source", async () => {
    insert.mockResolvedValue({ error: null });
    await expect(claimWebhookEvent("evt-1", "line")).resolves.toBe(true);
    expect(insert).toHaveBeenCalledWith({ id: "evt-1", source: "line" });
  });

  it("is false when the id was already recorded (unique violation)", async () => {
    insert.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    await expect(claimWebhookEvent("evt-1", "line")).resolves.toBe(false);
  });

  it("does not hide other database errors", async () => {
    const failure = { code: "08006", message: "connection lost" };
    insert.mockResolvedValue({ error: failure });
    await expect(claimWebhookEvent("evt-1", "line")).rejects.toBe(failure);
  });
});
