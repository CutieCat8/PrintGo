import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pushMessages } = vi.hoisted(() => ({ pushMessages: vi.fn() }));
vi.mock("./client", () => ({ pushMessages }));

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const stamp = "2026-11-16T05:00:00Z";
const tables: Record<string, unknown[]> = {};

function builder(table: string) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) q[m] = () => q;
  q.maybeSingle = () => Promise.resolve({ data: tables[table]?.[0] ?? null, error: null });
  q.then = (resolve: (v: unknown) => void) => resolve({ data: tables[table] ?? [], error: null });
  return q;
}
vi.mock("@/lib/db/server", () => ({ getServiceClient: () => ({ from: builder }) }));

import { notify } from "./notify";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_LIFF_ID", "LIFF");
  vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "token");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  pushMessages.mockReset().mockResolvedValue(undefined);
  tables.orders = [
    {
      id: ORDER_ID,
      created_at: stamp,
      order_no: "PG-0012",
      customer_id: "22222222-2222-4222-8222-222222222222",
      shop_id: "33333333-3333-4333-8333-333333333333",
      status: "awaiting_payment",
      fulfillment: "pickup",
      delivery_address: null,
      delivery_lat: null,
      delivery_lng: null,
      delivery_recipient_name: null,
      delivery_recipient_phone: null,
      customer_note: null,
      requires_manual_price: false,
      estimated_print_satang: 2000,
      estimated_services_satang: 0,
      print_subtotal_satang: 2000,
      platform_fee_satang: 300,
      delivery_fee_satang: 0,
      total_satang: 2300,
      reject_reason: null,
      response_deadline: stamp,
      payment_deadline: stamp,
      ready_in_minutes: 15,
      estimated_ready_at: null,
      ready_note: null,
      pickup_code: "4821",
      paid_at: null,
      completed_at: null,
      updated_at: stamp,
    },
  ];
  tables.customers = [
    {
      id: "22222222-2222-4222-8222-222222222222",
      created_at: stamp,
      line_user_id: "Uabc",
      display_name: "ลูกค้าตัวอย่าง",
      picture_url: null,
    },
  ];
  tables.shops = [
    {
      id: "33333333-3333-4333-8333-333333333333",
      created_at: stamp,
      name: "ร้านตัวอย่าง",
      phone: "0800000000",
      address: "ตัวอย่างสมมติ",
      lat: 13.7,
      lng: 100.5,
      status: "active",
      is_paused: false,
      accepts_delivery: true,
      cutoff_minutes: 0,
    },
  ];
  tables.order_services = [];
  tables.payments = [];
  tables.messages = [];
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("notify", () => {
  it("pushes the message to the order's own customer", async () => {
    await notify(ORDER_ID, "quote_ready");
    expect(pushMessages).toHaveBeenCalledTimes(1);
    const [to, messages] = pushMessages.mock.calls[0];
    expect(to).toBe("Uabc");
    expect(messages).toHaveLength(1);
    expect(JSON.stringify(messages)).toContain("23.00 บาท");
  });

  it("chat_message uses the shop's latest message", async () => {
    tables.messages = [{ body: "ไฟล์หน้า 3 อ่านไม่ออกค่ะ" }];
    await notify(ORDER_ID, "chat_message");
    expect(JSON.stringify(pushMessages.mock.calls[0][1])).toContain("ไฟล์หน้า 3");
  });

  it("payment_rejected shows the stored reason", async () => {
    tables.payments = [{ reject_reason: "ยอดไม่ตรง" }];
    await notify(ORDER_ID, "payment_rejected");
    expect(JSON.stringify(pushMessages.mock.calls[0][1])).toContain("ยอดไม่ตรง");
  });

  it("throws when LINE refuses, so callers can log it and chat keeps push_sent_at unset", async () => {
    pushMessages.mockRejectedValue(new Error("LINE API answered 429"));
    await expect(notify(ORDER_ID, "printing")).rejects.toThrow("429");
  });

  it("skips quietly without LINE settings or when the order is gone", async () => {
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "");
    await expect(notify(ORDER_ID, "printing")).resolves.toBeUndefined();
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "token");
    tables.orders = [];
    await expect(notify(ORDER_ID, "printing")).resolves.toBeUndefined();
    expect(pushMessages).not.toHaveBeenCalled();
  });
});
