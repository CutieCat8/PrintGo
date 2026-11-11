import { describe, expect, it } from "vitest";
import {
  cleanOriginalName,
  isPendingPathOf,
  orderPathFor,
  pendingPath,
  sanitizeStorageName,
  toObjectKey,
} from "./paths";

const U = "11111111-1111-4111-8111-111111111111";
const CUSTOMER = "22222222-2222-4222-8222-222222222222";
const ORDER = "33333333-3333-4333-8333-333333333333";

describe("sanitizeStorageName", () => {
  const name = (
    n: string,
    mime: "application/pdf" | "image/jpeg" | "image/png" = "application/pdf",
  ) => sanitizeStorageName(n, mime, U);

  it("keeps a plain name and uses the extension of the mime type", () => {
    expect(name("report.pdf")).toBe(`${U}-report.pdf`);
    expect(name("photo.jpeg", "image/jpeg")).toBe(`${U}-photo.jpg`);
    expect(name("scan.PNG", "image/png")).toBe(`${U}-scan.png`);
  });

  it("drops any folder part: ../../etc/passwd and Windows paths", () => {
    expect(name("../../etc/passwd")).toBe(`${U}-passwd.pdf`);
    expect(name("..\\..\\windows\\system32\\evil.pdf")).toBe(`${U}-evil.pdf`);
    expect(name("/abs/path/file.pdf")).toBe(`${U}-file.pdf`);
  });

  it("never lets the name change the extension (a pdf cannot be stored as .html)", () => {
    expect(name("evil.html")).toBe(`${U}-evil.pdf`);
    expect(name("a.pdf.exe")).toBe(`${U}-a.pdf.pdf`);
  });

  it("turns a Thai-only name into 'file' (the real name stays in original_name)", () => {
    expect(name("รายงานประจำเดือน.pdf")).toBe(`${U}-file.pdf`);
  });

  it("keeps the Latin part of a mixed name and removes spaces and odd characters", () => {
    expect(name("รายงาน report final (1).pdf")).toBe(`${U}-report_final_1.pdf`);
    expect(name("a b\tc\nd?e*f|g<h>.pdf")).toBe(`${U}-a_b_c_d_e_f_g_h.pdf`);
  });

  it("removes control characters and null bytes", () => {
    expect(name("bad\u0000name\u0007.pdf")).toBe(`${U}-bad_name.pdf`);
  });

  it("caps a very long name", () => {
    const out = name(`${"a".repeat(500)}.pdf`);
    expect(out).toBe(`${U}-${"a".repeat(80)}.pdf`);
    expect(out.length).toBeLessThan(140);
  });

  it("falls back to 'file' for names that are only dots or symbols", () => {
    expect(name("...")).toBe(`${U}-file.pdf`);
    expect(name("..")).toBe(`${U}-file.pdf`);
    expect(name(".pdf")).toBe(`${U}-file.pdf`);
    expect(name("???")).toBe(`${U}-file.pdf`);
  });

  it("only produces characters that are safe in a storage key", () => {
    const hostile = ["a/b", "a\\b", "ก๊อ", "name%2F..%2F", "x;rm -rf", "💥.pdf", "\u202egnp.pdf"];
    for (const n of hostile) expect(name(n)).toMatch(/^[0-9a-f-]{36}-[A-Za-z0-9._-]+\.pdf$/);
  });

  it("gives different names for the same input (uuid)", () => {
    expect(sanitizeStorageName("a.pdf", "application/pdf")).not.toBe(
      sanitizeStorageName("a.pdf", "application/pdf"),
    );
  });
});

describe("cleanOriginalName", () => {
  it("keeps Thai names and drops folders and control characters", () => {
    expect(cleanOriginalName("รายงาน 1.pdf")).toBe("รายงาน 1.pdf");
    expect(cleanOriginalName("../../etc/passwd")).toBe("passwd");
    expect(cleanOriginalName("a\u0000b\u202e.pdf")).toBe("ab.pdf");
  });
  it("caps the length and never returns an empty name", () => {
    expect(Array.from(cleanOriginalName("ก".repeat(400))).length).toBe(255);
    expect(cleanOriginalName("   ")).toBe("file");
    expect(cleanOriginalName("/")).toBe("file");
  });
});

describe("paths", () => {
  it("pendingPath is under the customer's own pending folder", () => {
    expect(pendingPath(CUSTOMER, "x.pdf")).toBe(`order-files/pending/${CUSTOMER}/x.pdf`);
    expect(() => pendingPath("../other", "x.pdf")).toThrow();
  });

  it("toObjectKey strips the bucket and rejects unsafe paths", () => {
    expect(toObjectKey(`order-files/pending/${CUSTOMER}/x.pdf`)).toBe(`pending/${CUSTOMER}/x.pdf`);
    for (const bad of [
      "payment-slips/a/b.png",
      "order-files/../secret/x.pdf",
      "order-files/a/../b.pdf",
      "order-files//x.pdf",
      "order-files/a\\b.pdf",
      "order-files/x.pdf",
      "/order-files/a/b.pdf",
      "",
    ]) {
      expect(toObjectKey(bad)).toBeNull();
    }
  });

  it("isPendingPathOf accepts only this customer's pending files", () => {
    const mine = `order-files/pending/${CUSTOMER}/x.pdf`;
    expect(isPendingPathOf(CUSTOMER, mine)).toBe(true);
    expect(isPendingPathOf("someone-else", mine)).toBe(false);
    expect(isPendingPathOf(CUSTOMER, `order-files/pending/${CUSTOMER}/sub/x.pdf`)).toBe(false);
    expect(isPendingPathOf(CUSTOMER, `order-files/${ORDER}/x.pdf`)).toBe(false);
    expect(isPendingPathOf(CUSTOMER, `order-files/pending/${CUSTOMER}/../x/x.pdf`)).toBe(false);
    expect(isPendingPathOf(CUSTOMER, `payment-slips/pending/${CUSTOMER}/x.pdf`)).toBe(false);
  });

  it("orderPathFor keeps the file name and moves it under the order", () => {
    expect(orderPathFor(ORDER, `order-files/pending/${CUSTOMER}/x.pdf`)).toBe(
      `order-files/${ORDER}/x.pdf`,
    );
    expect(() => orderPathFor(ORDER, "order-files/a/../b.pdf")).toThrow();
    expect(() => orderPathFor("not-a-uuid", `order-files/pending/${CUSTOMER}/x.pdf`)).toThrow();
  });
});
