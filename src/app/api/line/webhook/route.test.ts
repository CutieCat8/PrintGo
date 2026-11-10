import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimWebhookEvent } from "@/lib/db/webhookEvents";
import { replyMessages } from "@/lib/line/client";
import { POST } from "./route";

vi.mock("@/lib/line/client", () => ({ replyMessages: vi.fn(async () => {}) }));
vi.mock("@/lib/db/webhookEvents", () => ({ claimWebhookEvent: vi.fn(async () => true) }));

const SECRET = "test-channel-secret";
const sign = (body: string) => createHmac("sha256", SECRET).update(body).digest("base64");
const call = (body: string, signature: string | null = sign(body)) =>
  POST(
    new Request("http://localhost/api/line/webhook", {
      method: "POST",
      headers: signature ? { "x-line-signature": signature } : {},
      body,
    }),
    undefined,
  );
const follow = (id: string) => ({ type: "follow", webhookEventId: id, replyToken: `rt-${id}` });

beforeEach(() => {
  vi.stubEnv("LINE_CHANNEL_SECRET", SECRET);
  vi.stubEnv("NEXT_PUBLIC_LIFF_ID", "1234567890-AbCdEfGh");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("POST /api/line/webhook", () => {
  it("answers 401 to a wrong or missing signature and does nothing", async () => {
    const body = JSON.stringify({ events: [follow("a")] });
    expect((await call(body, "not-the-signature")).status).toBe(401);
    expect((await call(body, null)).status).toBe(401);
    expect(claimWebhookEvent).not.toHaveBeenCalled();
    expect(replyMessages).not.toHaveBeenCalled();
  });

  it("answers 200 to the console's Verify button (no events)", async () => {
    expect((await call(JSON.stringify({ destination: "U1", events: [] }))).status).toBe(200);
  });

  it("handles each event and replies once per event", async () => {
    const res = await call(JSON.stringify({ events: [follow("a"), follow("b")] }));
    expect(res.status).toBe(200);
    expect(replyMessages).toHaveBeenCalledTimes(2);
  });

  it("does not reply again to an event it has already seen", async () => {
    vi.mocked(claimWebhookEvent).mockResolvedValueOnce(false);
    await call(JSON.stringify({ events: [follow("a")] }));
    expect(replyMessages).not.toHaveBeenCalled();
  });

  it("still answers 200, and handles the rest, when one event fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(replyMessages).mockRejectedValueOnce(new Error("LINE is down"));
    const res = await call(JSON.stringify({ events: [follow("a"), follow("b")] }));
    expect(res.status).toBe(200);
    expect(replyMessages).toHaveBeenCalledTimes(2);
  });

  it("answers 422 to a signed body that is not valid webhook JSON", async () => {
    expect((await call("not json")).status).toBe(422);
    expect((await call(JSON.stringify({ nothing: true }))).status).toBe(422);
  });
});
