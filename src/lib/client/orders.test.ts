import { describe, expect, it } from "vitest";
import {
  bangkokDate,
  bangkokIso,
  bangkokTime,
  bangkokWeekday,
  etaText,
  formatCountdown,
  isThaiPhone,
  nextBangkokDate,
} from "./format";
import { customerCanCancel, customerMoney, describeOrderProblem, orderSteps } from "./orders";
import { toCreateOrderRequest, filesReady, type DraftFile, type OrderDraft } from "./draft";

const baseMoney = {
  requiresManualPrice: false,
  estimatedPrintSatang: 500,
  estimatedServicesSatang: 3000,
  printSubtotalSatang: null,
  platformFeeSatang: null,
  deliveryFeeSatang: 0,
  totalSatang: null,
  fulfillment: "pickup" as const,
};

describe("customerMoney", () => {
  it("shows the system estimate before the shop confirms", () => {
    const m = customerMoney(baseMoney)!;
    expect(m.estimate).toBe(true);
    expect(m.lines.map((l) => l.satang)).toEqual([500, 3000]);
    expect(m.total).toBeNull();
  });

  it("hides every number for a manual-price order the shop has not priced (rule 7)", () => {
    expect(customerMoney({ ...baseMoney, requiresManualPrice: true })).toBeNull();
    expect(
      customerMoney({ ...baseMoney, requiresManualPrice: true, estimatedPrintSatang: null }),
    ).toBeNull();
  });

  it("after confirmation shows only the shop's price, never the old estimate (API.md §5 #18)", () => {
    const m = customerMoney({
      ...baseMoney,
      printSubtotalSatang: 3500,
      platformFeeSatang: 300,
      totalSatang: 3800,
    })!;
    expect(m.estimate).toBe(false);
    expect(m.lines.map((l) => l.satang)).toEqual([3500, 300]);
    expect(m.lines.some((l) => l.satang === 500)).toBe(false);
    expect(m.total).toBe(3800);
  });

  it("adds the delivery fee line for delivery orders", () => {
    const m = customerMoney({ ...baseMoney, fulfillment: "delivery", deliveryFeeSatang: 4000 })!;
    expect(m.lines.at(-1)).toMatchObject({ label: "ค่าส่ง", satang: 4000 });
  });
});

describe("orderSteps", () => {
  it("marks earlier steps done and the current one current", () => {
    const steps = orderSteps({
      status: "printing",
      fulfillment: "pickup",
      paymentDeadline: "x",
      payment: null,
    });
    expect(steps.map((s) => s.state)).toEqual([
      "done",
      "done",
      "done",
      "current",
      "upcoming",
      "upcoming",
    ]);
  });

  it("delivery has the courier steps", () => {
    const steps = orderSteps({
      status: "in_transit",
      fulfillment: "delivery",
      paymentDeadline: "x",
      payment: null,
    });
    expect(steps).toHaveLength(8);
    expect(steps.find((s) => s.state === "current")?.key).toBe("in_transit");
  });

  it("completed marks everything done", () => {
    const steps = orderSteps({
      status: "completed",
      fulfillment: "pickup",
      paymentDeadline: "x",
      payment: null,
    });
    expect(steps.every((s) => s.state === "done")).toBe(true);
  });

  it("shows where a stopped order stopped", () => {
    expect(
      orderSteps({
        status: "expired",
        fulfillment: "pickup",
        paymentDeadline: null,
        payment: null,
      }).at(-1),
    ).toMatchObject({ key: "submitted", state: "failed", title: "หมดเวลา" });
    expect(
      orderSteps({
        status: "cancelled",
        fulfillment: "pickup",
        paymentDeadline: "x",
        payment: null,
      }).at(-1),
    ).toMatchObject({ key: "awaiting_payment", state: "failed" });
    expect(
      orderSteps({
        status: "rejected",
        fulfillment: "pickup",
        paymentDeadline: "x",
        payment: { status: "verified" },
      }).at(-1),
    ).toMatchObject({ key: "printing", state: "failed", title: "ร้านปฏิเสธ" });
  });
});

describe("customerCanCancel (D19)", () => {
  it("only before payment", () => {
    expect(customerCanCancel("submitted")).toBe(true);
    expect(customerCanCancel("awaiting_payment")).toBe(true);
    for (const s of ["paid", "printing", "ready", "completed"] as const) {
      expect(customerCanCancel(s)).toBe(false);
    }
  });
});

describe("Bangkok time", () => {
  it("builds +07:00 instants and reads them back", () => {
    const iso = bangkokIso("2026-11-12", "12:00");
    expect(new Date(iso).toISOString()).toBe("2026-11-12T05:00:00.000Z");
    expect(bangkokTime(new Date(iso))).toBe("12:00");
    expect(bangkokDate(new Date("2026-11-11T18:30:00Z"))).toBe("2026-11-12"); // 01:30 Bangkok
  });

  it("weekday and next day", () => {
    expect(bangkokWeekday("2026-11-15")).toBe(0); // Sunday
    expect(nextBangkokDate("2026-12-31")).toBe("2027-01-01");
  });

  it("ETA text in both forms (D19)", () => {
    const now = new Date("2026-11-11T03:00:00Z"); // 10:00 Bangkok
    expect(etaText({ readyInMinutes: 90, estimatedReadyAt: null }, now)).toBe(
      "เสร็จประมาณ 1 ชม. 30 นาทีหลังชำระเงิน",
    );
    expect(etaText({ readyInMinutes: null, estimatedReadyAt: "2026-11-12T05:00:00Z" }, now)).toBe(
      "เสร็จประมาณ พรุ่งนี้ 12:00 น.",
    );
    expect(etaText({ readyInMinutes: null, estimatedReadyAt: null }, now)).toBeNull();
  });

  it("countdown", () => {
    expect(formatCountdown(65_000)).toBe("1:05");
    expect(formatCountdown(-1)).toBe("0:00");
    expect(formatCountdown(3_725_000)).toBe("1:02:05");
  });
});

describe("isThaiPhone", () => {
  it("accepts 9-10 digits starting with 0", () => {
    expect(isThaiPhone("0812345678")).toBe(true);
    expect(isThaiPhone("081-234-5678")).toBe(true);
    expect(isThaiPhone("021234567")).toBe(true);
    expect(isThaiPhone("812345678")).toBe(false);
    expect(isThaiPhone("08123")).toBe(false);
  });
});

const file = (over: Partial<DraftFile> = {}): DraftFile => ({
  key: "k",
  name: "a.pdf",
  mime: "application/pdf",
  sizeBytes: 100,
  path: "order-files/pending/x/a.pdf",
  upload: "done",
  progress: 1,
  pageCount: 3,
  pageWarning: null,
  counting: false,
  color: "bw",
  paper: "A4",
  sides: "single",
  copies: 1,
  extras: [],
  ...over,
});

const draft = (over: Partial<OrderDraft> = {}): OrderDraft => ({
  files: [file()],
  note: "",
  shopId: "s",
  fulfillment: "pickup",
  delivery: { name: "", phone: "", address: "" },
  services: [],
  ...over,
});

describe("order draft", () => {
  it("is ready only when every file is uploaded and valid", () => {
    expect(filesReady(draft())).toBe(true);
    expect(filesReady(draft({ files: [] }))).toBe(false);
    expect(filesReady(draft({ files: [file({ upload: "uploading" })] }))).toBe(false);
    expect(filesReady(draft({ files: [file({ pageCount: null })] }))).toBe(false);
    expect(filesReady(draft({ files: [file({ copies: 100 })] }))).toBe(false);
    expect(filesReady(draft({ note: "x".repeat(501) }))).toBe(false);
  });

  it("sends delivery fields only for delivery with a position", () => {
    const d = draft({
      fulfillment: "delivery",
      delivery: { name: " A ", phone: "0812345678", address: "B" },
    });
    const withPos = toCreateOrderRequest(d, "s", { lat: 1, lng: 2 });
    expect(withPos).toMatchObject({ deliveryLat: 1, deliveryRecipientName: "A" });
    const pickup = toCreateOrderRequest(draft(), "s", { lat: 1, lng: 2 });
    expect(pickup).not.toHaveProperty("deliveryLat");
    expect(pickup).not.toHaveProperty("deliveryRecipientName");
  });
});

describe("describeOrderProblem", () => {
  const names = ["report.pdf", "poster.png"];

  it("names the file a shop cannot print and suggests another shop", () => {
    const p = describeOrderProblem(
      {
        code: "VALIDATION_ERROR",
        message: "ร้านนี้ไม่รับงานชุดค่านี้",
        details: { fileIndex: 1, color: "color", paper: "A3", sides: "double" },
      },
      names,
    );
    expect(p.pickAnotherShop).toBe(true);
    expect(p.fileIndex).toBe(1);
    expect(p.message).toContain("poster.png");
    expect(p.message).toContain("สี A3 สองด้าน");
  });

  it("closed or paused shop -> pick another shop", () => {
    for (const code of ["SHOP_CLOSED", "SHOP_PAUSED"]) {
      expect(describeOrderProblem({ code, message: "x", details: {} }, names).pickAnotherShop).toBe(
        true,
      );
    }
  });

  it("other file problems keep the API message and add the file name", () => {
    const p = describeOrderProblem(
      { code: "VALIDATION_ERROR", message: "จำนวนหน้าไม่ถูกต้อง", details: { fileIndex: 0 } },
      names,
    );
    expect(p).toEqual({
      message: 'จำนวนหน้าไม่ถูกต้อง (ไฟล์ "report.pdf")',
      pickAnotherShop: false,
      fileIndex: 0,
    });
  });

  it("anything else passes the message through", () => {
    expect(
      describeOrderProblem({ code: "INTERNAL", message: "ระบบขัดข้อง", details: {} }, names),
    ).toEqual({ message: "ระบบขัดข้อง", pickAnotherShop: false, fileIndex: null });
  });
});
