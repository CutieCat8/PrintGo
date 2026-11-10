import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LineApiError, pushMessages, replyMessages } from "./client";

const TOKEN = "secret-access-token";
const text = (t: string) => ({ type: "text" as const, text: t });
const respond = (status: number, body: unknown = {}) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

beforeEach(() => vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", TOKEN));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("replyMessages / pushMessages", () => {
  it("reply: posts replyToken and messages with the bearer token", async () => {
    const fetchMock = respond(200);
    vi.stubGlobal("fetch", fetchMock);

    await replyMessages("reply-1", [text("hi")]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.line.me/v2/bot/message/reply");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init.body as string)).toEqual({
      replyToken: "reply-1",
      messages: [{ type: "text", text: "hi" }],
    });
  });

  it("push: posts the user id as `to`", async () => {
    const fetchMock = respond(200);
    vi.stubGlobal("fetch", fetchMock);

    await pushMessages("U123", [text("hi")]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.line.me/v2/bot/message/push");
    expect(JSON.parse(init.body as string)).toMatchObject({ to: "U123" });
  });

  it("refuses more than 5 messages, the LINE limit per request", async () => {
    vi.stubGlobal("fetch", respond(200));
    const six = Array.from({ length: 6 }, (_, i) => text(String(i)));
    await expect(pushMessages("U1", six)).rejects.toThrow(/5/);
  });

  it("throws a LineApiError carrying LINE's status and reason, never the token", async () => {
    vi.stubGlobal("fetch", respond(400, { message: "Invalid reply token" }));
    const error = await replyMessages("x", [text("hi")]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LineApiError);
    expect((error as LineApiError).status).toBe(400);
    expect((error as LineApiError).message).toContain("Invalid reply token");
    expect(String((error as LineApiError).message)).not.toContain(TOKEN);
  });

  it("names the missing token instead of sending an unauthenticated request", async () => {
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "");
    const fetchMock = respond(200);
    vi.stubGlobal("fetch", fetchMock);
    await expect(pushMessages("U1", [text("hi")])).rejects.toThrow(/LINE_CHANNEL_ACCESS_TOKEN/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
