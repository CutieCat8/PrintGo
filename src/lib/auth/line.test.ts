import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const okBody = (over: Record<string, unknown> = {}) => ({
  iss: "https://access.line.me",
  sub: "U123",
  aud: "chan-1",
  exp: Math.floor(Date.now() / 1000) + 3600,
  name: "สมชาย",
  picture: "https://profile.line-scdn.net/x",
  ...over,
});

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

async function loadVerify() {
  vi.resetModules(); // fresh token cache for every test
  return (await import("./line")).verifyLiffIdToken;
}

beforeEach(() => vi.stubEnv("LINE_CHANNEL_ID", "chan-1"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("verifyLiffIdToken", () => {
  it("asks LINE to verify the token for our channel and maps the answer", async () => {
    const fetchMock = reply(200, okBody());
    vi.stubGlobal("fetch", fetchMock);
    const verify = await loadVerify();

    await expect(verify("token-a")).resolves.toEqual({
      lineUserId: "U123",
      displayName: "สมชาย",
      pictureUrl: "https://profile.line-scdn.net/x",
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.line.me/oauth2/v2.1/verify");
    expect(init.method).toBe("POST");
    expect(new URLSearchParams(init.body as string).get("id_token")).toBe("token-a");
    expect(new URLSearchParams(init.body as string).get("client_id")).toBe("chan-1");
  });

  it("falls back to a neutral name when the token carries no profile", async () => {
    vi.stubGlobal("fetch", reply(200, okBody({ name: undefined, picture: undefined })));
    const verify = await loadVerify();
    await expect(verify("token-b")).resolves.toMatchObject({
      displayName: "ผู้ใช้ LINE",
      pictureUrl: null,
    });
  });

  it("answers 401 when LINE rejects the token, without repeating LINE's reason", async () => {
    vi.stubGlobal(
      "fetch",
      reply(400, { error: "invalid_request", error_description: "IdToken expired." }),
    );
    const verify = await loadVerify();
    await expect(verify("bad")).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
  });

  it("answers 500, not 401, when LINE cannot be reached: the user did nothing wrong", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("network down"))),
    );
    const verify = await loadVerify();
    await expect(verify("any")).rejects.toMatchObject({ code: "INTERNAL", status: 500 });
  });

  it("remembers a verified token for a while instead of asking LINE on every request", async () => {
    const fetchMock = reply(200, okBody());
    vi.stubGlobal("fetch", fetchMock);
    const verify = await loadVerify();
    await verify("same");
    await verify("same");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not remember a rejected token", async () => {
    const fetchMock = reply(400, { error_description: "Invalid IdToken." });
    vi.stubGlobal("fetch", fetchMock);
    const verify = await loadVerify();
    await expect(verify("bad")).rejects.toBeTruthy();
    await expect(verify("bad")).rejects.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("names the missing setting when LINE_CHANNEL_ID is not configured", async () => {
    vi.stubEnv("LINE_CHANNEL_ID", "");
    vi.stubGlobal("fetch", reply(200, okBody()));
    const verify = await loadVerify();
    await expect(verify("t")).rejects.toThrow(/LINE_CHANNEL_ID/);
  });
});
