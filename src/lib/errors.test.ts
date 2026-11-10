import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, handle } from "./errors";

const req = new Request("http://localhost/api/test");

describe("ApiError", () => {
  it("keeps code, status and details, and falls back to a Thai default message", () => {
    const err = new ApiError("NOT_FOUND", 404, undefined, { id: "x" });
    expect(err.code).toBe("NOT_FOUND");
    expect(err.status).toBe(404);
    expect(err.message).not.toBe("");
    expect(err.details).toEqual({ id: "x" });
  });

  it("uses the given message when provided", () => {
    expect(new ApiError("SHOP_CLOSED", 409, "ร้านปิดแล้ว").message).toBe("ร้านปิดแล้ว");
  });

  it("only accepts the status that CONTRACTS assigns to the code", () => {
    // @ts-expect-error NOT_FOUND must be 404, not 500
    new ApiError("NOT_FOUND", 500);
  });

  it("serialises to the contract error body", () => {
    const body = new ApiError("RATE_LIMITED", 429, "ช้าหน่อย").toBody();
    expect(body).toEqual({ error: { code: "RATE_LIMITED", message: "ช้าหน่อย", details: {} } });
  });
});

describe("handle", () => {
  afterEach(() => vi.restoreAllMocks());

  it("passes through a successful response and forwards the arguments", async () => {
    const ctx = { params: Promise.resolve({ id: "1" }) };
    const fn = vi.fn(async () => Response.json({ ok: true }, { status: 201 }));
    const res = await handle(fn)(req, ctx);
    expect(fn).toHaveBeenCalledWith(req, ctx);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("turns an ApiError into its status and error body", async () => {
    const res = await handle(async () => {
      throw new ApiError("FORBIDDEN", 403, "ไม่มีสิทธิ์");
    })(req, undefined);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: { code: "FORBIDDEN", message: "ไม่มีสิทธิ์", details: {} },
    });
  });

  it("turns a Zod failure into VALIDATION_ERROR 422 with per-field details", async () => {
    const res = await handle(async () => {
      z.object({ name: z.string().min(1) }).parse({ name: "" });
      return Response.json({});
    })(req, undefined);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.issues[0].path).toBe("name");
  });

  it("hides unknown errors behind INTERNAL 500 and logs them server-side", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handle(async () => {
      throw new Error("db password is hunter2");
    })(req, undefined);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL");
    expect(JSON.stringify(body)).not.toContain("hunter2");
    expect(log).toHaveBeenCalled();
  });
});
