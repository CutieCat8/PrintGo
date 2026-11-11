import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifySlip } from "./index";
import { getPaymentProvider } from "../provider";

// All account IDs, references, images and HTTP responses below are fictional mocks.
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const args = { slipBytes: png, expectedAmountSatang: 12345 };
const context = { orderCreatedAt: "2026-11-11T03:00:00Z", branchReceiverConfirmed: true };
const fetchMock = vi.fn<typeof fetch>();

function success(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      success: true,
      transRef: "FICTIONALREF001",
      amount: 123.45,
      transTimestamp: "2026-11-11T03:00:01Z",
      countryCode: "TH",
      paidLocalCurrency: "764",
      receiver: { proxy: { type: "MSISDN", value: "000xxx0000" } },
      ...overrides,
    },
  };
}

function respond(body: unknown, status = 200) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-11T04:00:00Z"));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("SLIPOK_API_KEY", "fictional-key");
  vi.stubEnv("SLIPOK_BRANCH_ID", "999");
  vi.stubEnv("PLATFORM_PROMPTPAY_ID", "0000000000");
  respond(success());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

describe("manual fallback (O9)", () => {
  it.each(["SLIPOK_API_KEY", "SLIPOK_BRANCH_ID", "PLATFORM_PROMPTPAY_ID"])(
    "does not call SlipOK with missing %s",
    async (variable) => {
      vi.stubEnv(variable, "");
      expect((await verifySlip(args, context)).result).toBe("review");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it.each(["../999", "999?redirect=evil", "not-a-branch"])(
    "rejects invalid branch configuration %s without network",
    async (branch) => {
      vi.stubEnv("SLIPOK_BRANCH_ID", branch);
      expect((await verifySlip(args, context)).result).toBe("review");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it.each([
    {},
    { ...context, orderCreatedAt: undefined },
    { ...context, orderCreatedAt: "invalid" },
    { ...context, orderCreatedAt: "2026-11-11T03:00:00" },
    { ...context, orderCreatedAt: "2026-11-12T03:00:00Z" },
    { ...context, branchReceiverConfirmed: false },
  ])("requires trustworthy server order context %j", async (value) => {
    expect((await verifySlip(args, value)).result).toBe("review");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("SlipOK request and successful verification", () => {
  it("uploads only the image, uses the reviewed branch/key/log contract and returns only slipRef", async () => {
    expect(await getPaymentProvider(context).verifySlip(args)).toEqual({
      result: "verified",
      slipRef: "FICTIONALREF001",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.slipok.com/api/line/apikey/999");
    expect(options).toMatchObject({
      method: "POST",
      headers: { "x-authorization": "fictional-key" },
      redirect: "error",
      cache: "no-store",
    });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    const form = options?.body as FormData;
    expect([...form.keys()]).toEqual(["files", "log"]);
    expect(form.get("log")).toBe("true");
    const file = form.get("files") as File;
    expect(file.type).toBe("image/png");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(png);
    expect(form.has("amount")).toBe(false);
  });
  it("uploads JPEG with the correct filename/type", async () => {
    await verifySlip({ ...args, slipBytes: new Uint8Array([255, 216, 255, 0]) }, context);
    const file = (fetchMock.mock.calls[0][1]?.body as FormData).get("files") as File;
    expect(file.type).toBe("image/jpeg");
    expect(file.name).toBe("slip.jpg");
  });
  it.each([12345, 12345.0, "12345.00"])("compares %s as exact baht, not satang", async (amount) => {
    respond(success({ amount }));
    expect((await verifySlip({ ...args, expectedAmountSatang: 1234500 }, context)).result).toBe(
      "verified",
    );
  });
  it("accepts a transfer exactly at order creation", async () => {
    respond(success({ transTimestamp: context.orderCreatedAt }));
    expect((await verifySlip(args, context)).result).toBe("verified");
  });
  it("compares timezone offsets as instants", async () => {
    respond(success({ transTimestamp: "2026-11-11T10:00:01+07:00" }));
    expect((await verifySlip(args, context)).result).toBe("verified");
  });
  it("does not log API keys, account details, image bytes or raw provider errors", async () => {
    const logs = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
    ];
    await verifySlip(args, context);
    fetchMock.mockRejectedValue(new Error("fictional-key private-account-image"));
    expect((await verifySlip(args, context)).result).toBe("review");
    logs.forEach((log) => expect(log).not.toHaveBeenCalled());
  });
});

describe("slip rejection and uncertainty", () => {
  it("rejects mismatched amount", async () => {
    respond(success({ amount: 123.44 }));
    expect(await verifySlip(args, context)).toMatchObject({
      result: "rejected",
      reason: expect.stringContaining("ยอดเงิน"),
    });
  });
  it("rejects a slip from before the order by one millisecond", async () => {
    respond(success({ transTimestamp: "2026-11-11T02:59:59.999Z" }));
    expect(await verifySlip(args, context)).toMatchObject({
      result: "rejected",
      reason: expect.stringContaining("ก่อนสร้างออเดอร์"),
    });
  });
  it.each([
    { transTimestamp: "2026-11-11T04:00:00.001Z" },
    { transTimestamp: "bad-time" },
    { transTimestamp: undefined },
    { transTimestamp: "2026-02-30T03:00:00Z" },
    { transRef: "" },
    { transRef: " " },
    { amount: "123.451" },
    { amount: "90071992547409.92" },
    { amount: "not-money" },
    { success: false },
    { countryCode: "US" },
    { paidLocalCurrency: "840" },
  ])("requires review for untrustworthy response %j", async (overrides) => {
    respond(success(overrides));
    expect((await verifySlip(args, context)).result).toBe("review");
  });
  it.each([
    {},
    { success: true },
    { success: false, data: success().data },
    { success: "true", data: success().data },
  ])("does not infer success from malformed envelope %j", async (body) => {
    respond(body);
    expect((await verifySlip(args, context)).result).toBe("review");
  });
  it.each([401, 403, 429, 500, 503])(
    "HTTP %i cannot verify even with a success-shaped body",
    async (status) => {
      respond(success(), status);
      expect((await verifySlip(args, context)).result).toBe("review");
    },
  );
  it("malformed JSON needs review", async () => {
    fetchMock.mockResolvedValue(new Response("not-json"));
    expect((await verifySlip(args, context)).result).toBe("review");
  });
  it("does not accept an error code hidden in a success-shaped HTTP 200 envelope", async () => {
    respond({ ...success(), code: 1014 });
    expect((await verifySlip(args, context)).result).toBe("review");
  });
  it.each([
    new Error("network"),
    new DOMException("timeout", "TimeoutError"),
    new DOMException("abort", "AbortError"),
  ])("network/timeout/abort cannot verify", async (error) => {
    fetchMock.mockRejectedValue(error);
    expect((await verifySlip(args, context)).result).toBe("review");
  });
  it("invalid image fails validation before network", async () => {
    await expect(
      verifySlip({ ...args, slipBytes: new Uint8Array([1, 2, 3]) }, context),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("documented SlipOK errors", () => {
  it("maps duplicate slip 1012 to the contract's 409, even when data.success is true", async () => {
    respond({ code: 1012, data: success().data }, 400);
    await expect(verifySlip(args, context)).rejects.toMatchObject({
      code: "PAYMENT_DUPLICATE_SLIP",
      status: 409,
    });
  });
  it.each([1005, 1006, 1007, 1008, 1011, 1013, 1014])(
    "rejects invalid slip/amount/receiver code %i",
    async (code) => {
      respond({ code, data: success().data }, 400);
      expect((await verifySlip(args, context)).result).toBe("rejected");
    },
  );
  it.each([1000, 1001, 1002, 1003, 1004, 1009, 1010, 9999])(
    "requires manual review for configuration/quota/delay/unknown code %i",
    async (code) => {
      respond({ code }, 400);
      expect((await verifySlip(args, context)).result).toBe("review");
    },
  );
});
