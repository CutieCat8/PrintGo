import { afterEach, describe, expect, it, vi } from "vitest";
import { printFromUrl } from "./printFile";

afterEach(() => vi.unstubAllGlobals());

describe("printFromUrl", () => {
  it("returns false when the file cannot be fetched (network or CORS error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await printFromUrl("https://example.test/file.pdf")).toBe(false);
  });

  it("returns false when the server answers with an error status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    expect(await printFromUrl("https://example.test/file.pdf")).toBe(false);
  });
});
