import { describe, expect, it } from "vitest";
import { fromDb, toDb } from "./case";

describe("fromDb / toDb", () => {
  it("converts snake_case column names to camelCase keys", () => {
    expect(fromDb({ order_no: "PG-0001", print_subtotal_satang: 12000 })).toEqual({
      orderNo: "PG-0001",
      printSubtotalSatang: 12000,
    });
  });

  it("converts camelCase keys back to snake_case columns", () => {
    expect(toDb({ shopId: "s1", pricePerPageSatang: 100 })).toEqual({
      shop_id: "s1",
      price_per_page_satang: 100,
    });
  });

  it("leaves values untouched, including null and nested objects", () => {
    const nested = { some_key: 1 };
    expect(fromDb({ paid_at: null, payload_json: nested })).toEqual({
      paidAt: null,
      payloadJson: nested,
    });
  });

  it("keeps digits and already-simple names intact", () => {
    expect(fromDb({ p256dh: "k", id: "1" })).toEqual({ p256dh: "k", id: "1" });
    expect(toDb({ p256dh: "k", id: "1" })).toEqual({ p256dh: "k", id: "1" });
  });

  it("round-trips a row", () => {
    const row = { auth_user_id: "u", ready_in_minutes: 15, delivery_lat: null };
    expect(toDb(fromDb(row))).toEqual(row);
  });
});
