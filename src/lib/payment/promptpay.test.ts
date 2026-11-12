import { describe, expect, it } from "vitest";
import { createPromptPayCharge, createPromptPayPayload, crc16 } from "./promptpay";

// Illustrative fictional IDs only. These fixtures are NOT real payment accounts.
const PHONE = "0000000000";
const TAX_ID = "0000000000000";

describe("PromptPay payload", () => {
  it("matches the published CRC-16/CCITT-FALSE check vector", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  // Fixed reference payloads generated with promptpay-qr 0.5.0 for fictional IDs.
  // Compare the complete wire format, not just our CRC function against itself.
  it.each([
    [
      PHONE,
      1,
      "00020101021229370016A000000677010111011300660000000005802TH530376454040.0163048E96",
    ],
    [
      TAX_ID,
      2200,
      "00020101021229370016A000000677010111021300000000000005802TH5303764540522.006304049D",
    ],
    [
      PHONE,
      99999999,
      "00020101021229370016A000000677010111011300660000000005802TH53037645409999999.99630422B2",
    ],
  ])("matches reference for %s at %i satang", (id, amount, reference) => {
    expect(createPromptPayPayload(id, amount)).toBe(reference);
  });

  it.each([
    [5, "0.05"],
    [99, "0.99"],
    [100, "1.00"],
    [101, "1.01"],
    [12345, "123.45"],
    [999999999999, "9999999999.99"],
  ])("preserves the exact amount %i", (satang, amount) => {
    const payload = createPromptPayPayload(PHONE, satang);
    const fields = new Map<string, string>();
    let offset = 0;
    while (offset < payload.length) {
      const tag = payload.slice(offset, offset + 2);
      const length = Number(payload.slice(offset + 2, offset + 4));
      fields.set(tag, payload.slice(offset + 4, offset + 4 + length));
      offset += 4 + length;
    }
    expect(offset).toBe(payload.length);
    expect(fields.get("54")).toBe(amount);
    expect(fields.get("01")).toBe("12");
    expect(fields.get("53")).toBe("764");
    expect(fields.get("58")).toBe("TH");
  });

  it.each([
    0,
    -1,
    0.5,
    12345.1,
    NaN,
    Infinity,
    -Infinity,
    1000000000000,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects invalid satang %s", (amount) => {
    expect(() => createPromptPayPayload(PHONE, amount)).toThrow(
      expect.objectContaining({ code: "VALIDATION_ERROR", status: 422 }),
    );
  });

  it.each([
    "",
    "000",
    "000000000",
    "00000000000",
    "1000000000",
    "000000000000000",
    "000-000-0000",
    " 0000000000",
    "0000000000\n",
    "0000000000000\n",
    "abcdefghij",
    "๐๐๐๐๐๐๐๐๐๐",
  ])("rejects malformed ID %j without silently sanitizing it", (id) => {
    expect(() => createPromptPayPayload(id, 1)).toThrow(
      expect.objectContaining({ code: "VALIDATION_ERROR", status: 422 }),
    );
  });

  it("renders an actual PNG with the reference payload", async () => {
    const result = await createPromptPayCharge(PHONE, 1);
    expect(result.promptpayPayload).toBe(createPromptPayPayload(PHONE, 1));
    expect(result.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    const png = Buffer.from(result.qrDataUrl.split(",")[1], "base64");
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(384);
    expect(png.readUInt32BE(20)).toBe(384);
  });
});
