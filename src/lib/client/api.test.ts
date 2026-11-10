import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { Message, Order, OrderDetail, Shop, ShopMe, ShopService } from "@/lib/db/types";
import { ApiClientError, toApiClientError } from "./http";
import { mockApi, mockConfig, resetMock } from "./mock/server";
import {
  Charge,
  ChatList,
  EstimateResult,
  FileUrl,
  ShopHour,
  ShopListItem,
  ShopPricing,
  SlipResult,
  UploadSignResult,
} from "./types";

const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000a2";
const C = "00000000-0000-4000-8000-0000000000a3";
const file = {
  pageCount: 10,
  color: "bw" as const,
  paper: "A4" as const,
  sides: "single" as const,
  copies: 1,
};
const upload = {
  ...file,
  path: "order-files/pending/x/a.pdf",
  originalName: "a.pdf",
  mime: "application/pdf",
  sizeBytes: 1000,
};

beforeEach(() => {
  resetMock();
  mockConfig.delay = false;
  mockConfig.params = {};
});

async function code(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiClientError);
    return (e as ApiClientError).code;
  }
  throw new Error("expected the call to fail");
}

describe("mock returns exactly the contract shapes", () => {
  it("customer reads", async () => {
    z.array(ShopListItem).parse(await mockApi.listShops());
    z.array(ShopListItem).parse(await mockApi.listShops({ lat: 18.8, lng: 98.96 }));
    const orders = z.array(Order.strict()).parse(await mockApi.listMyOrders());
    expect(new Set(orders.map((o) => o.status)).size).toBe(11); // every status has a sample
    for (const o of orders) OrderDetail.strict().parse(await mockApi.getMyOrder(o.id));
    ChatList.parse(await mockApi.listMyChats());
    z.array(Message.strict()).parse(await mockApi.listMyMessages(orders[0].id));
    UploadSignResult.parse(
      await mockApi.signUploads({
        files: [{ name: "a.pdf", mime: "application/pdf", sizeBytes: 10 }],
      }),
    );
  });

  it("shop reads", async () => {
    ShopMe.parse(await mockApi.getShopMe());
    Shop.strict().parse(await mockApi.getShopProfile());
    z.array(ShopHour).parse(await mockApi.getShopHours());
    ShopPricing.parse(await mockApi.getShopPricing());
    z.array(ShopService.strict()).parse(await mockApi.listShopServices());
    const orders = z.array(Order.strict()).parse(await mockApi.listShopOrders());
    const detail = OrderDetail.strict().parse(await mockApi.getShopOrder(orders[0].id));
    FileUrl.parse(await mockApi.getShopFileUrl(detail.id, detail.files[0].id, "download"));
    ChatList.parse(await mockApi.listShopChats());
  });

  it("estimate, create and pay", async () => {
    const est = EstimateResult.parse(
      await mockApi.estimate({ shopId: A, fulfillment: "pickup", files: [file] }),
    );
    expect(est).toMatchObject({
      estimatedPrintSatang: 1000,
      platformFeeSatang: 300,
      totalSatang: 1300,
    });
    const order = Order.strict().parse(
      await mockApi.createOrder({ shopId: A, fulfillment: "pickup", files: [upload] }),
    );
    expect(order.status).toBe("submitted");
    await mockApi.confirmOrder(order.id, { readyInMinutes: 30 });
    Charge.parse(await mockApi.createCharge(order.id));
    SlipResult.parse(await mockApi.submitSlip(order.id, "payment-slips/x.jpg"));
    const paid = await mockApi.getMyOrder(order.id);
    expect(paid.status).toBe("paid");
    expect(paid.pickupCode).toMatch(/^\d{4}$/);
    expect(paid.estimatedReadyAt).not.toBeNull();
  });
});

describe("mock follows the contract rules", () => {
  it("hides manual prices from the customer but not the shop", async () => {
    const orders = await mockApi.listMyOrders();
    const manual = orders.find((o) => o.requiresManualPrice && o.status === "submitted")!;
    expect(manual.estimatedPrintSatang).toBeNull();
    expect((await mockApi.getShopOrder(manual.id)).estimatedPrintSatang).not.toBeNull();
    const est = await mockApi.estimate({
      shopId: A,
      fulfillment: "pickup",
      files: [{ ...file, pageCount: 250 }],
    });
    expect(est).toMatchObject({
      requiresManualPrice: true,
      totalSatang: null,
      platformFeeSatang: null,
    });
  });

  it("never gives the shop the pickup code or the recipient", async () => {
    for (const o of await mockApi.listShopOrders()) {
      const d = await mockApi.getShopOrder(o.id);
      expect(d.pickupCode).toBeNull();
      expect(d.deliveryRecipientName).toBeNull();
      expect(d.deliveryRecipientPhone).toBeNull();
    }
    const custReady = (await mockApi.listMyOrders()).find(
      (o) => o.status === "ready" && o.fulfillment === "pickup",
    )!;
    expect(custReady.pickupCode).toMatch(/^\d{4}$/);
  });

  it("rejects closed/paused shops and bad transitions", async () => {
    expect(
      await code(mockApi.createOrder({ shopId: B, fulfillment: "pickup", files: [upload] })),
    ).toBe("SHOP_CLOSED");
    expect(
      await code(mockApi.createOrder({ shopId: C, fulfillment: "pickup", files: [upload] })),
    ).toBe("SHOP_PAUSED");
    const paid = (await mockApi.listMyOrders()).find((o) => o.status === "paid")!;
    expect(await code(mockApi.cancelMyOrder(paid.id))).toBe("ORDER_INVALID_TRANSITION"); // D19
  });

  it("requires a ready time, and a price for manual orders", async () => {
    const shopOrders = await mockApi.listShopOrders(["submitted"]);
    const normal = shopOrders.find((o) => !o.requiresManualPrice)!;
    const manual = shopOrders.find((o) => o.requiresManualPrice)!;
    expect(await code(mockApi.confirmOrder(normal.id, {}))).toBe("VALIDATION_ERROR");
    expect(await code(mockApi.confirmOrder(manual.id, { readyInMinutes: 30 }))).toBe(
      "MANUAL_PRICE_REQUIRED",
    );
    const ok = await mockApi.confirmOrder(manual.id, {
      readyInMinutes: 30,
      printSubtotalSatang: 20000,
    });
    expect(ok).toMatchObject({
      status: "awaiting_payment",
      platformFeeSatang: 1000,
      totalSatang: 21000,
    });
  });

  it("closes chat on final statuses and tracks unread", async () => {
    const orders = await mockApi.listMyOrders();
    const done = orders.find((o) => o.status === "completed")!;
    expect(await code(mockApi.sendMyMessage(done.id, "hi"))).toBe("CHAT_CLOSED");

    const open = orders.find((o) => o.status === "submitted" && !o.requiresManualPrice)!;
    await mockApi.sendShopMessage(open.id, "ขอถามหน่อยค่ะ");
    expect((await mockApi.listMyChats()).totalUnread).toBeGreaterThan(0);
    await mockApi.markMyMessagesRead(open.id);
    const chats = await mockApi.listMyChats();
    expect(chats.chats.find((c) => c.orderId === open.id)!.unreadMessageCount).toBe(0);
  });

  it("delivery needs a position and books a rider when ready", async () => {
    expect(
      await code(mockApi.estimate({ shopId: A, fulfillment: "delivery", files: [file] })),
    ).toBe("VALIDATION_ERROR");
    const est = await mockApi.estimate({
      shopId: A,
      fulfillment: "delivery",
      deliveryLat: 18.8,
      deliveryLng: 98.96,
      files: [file],
    });
    expect(est.deliveryFeeSatang).toBeGreaterThan(4000);
    const printing = (await mockApi.listShopOrders(["printing"]))[0];
    expect((await mockApi.markReady(printing.id)).status).toBe("courier_requested");
  });

  it("checks the pickup code and rate-limits guesses", async () => {
    const ready = (await mockApi.listShopOrders(["ready"]))[0];
    for (let i = 0; i < 5; i++)
      expect(await code(mockApi.completePickup(ready.id, "0000"))).toBe("VALIDATION_ERROR");
    expect(await code(mockApi.completePickup(ready.id, "7314"))).toBe("RATE_LIMITED");
  });

  it("shop account states from ?mockShop", async () => {
    mockConfig.params = { mockShop: "pending" };
    expect((await mockApi.getShopMe()).state).toBe("pending");
    await mockApi.getShopHours(); // settings allowed while pending
    expect(await code(mockApi.listShopOrders())).toBe("FORBIDDEN");

    mockConfig.params = { mockShop: "no_profile" };
    expect(await mockApi.getShopMe()).toEqual({ state: "no_profile", shop: null });
    const shop = await mockApi.registerShop({
      name: "ร้านใหม่",
      phone: "0811111111",
      address: "ที่อยู่",
      lat: 18.8,
      lng: 98.9,
      acceptsDelivery: true,
    });
    expect(shop.status).toBe("pending");
    expect(
      await code(
        mockApi.registerShop({
          name: "x",
          phone: "1",
          address: "y",
          lat: 0,
          lng: 0,
          acceptsDelivery: false,
        }),
      ),
    ).toBe("ALREADY_REGISTERED");
  });

  it("?mockError forces failures", async () => {
    mockConfig.params = { mockError: "1" };
    expect(await code(mockApi.listShops())).toBe("INTERNAL");
    mockConfig.params = { mockError: "SHOP_CLOSED" };
    expect(await code(mockApi.listShops())).toBe("SHOP_CLOSED");
  });
});

describe("toApiClientError", () => {
  it("reads the CONTRACTS error body", () => {
    const e = toApiClientError(409, {
      error: { code: "CHAT_CLOSED", message: "แชทปิดแล้ว", details: { a: 1 } },
    });
    expect(e).toMatchObject({
      code: "CHAT_CLOSED",
      status: 409,
      message: "แชทปิดแล้ว",
      details: { a: 1 },
    });
  });

  it("falls back to Thai text for unknown or empty bodies", () => {
    expect(toApiClientError(502, null)).toMatchObject({ code: "UNKNOWN", status: 502 });
    expect(toApiClientError(502, null).message).toMatch(/[ก-๙]/);
    expect(toApiClientError(400, { error: { code: "WHAT" } }).code).toBe("UNKNOWN");
    expect(toApiClientError(404, { error: { code: "NOT_FOUND" } }).message).toBe(
      "ไม่พบข้อมูลที่ต้องการ",
    );
  });
});

describe("reviewer fixes", () => {
  it("system messages never count as unread for the customer", async () => {
    const paid = (await mockApi.listMyOrders()).find((o) => o.status === "paid")!;
    await mockApi.markMyMessagesRead(paid.id);
    const later = new Date(Date.now() + 3 * 60 * 60_000).toISOString();
    await mockApi.updateOrderEta(paid.id, { estimatedReadyAt: later }); // adds a system message
    const msgs = await mockApi.listMyMessages(paid.id);
    expect(msgs.at(-1)?.sender).toBe("system");
    expect((await mockApi.getMyOrder(paid.id)).unreadMessageCount).toBe(0);
  });

  it("shop.status follows the account state", async () => {
    for (const state of ["pending", "suspended", "active"] as const) {
      mockConfig.params = { mockShop: state };
      const me = await mockApi.getShopMe();
      expect(me.state).toBe(state);
      expect(me.shop?.status).toBe(state);
    }
  });

  it("bad fileIndexes give VALIDATION_ERROR, not a crash", async () => {
    const corner = "00000000-0000-4000-8000-000000000501"; // เย็บมุม, per_set
    for (const fileIndexes of [[], [5], [-1]]) {
      const body = {
        shopId: A,
        fulfillment: "pickup" as const,
        files: [upload],
        services: [{ serviceId: corner, fileIndexes }],
      };
      expect(await code(mockApi.estimate(body))).toBe("VALIDATION_ERROR");
      expect(await code(mockApi.createOrder(body))).toBe("VALIDATION_ERROR");
    }
  });
});
