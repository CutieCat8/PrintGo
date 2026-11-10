import { describe, expect, it } from "vitest";
import { verifyLineSignature } from "./signature";

// Signature produced independently with openssl, following LINE's documented procedure:
//   echo -n '<body>' | openssl dgst -sha256 -hmac '<secret>' -binary | openssl base64
const secret = "test-channel-secret";
const body = '{"destination":"U8e742f61d673b39c7fff3cecb7536ef0","events":[]}';
const signature = "fy2Z2vqUfwiR00hzCqDTDwDTM453tacm9RR1yuB1/4g=";

describe("verifyLineSignature", () => {
  it("accepts the signature LINE would send for this exact body", () => {
    expect(verifyLineSignature(secret, body, signature)).toBe(true);
  });

  it("rejects a body that changed by even one character", () => {
    expect(verifyLineSignature(secret, body.replace("events", "evants"), signature)).toBe(false);
  });

  it("rejects a signature made with another secret", () => {
    expect(verifyLineSignature("other-secret", body, signature)).toBe(false);
  });

  it("rejects a missing, empty or wrong-length signature without throwing", () => {
    expect(verifyLineSignature(secret, body, null)).toBe(false);
    expect(verifyLineSignature(secret, body, "")).toBe(false);
    expect(verifyLineSignature(secret, body, "short")).toBe(false);
  });

  it("checks the raw text as received: reformatting the JSON breaks it", () => {
    const pretty = JSON.stringify(JSON.parse(body), null, 2);
    expect(verifyLineSignature(secret, pretty, signature)).toBe(false);
  });

  it("handles a Thai body (UTF-8)", () => {
    const thai = '{"events":[{"message":{"text":"สวัสดี"}}]}';
    // same openssl command as above, run on the UTF-8 bytes of `thai`
    expect(verifyLineSignature(secret, thai, "eo830phXqBGp6CVEMdz0qzyouUCdy32g/tu18LiSV/g=")).toBe(
      true,
    );
  });
});
