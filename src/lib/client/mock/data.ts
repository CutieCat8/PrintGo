import type {
  Delivery,
  Message,
  OrderFile,
  OrderService,
  OrderStatus,
  Payment,
  Shop,
  ShopService,
} from "@/lib/db/types";
import type { ShopHour, ShopPricing } from "../types";

/**
 * Sample data for the mock API. ตัวอย่างสมมติ: no real people, shops or prices.
 * Shop ids, names, coordinates and prices follow supabase/seed.sql so mock and real look alike.
 */

export type MockShop = {
  shop: Shop;
  hours: ShopHour[];
  pricing: ShopPricing;
  services: ShopService[];
  /** Mock only: fixed open/closed state instead of computing it from the hours. */
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
};

/** Everything the server would know about an order. Views for customer/shop are cut from this. */
export type MockOrder = {
  id: string;
  orderNo: string;
  customerId: string;
  shopId: string;
  status: OrderStatus;
  fulfillment: "pickup" | "delivery";
  deliveryAddress: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryRecipientName: string | null;
  deliveryRecipientPhone: string | null;
  customerNote: string | null;
  requiresManualPrice: boolean;
  estimatedPrintSatang: number | null;
  estimatedServicesSatang: number | null;
  printSubtotalSatang: number | null;
  platformFeeSatang: number | null;
  deliveryFeeSatang: number;
  totalSatang: number | null;
  rejectReason: string | null;
  responseDeadline: string;
  paymentDeadline: string | null;
  readyInMinutes: number | null;
  estimatedReadyAt: string | null;
  readyNote: string | null;
  pickupCode: string | null;
  paidAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  files: OrderFile[];
  services: OrderService[];
  payment: Payment | null;
  delivery: Delivery | null;
  /** Wrong pickup-code attempts (for RATE_LIMITED). */
  codeAttempts: number;
};

export type MockMessage = Message & { readAt: string | null };

export type MockDb = {
  customerId: string;
  /** The shop the dashboard is signed in as. */
  myShopId: string;
  shops: MockShop[];
  orders: MockOrder[];
  messages: MockMessage[];
  nextOrderNo: number;
};

export const SHOP_A = "00000000-0000-4000-8000-0000000000a1";
export const SHOP_B = "00000000-0000-4000-8000-0000000000a2";
export const SHOP_C = "00000000-0000-4000-8000-0000000000a3";
const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";

/** Stable uuid for seed rows: prefix + 12 hex digits. */
const sid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

function withoutRule(p: ShopPricing, color: string, paper: string, sides: string): ShopPricing {
  return {
    ...p,
    rules: p.rules.filter((r) => !(r.color === color && r.paper === paper && r.sides === sides)),
  };
}

function pricing(extra: number, tiers: ShopPricing["tiers"]): ShopPricing {
  const base: [ShopPricing["rules"][number]["color"], "A4" | "A3", "single" | "double", number][] =
    [
      ["bw", "A4", "single", 100],
      ["bw", "A4", "double", 80],
      ["color", "A4", "single", 500],
      ["color", "A4", "double", 400],
      ["bw", "A3", "single", 300],
      ["bw", "A3", "double", 250],
      ["color", "A3", "single", 1500],
      ["color", "A3", "double", 1200],
    ];
  return {
    rules: base.map(([color, paper, sides, price]) => ({
      color,
      paper,
      sides,
      pricePerPageSatang: price + extra,
    })),
    tiers,
  };
}

function hours(open: string, close: string, closedSunday = false): ShopHour[] {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    openTime: `${open}:00`,
    closeTime: `${close}:00`,
    isClosed: closedSunday && weekday === 0,
  }));
}

function service(
  n: number,
  name: string,
  priceSatang: number | null,
  unit: "per_set" | "per_order",
  sortOrder: number,
): ShopService {
  return { id: sid(0x500 + n), name, priceSatang, unit, isActive: true, sortOrder };
}

export function createSeed(now = Date.now()): MockDb {
  const at = (minutes: number) => new Date(now + minutes * 60_000).toISOString();

  const shops: MockShop[] = [
    {
      shop: {
        id: SHOP_A,
        name: "ร้านตัวอย่าง A",
        phone: "0800000001",
        address: "ที่อยู่ตัวอย่างสมมติ A เชียงใหม่",
        lat: 18.7953,
        lng: 98.9534,
        status: "active",
        isPaused: false,
        acceptsDelivery: true,
        cutoffMinutes: 30,
      },
      hours: hours("09:00", "20:00"),
      // Shop A does not print colour A3 double-sided, to show "ร้านนี้ไม่รับงานแบบ ..." in mock mode
      pricing: withoutRule(
        pricing(0, [{ minPages: 200, note: "200 หน้าขึ้นไป ร้านคิดราคาพิเศษ (ตัวอย่างสมมติ)" }]),
        "color",
        "A3",
        "double",
      ),
      services: [
        service(1, "เย็บมุม", 500, "per_set", 1),
        service(2, "ปกใส", 1500, "per_set", 2),
        service(3, "เข้าเล่มสันกาว", null, "per_set", 3),
      ],
      isOpen: true,
      opensAt: "09:00",
      closesAt: "20:00",
    },
    {
      shop: {
        id: SHOP_B,
        name: "ร้านตัวอย่าง B",
        phone: "0800000002",
        address: "ที่อยู่ตัวอย่างสมมติ B เชียงใหม่",
        lat: 18.8003,
        lng: 98.9505,
        status: "active",
        isPaused: false,
        acceptsDelivery: true,
        cutoffMinutes: 30,
      },
      hours: hours("09:00", "18:00", true),
      pricing: pricing(0, []),
      services: [
        service(4, "เย็บมุม", 300, "per_set", 1),
        service(5, "เจาะรู", 200, "per_order", 2),
      ],
      isOpen: false,
      opensAt: "09:00",
      closesAt: "18:00",
    },
    {
      shop: {
        id: SHOP_C,
        name: "ร้านตัวอย่าง C",
        phone: "0800000003",
        address: "ที่อยู่ตัวอย่างสมมติ C เชียงใหม่",
        lat: 18.7885,
        lng: 98.9918,
        status: "active",
        isPaused: true,
        acceptsDelivery: false,
        cutoffMinutes: 30,
      },
      hours: hours("10:00", "22:00"),
      pricing: pricing(10, [{ minPages: 300, note: null }]),
      services: [
        service(6, "เคลือบ", 2000, "per_set", 1),
        service(7, "สันเกลียว", 3500, "per_set", 2),
        service(8, "ทำปกแข็ง", null, "per_order", 3),
      ],
      isOpen: true,
      opensAt: "10:00",
      closesAt: "22:00",
    },
  ];

  const file = (
    n: number,
    originalName: string,
    pageCount: number,
    color: "bw" | "color",
    copies: number,
  ): OrderFile => ({
    id: sid(0x200 + n),
    originalName,
    mime: originalName.endsWith(".png") ? "image/png" : "application/pdf",
    sizeBytes: 250_000 * pageCount,
    pageCount,
    color,
    paper: "A4",
    sides: "single",
    copies,
  });

  const blank = {
    customerId: CUSTOMER,
    shopId: SHOP_A,
    fulfillment: "pickup" as const,
    deliveryAddress: null,
    deliveryLat: null,
    deliveryLng: null,
    deliveryRecipientName: null,
    deliveryRecipientPhone: null,
    customerNote: null,
    requiresManualPrice: false,
    estimatedServicesSatang: 0,
    printSubtotalSatang: null,
    platformFeeSatang: null,
    deliveryFeeSatang: 0,
    totalSatang: null,
    rejectReason: null,
    paymentDeadline: null,
    readyInMinutes: null,
    estimatedReadyAt: null,
    readyNote: null,
    pickupCode: null,
    paidAt: null,
    completedAt: null,
    services: [] as OrderService[],
    payment: null,
    delivery: null,
    codeAttempts: 0,
  };

  const delivered = {
    fulfillment: "delivery" as const,
    deliveryAddress: "หอพักตัวอย่างสมมติ ห้อง 305 ฝากไว้ที่ป้อมยาม",
    deliveryLat: 18.8,
    deliveryLng: 98.96,
    deliveryRecipientName: "ลูกค้าตัวอย่าง",
    deliveryRecipientPhone: "0899999999",
    deliveryFeeSatang: 4800,
  };

  /** A paid order's money columns: subtotal + fee (5%, min ฿3) + delivery. */
  const paidMoney = (print: number, deliveryFee = 0) => {
    const fee = Math.max(300, Math.ceil((print * 5) / 100));
    return {
      estimatedPrintSatang: print,
      printSubtotalSatang: print,
      platformFeeSatang: fee,
      totalSatang: print + fee + deliveryFee,
    };
  };

  const payment = (n: number, amount: number, minutesAgo: number): Payment => ({
    id: sid(0x300 + n),
    status: "verified",
    amountSatang: amount,
    rejectReason: null,
    createdAt: at(-minutesAgo),
  });

  const orders: MockOrder[] = [
    {
      ...blank,
      id: sid(0x101),
      orderNo: "PG-0001",
      status: "submitted",
      customerNote: "ขอเย็บมุมซ้ายบนนะคะ",
      estimatedPrintSatang: 2100,
      estimatedServicesSatang: 1000,
      responseDeadline: at(12),
      createdAt: at(-3),
      updatedAt: at(-3),
      files: [file(1, "รายงาน.pdf", 8, "bw", 2), file(2, "โปสเตอร์.png", 1, "color", 1)],
      services: [
        {
          id: sid(0x401),
          name: "เย็บมุม",
          unit: "per_set",
          unitPriceSatang: 500,
          fileId: sid(0x201),
          quantity: 2,
          lineTotalSatang: 1000,
        },
      ],
    },
    {
      ...blank,
      id: sid(0x102),
      orderNo: "PG-0002",
      status: "submitted",
      requiresManualPrice: true,
      estimatedPrintSatang: 25000,
      responseDeadline: at(2),
      createdAt: at(-13),
      updatedAt: at(-13),
      files: [file(3, "ชีทเรียน.pdf", 125, "bw", 2)],
      services: [
        {
          id: sid(0x402),
          name: "เข้าเล่มสันกาว",
          unit: "per_set",
          unitPriceSatang: null,
          fileId: sid(0x203),
          quantity: 2,
          lineTotalSatang: null,
        },
      ],
    },
    {
      ...blank,
      id: sid(0x103),
      orderNo: "PG-0003",
      status: "awaiting_payment",
      ...paidMoney(2200),
      responseDeadline: at(-10),
      paymentDeadline: at(25),
      readyInMinutes: 15,
      createdAt: at(-20),
      updatedAt: at(-5),
      files: [file(4, "สไลด์นำเสนอ.pdf", 22, "bw", 1)],
    },
    {
      ...blank,
      id: sid(0x104),
      orderNo: "PG-0004",
      status: "paid",
      ...paidMoney(4000),
      responseDeadline: at(-50),
      readyInMinutes: 60,
      estimatedReadyAt: at(40),
      pickupCode: "4821",
      paidAt: at(-20),
      createdAt: at(-60),
      updatedAt: at(-20),
      files: [file(5, "แบบฟอร์ม.pdf", 8, "color", 1)],
      payment: payment(4, 4300, 20),
    },
    {
      ...blank,
      ...delivered,
      id: sid(0x105),
      orderNo: "PG-0005",
      status: "printing",
      ...paidMoney(3000, 4800),
      responseDeadline: at(-80),
      estimatedReadyAt: at(-5),
      readyNote: "ขอเวลาเพิ่มนิดหน่อย",
      pickupCode: null,
      paidAt: at(-60),
      createdAt: at(-90),
      updatedAt: at(-30),
      files: [file(6, "วิทยานิพนธ์บทที่1.pdf", 30, "bw", 1)],
      payment: payment(5, 8100, 60),
    },
    {
      ...blank,
      id: sid(0x106),
      orderNo: "PG-0006",
      status: "ready",
      ...paidMoney(1500),
      responseDeadline: at(-100),
      estimatedReadyAt: at(-10),
      pickupCode: "7314",
      paidAt: at(-70),
      createdAt: at(-110),
      updatedAt: at(-10),
      files: [file(7, "ใบสมัคร.pdf", 3, "color", 1)],
      payment: payment(6, 1800, 70),
    },
    {
      ...blank,
      ...delivered,
      id: sid(0x107),
      orderNo: "PG-0007",
      status: "courier_requested",
      ...paidMoney(1200, 4800),
      responseDeadline: at(-120),
      estimatedReadyAt: at(-15),
      paidAt: at(-100),
      createdAt: at(-130),
      updatedAt: at(-8),
      files: [file(8, "เอกสารประกอบ.pdf", 12, "bw", 1)],
      payment: payment(7, 6300, 100),
      delivery: {
        id: sid(0x601),
        provider: "manual",
        status: "pending_admin",
        feeSatang: null,
        trackingUrl: null,
        note: null,
        updatedAt: at(-8),
      },
    },
    {
      ...blank,
      ...delivered,
      id: sid(0x108),
      orderNo: "PG-0008",
      status: "in_transit",
      ...paidMoney(800, 4800),
      responseDeadline: at(-200),
      estimatedReadyAt: at(-40),
      paidAt: at(-180),
      createdAt: at(-210),
      updatedAt: at(-25),
      files: [file(9, "การบ้าน.pdf", 8, "bw", 1)],
      payment: payment(8, 5900, 180),
      delivery: {
        id: sid(0x602),
        provider: "manual",
        status: "in_transit",
        feeSatang: 4800,
        trackingUrl: "https://example.com/track/mock",
        note: "ไรเดอร์ตัวอย่างสมมติ",
        updatedAt: at(-25),
      },
    },
    {
      ...blank,
      id: sid(0x109),
      orderNo: "PG-0009",
      status: "completed",
      ...paidMoney(2200),
      responseDeadline: at(-1500),
      estimatedReadyAt: at(-1440),
      paidAt: at(-1450),
      completedAt: at(-1400),
      createdAt: at(-1500),
      updatedAt: at(-1400),
      files: [file(10, "รายงานกลุ่ม.pdf", 22, "bw", 1)],
      payment: payment(9, 2500, 1450),
    },
    {
      ...blank,
      id: sid(0x10a),
      orderNo: "PG-0010",
      status: "rejected",
      estimatedPrintSatang: 600,
      rejectReason: "ไฟล์มีรหัสผ่าน/ไฟล์เสีย",
      responseDeadline: at(-2880),
      createdAt: at(-2890),
      updatedAt: at(-2885),
      files: [file(11, "ไฟล์ล็อก.pdf", 6, "bw", 1)],
    },
    {
      ...blank,
      id: sid(0x10b),
      orderNo: "PG-0011",
      status: "cancelled",
      estimatedPrintSatang: 1000,
      responseDeadline: at(-4320),
      createdAt: at(-4330),
      updatedAt: at(-4325),
      files: [file(12, "ร่างแรก.pdf", 10, "bw", 1)],
    },
    {
      ...blank,
      id: sid(0x10c),
      orderNo: "PG-0012",
      shopId: SHOP_B,
      status: "expired",
      estimatedPrintSatang: 500,
      responseDeadline: at(-5745),
      createdAt: at(-5760),
      updatedAt: at(-5745),
      files: [file(13, "ตารางเรียน.png", 1, "color", 1)],
    },
  ];

  const msg = (
    n: number,
    orderId: string,
    sender: MockMessage["sender"],
    body: string,
    minutesAgo: number,
    read: boolean,
  ): MockMessage => ({
    id: sid(0x700 + n),
    orderId,
    sender,
    body,
    createdAt: at(-minutesAgo),
    readAt: read ? at(-minutesAgo + 1) : null,
  });

  const messages: MockMessage[] = [
    msg(1, sid(0x101), "customer", "สวัสดีค่ะ ไฟล์โปสเตอร์ขอสีสดหน่อยนะคะ", 2, false),
    msg(2, sid(0x104), "shop", "ได้รับงานแล้วค่ะ จะรีบปริ้นให้นะคะ", 15, false),
    msg(3, sid(0x105), "system", "ร้านปรับเวลาเสร็จประมาณ (ตัวอย่างสมมติ)", 30, true),
    msg(4, sid(0x109), "customer", "รับงานแล้ว ขอบคุณค่ะ", 1400, true),
    msg(5, sid(0x109), "shop", "ขอบคุณที่ใช้บริการค่ะ", 1399, true),
  ];

  return { customerId: CUSTOMER, myShopId: SHOP_A, shops, orders, messages, nextOrderNo: 13 };
}
