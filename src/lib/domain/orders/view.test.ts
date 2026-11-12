import { describe, expect, it } from "vitest";
import {
  OrderRow,
  parseRow,
  type DeliveryRow,
  type OrderFileRow,
  type PaymentRow,
} from "@/lib/db/types";
import {
  presentCustomerOrderDetail,
  presentOrder,
  presentShopOrderDetail,
  type DetailParts,
} from "./view";

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const T = "2026-11-12T05:00:00.000Z";

function row(over: Record<string, unknown> = {}): OrderRow {
  return parseRow(OrderRow, {
    id: u(1),
    created_at: T,
    order_no: "PG-0001",
    customer_id: u(2),
    shop_id: u(3),
    status: "paid",
    fulfillment: "delivery",
    delivery_address: "123 ถนนสมมติ",
    delivery_lat: 18.8,
    delivery_lng: 98.9,
    delivery_recipient_name: "สมชาย ใจดี",
    delivery_recipient_phone: "0812345678",
    customer_note: null,
    requires_manual_price: false,
    estimated_print_satang: 1000,
    estimated_services_satang: 0,
    print_subtotal_satang: 1000,
    platform_fee_satang: 300,
    delivery_fee_satang: 4000,
    total_satang: 5300,
    reject_reason: null,
    response_deadline: T,
    payment_deadline: null,
    ready_in_minutes: null,
    estimated_ready_at: null,
    ready_note: null,
    pickup_code: "4821",
    paid_at: T,
    completed_at: null,
    updated_at: T,
    ...over,
  });
}

const parts = (): DetailParts => ({
  shop: { id: u(3), name: "ร้าน", address: "ที่อยู่", phone: "0800000000" },
  files: [
    {
      id: u(10),
      createdAt: T,
      orderId: u(1),
      storagePath: "order-files/secret/path.pdf",
      originalName: "a.pdf",
      mime: "application/pdf",
      sizeBytes: 10,
      pageCount: 1,
      color: "bw",
      paper: "A4",
      sides: "single",
      copies: 1,
      deletedAt: null,
    } as OrderFileRow,
  ],
  services: [],
  payment: {
    id: u(11),
    createdAt: T,
    orderId: u(1),
    amountSatang: 5300,
    status: "verified",
    slipPath: "payment-slips/x.png",
    slipRef: "REF",
    verifiedBy: "admin",
    verifiedAt: T,
    rejectReason: null,
  } as PaymentRow,
  delivery: {
    id: u(12),
    createdAt: T,
    orderId: u(1),
    provider: "manual",
    providerRef: "internal-ref",
    status: "booked",
    feeSatang: null,
    trackingUrl: null,
    note: null,
    updatedAt: T,
  } as DeliveryRow,
});

describe("the shop's view of an order (CLAUDE.md rule 10)", () => {
  it("never carries the pickup code, even for a pickup order that is paid", () => {
    const pickup = row({
      fulfillment: "pickup",
      delivery_address: null,
      delivery_lat: null,
      delivery_lng: null,
      delivery_recipient_name: null,
      delivery_recipient_phone: null,
      delivery_fee_satang: 0,
      total_satang: 1300,
    });
    expect(presentOrder(pickup, { shopName: "ร้าน", viewer: "customer" }).pickupCode).toBe("4821");
    expect(presentOrder(pickup, { shopName: "ร้าน", viewer: "shop" }).pickupCode).toBeNull();
    expect(JSON.stringify(presentShopOrderDetail(pickup, parts()))).not.toContain("4821");
  });

  it("OrderDetail for the shop has no recipient name or phone, the customer's has them", () => {
    const shop = presentShopOrderDetail(row(), parts());
    expect(Object.keys(shop)).not.toContain("deliveryRecipientName");
    expect(Object.keys(shop)).not.toContain("deliveryRecipientPhone");
    const text = JSON.stringify(shop);
    expect(text).not.toContain("สมชาย");
    expect(text).not.toContain("0812345678");
    expect(shop.deliveryAddress).toBe("123 ถนนสมมติ");

    const customer = presentCustomerOrderDetail(row(), parts());
    expect(customer.deliveryRecipientName).toBe("สมชาย ใจดี");
    expect(customer.deliveryRecipientPhone).toBe("0812345678");
  });

  it("the shop sees the real estimate even when the price is manual", () => {
    const manual = row({ status: "submitted", requires_manual_price: true });
    expect(presentOrder(manual, { shopName: "ร้าน", viewer: "shop" }).estimatedPrintSatang).toBe(
      1000,
    );
    expect(
      presentOrder(manual, { shopName: "ร้าน", viewer: "customer" }).estimatedPrintSatang,
    ).toBeNull();
  });

  it("no view leaks storage paths, slips or provider references", () => {
    for (const view of [
      presentShopOrderDetail(row(), parts()),
      presentCustomerOrderDetail(row(), parts()),
    ]) {
      const text = JSON.stringify(view);
      for (const secret of [
        "storagePath",
        "secret/path",
        "slipPath",
        "slipRef",
        "payment-slips",
        "REF",
        "internal-ref",
        "providerRef",
        "customerId",
      ]) {
        expect(text).not.toContain(secret);
      }
    }
  });
});
