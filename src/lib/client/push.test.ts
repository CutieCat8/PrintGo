import { describe, expect, it } from "vitest";
import { urlBase64ToBytes } from "./push";

describe("urlBase64ToBytes", () => {
  it("decodes URL-safe base64 without padding", () => {
    // "hello?>" -> aGVsbG8_Pg in URL-safe base64 (contains _ and no padding)
    expect(Array.from(urlBase64ToBytes("aGVsbG8_Pg"))).toEqual(
      Array.from(new TextEncoder().encode("hello?>")),
    );
  });

  it("decodes a 65-byte VAPID public key shape", () => {
    const bytes = new Uint8Array(65).map((_, i) => (i * 7) % 256);
    const encoded = Buffer.from(bytes)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(Array.from(urlBase64ToBytes(encoded))).toEqual(Array.from(bytes));
  });
});
