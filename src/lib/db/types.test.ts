import { describe, expect, it } from "vitest";
import { columnName, fromDb } from "./case";
import { ENUMS } from "./enums";
import { TABLES, ConfirmOrderBody, EtaBody, OrderRow, Payment, parseRow } from "./types";

describe("TABLES registry", () => {
  it("round-trips every field name through the snake/camel conversion", () => {
    // If this fails, a field name cannot be mapped to a column and back unchanged.
    for (const schema of Object.values(TABLES)) {
      for (const field of Object.keys(schema.shape)) {
        const column = columnName(field);
        expect(Object.keys(fromDb({ [column]: 1 }))).toEqual([field]);
      }
    }
  });
});

describe("ENUMS", () => {
  it("lists the order statuses of the state machine, terminal ones last", () => {
    expect(ENUMS.OrderStatus).toEqual([
      "submitted",
      "awaiting_payment",
      "paid",
      "printing",
      "ready",
      "courier_requested",
      "in_transit",
      "completed",
      "rejected",
      "cancelled",
      "expired",
    ]);
  });
});

const orderDbRow = {
  id: "00000000-0000-4000-8000-000000000001",
  created_at: "2026-11-12T08:30:00.000Z",
  order_no: "PG-0001",
  customer_id: "00000000-0000-4000-8000-000000000002",
  shop_id: "00000000-0000-4000-8000-000000000003",
  status: "awaiting_payment",
  fulfillment: "pickup",
  delivery_address: null,
  delivery_lat: null,
  delivery_lng: null,
  delivery_recipient_name: null,
  delivery_recipient_phone: null,
  customer_note: null,
  requires_manual_price: false,
  estimated_print_satang: 12000,
  estimated_services_satang: 0,
  print_subtotal_satang: 12000,
  platform_fee_satang: 600,
  delivery_fee_satang: 0,
  total_satang: 12600,
  reject_reason: null,
  response_deadline: "2026-11-12T08:45:00.000Z",
  payment_deadline: "2026-11-12T09:00:00.000Z",
  ready_in_minutes: 30,
  estimated_ready_at: null,
  ready_note: null,
  pickup_code: null,
  paid_at: null,
  completed_at: null,
  updated_at: "2026-11-12T08:30:00.000Z",
};

describe("parseRow", () => {
  it("turns a snake_case database row into a typed camelCase row", () => {
    const order = parseRow(OrderRow, orderDbRow);
    expect(order.orderNo).toBe("PG-0001");
    expect(order.totalSatang).toBe(12600);
  });

  it("rejects a row whose enum value is unknown", () => {
    expect(() => parseRow(OrderRow, { ...orderDbRow, status: "shipped" })).toThrow();
  });

  it("rejects money that is not an integer number of satang", () => {
    expect(() => parseRow(OrderRow, { ...orderDbRow, total_satang: 126.5 })).toThrow();
  });
});

describe("Payment as sent to clients", () => {
  it("never carries the slip path or slip reference", () => {
    const payment = Payment.parse({
      id: "00000000-0000-4000-8000-000000000009",
      status: "pending_review",
      amountSatang: 12600,
      rejectReason: null,
      createdAt: "2026-11-12T08:30:00.000Z",
      slipPath: "payment-slips/secret.png",
      slipRef: "REF123",
    });
    expect(payment).not.toHaveProperty("slipPath");
    expect(payment).not.toHaveProperty("slipRef");
  });
});

describe("ConfirmOrderBody", () => {
  const at = "2026-11-13T05:00:00.000Z";

  it("accepts a ready time counted from payment", () => {
    expect(ConfirmOrderBody.safeParse({ readyInMinutes: 15 }).success).toBe(true);
  });

  it("accepts a fixed ready time, a price and a note", () => {
    const body = {
      estimatedReadyAt: at,
      printSubtotalSatang: 63000,
      readyNote: "รับได้หลังเที่ยง",
    };
    expect(ConfirmOrderBody.safeParse(body).success).toBe(true);
  });

  it("requires exactly one way of giving the ready time (D19)", () => {
    expect(ConfirmOrderBody.safeParse({}).success).toBe(false);
    expect(ConfirmOrderBody.safeParse({ readyInMinutes: 15, estimatedReadyAt: at }).success).toBe(
      false,
    );
  });

  it.each([4, 2881, 15.5])("rejects readyInMinutes = %s (allowed: whole minutes 5-2880)", (n) => {
    expect(ConfirmOrderBody.safeParse({ readyInMinutes: n }).success).toBe(false);
  });

  it("accepts the boundaries 5 and 2880", () => {
    expect(ConfirmOrderBody.safeParse({ readyInMinutes: 5 }).success).toBe(true);
    expect(ConfirmOrderBody.safeParse({ readyInMinutes: 2880 }).success).toBe(true);
  });

  it("rejects a note over 200 characters", () => {
    expect(
      ConfirmOrderBody.safeParse({ readyInMinutes: 15, readyNote: "ก".repeat(201) }).success,
    ).toBe(false);
  });

  it.each([0, -1, 12.5])("rejects printSubtotalSatang = %s", (n) => {
    expect(ConfirmOrderBody.safeParse({ readyInMinutes: 15, printSubtotalSatang: n }).success).toBe(
      false,
    );
  });
});

describe("EtaBody", () => {
  it("needs an ISO time", () => {
    expect(EtaBody.safeParse({ estimatedReadyAt: "2026-11-13T05:00:00.000Z" }).success).toBe(true);
    expect(EtaBody.safeParse({ estimatedReadyAt: "tomorrow noon" }).success).toBe(false);
    expect(EtaBody.safeParse({}).success).toBe(false);
  });
});
