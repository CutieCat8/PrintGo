import {
  ConfirmOrderBody,
  EtaBody,
  type Message,
  type Order,
  type OrderDetail,
  type OrderService,
  type OrderStatus,
  type Shop,
  type ShopMe,
  type ShopService,
} from "@/lib/db/types";
import type { ErrorCode } from "@/lib/errors";
import { ApiClientError } from "../http";
import { EstimateResult } from "../types";
import type { Api } from "../real";
import type {
  ChatList,
  CreateOrderRequest,
  EstimateRequest,
  FileSettingInput,
  SelectedService,
  ShopHour,
  ShopListItem,
  ShopPricing,
} from "../types";
import { createSeed, type MockDb, type MockMessage, type MockOrder, type MockShop } from "./data";

/**
 * In-memory fake of the API (CONTRACTS 6.1-6.3), used when NEXT_PUBLIC_USE_MOCK=true.
 * It follows the state machine (section 4) and money rules (section 5) closely enough to click
 * through every screen. It is NOT the real pricing code: pages must never copy maths from here.
 * Data lives in memory and resets on reload. All of it is ตัวอย่างสมมติ.
 *
 * URL switches (read on each call):
 *   ?mockError=1 | random | <ERROR_CODE>   make calls fail
 *   ?mockShop=no_profile | pending | active | suspended   shop account state (default active)
 *   ?mockSlip=verified | pending_review | rejected        slip check result (default verified)
 */

// --- settings --------------------------------------------------------------------------------

const STATUS_OF: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  ORDER_INVALID_TRANSITION: 409,
  SHOP_CLOSED: 409,
  SHOP_PAUSED: 409,
  MANUAL_PRICE_REQUIRED: 409,
  PAYMENT_DUPLICATE_SLIP: 409,
  PAYMENT_AMOUNT_MISMATCH: 409,
  CHAT_CLOSED: 409,
  ALREADY_REGISTERED: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

const TERMINAL: OrderStatus[] = ["completed", "rejected", "cancelled", "expired"];
const SHOP_RESPONSE_MINUTES = 15; // DECISIONS O2 default
const PAYMENT_WINDOW_MINUTES = 30; // DECISIONS O3 default
const MAX_FILES = 10; // O6
const MAX_FILE_BYTES = 20 * 1024 * 1024; // O6
const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"];

/** Tests turn off the delay and set switches without a URL. */
export const mockConfig: { delay: boolean; params: Record<string, string> | null } = {
  delay: typeof window !== "undefined",
  params: null,
};

function param(name: string): string | null {
  if (mockConfig.params) return mockConfig.params[name] ?? null;
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

function fail(code: ErrorCode, message?: string, details?: Record<string, unknown>): never {
  throw new ApiClientError(code, STATUS_OF[code], message, details);
}

/** Runs before every mock call: network delay + forced errors. */
async function gate() {
  if (mockConfig.delay) await new Promise((r) => setTimeout(r, 300 + Math.random() * 300));
  const forced = param("mockError");
  if (!forced) return;
  if (forced === "random") {
    if (Math.random() < 1 / 3) fail("INTERNAL");
    return;
  }
  fail(forced in STATUS_OF ? (forced as ErrorCode) : "INTERNAL");
}

// --- store -----------------------------------------------------------------------------------

let db: MockDb | null = null;
let shopState: ShopMe["state"] | null = null;

function store(): MockDb {
  db ??= createSeed();
  return db;
}

/** Back to the seed data (tests, or the dev helper). */
export function resetMock() {
  db = null;
  shopState = null;
}

const clone = <T>(v: T): T => structuredClone(v);
const nowIso = () => new Date().toISOString();
const plusMinutes = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
const newId = () => crypto.randomUUID();

function findShop(id: string): MockShop {
  return store().shops.find((s) => s.shop.id === id) ?? fail("NOT_FOUND", "ไม่พบร้านนี้");
}

function findOrder(id: string): MockOrder {
  return store().orders.find((o) => o.id === id) ?? fail("NOT_FOUND", "ไม่พบออเดอร์นี้");
}

function myCustomerOrder(id: string): MockOrder {
  const o = findOrder(id);
  if (o.customerId !== store().customerId) fail("NOT_FOUND", "ไม่พบออเดอร์นี้");
  return o;
}

function myShopOrder(id: string): MockOrder {
  requireActiveShop();
  const o = findOrder(id);
  if (o.shopId !== store().myShopId) fail("NOT_FOUND", "ไม่พบออเดอร์นี้");
  return o;
}

/** Moves an order like transition(): only from the allowed statuses, else ORDER_INVALID_TRANSITION. */
function move(o: MockOrder, from: OrderStatus[], to: OrderStatus, patch: Partial<MockOrder> = {}) {
  if (!from.includes(o.status)) fail("ORDER_INVALID_TRANSITION");
  Object.assign(o, patch, { status: to, updatedAt: nowIso() });
}

/** awaiting_payment -> paid: pickup code + ready time from readyInMinutes (CONTRACTS 4). */
function markPaid(o: MockOrder) {
  const paidAt = nowIso();
  move(o, ["awaiting_payment"], "paid", {
    paidAt,
    pickupCode: String(1000 + Math.floor(Math.random() * 9000)),
    estimatedReadyAt:
      o.readyInMinutes !== null
        ? new Date(Date.parse(paidAt) + o.readyInMinutes * 60_000).toISOString()
        : o.estimatedReadyAt,
  });
}

function feeFor(printSubtotal: number) {
  return Math.max(300, Math.ceil((printSubtotal * 5) / 100)); // CONTRACTS 5: 5%, min ฿3, ceil
}

// --- views -----------------------------------------------------------------------------------

type Side = "customer" | "shop";

function unreadFor(orderId: string, side: Side) {
  return store().messages.filter(
    (m) =>
      m.orderId === orderId &&
      !m.readAt &&
      (side === "customer" ? m.sender === "shop" : m.sender === "customer"), // system never counts (CONTRACTS 3)
  ).length;
}

function toOrder(o: MockOrder, side: Side): Order {
  const hidePrice = side === "customer" && o.requiresManualPrice && o.status === "submitted";
  const showCode =
    side === "customer" &&
    o.fulfillment === "pickup" &&
    ["paid", "printing", "ready"].includes(o.status);
  return {
    id: o.id,
    orderNo: o.orderNo,
    status: o.status,
    fulfillment: o.fulfillment,
    shopId: o.shopId,
    shopName: findShop(o.shopId).shop.name,
    customerNote: o.customerNote,
    requiresManualPrice: o.requiresManualPrice,
    estimatedPrintSatang: hidePrice ? null : o.estimatedPrintSatang,
    estimatedServicesSatang: hidePrice ? null : o.estimatedServicesSatang,
    printSubtotalSatang: o.printSubtotalSatang,
    platformFeeSatang: o.platformFeeSatang,
    deliveryFeeSatang: o.deliveryFeeSatang,
    totalSatang: o.totalSatang,
    rejectReason: o.rejectReason,
    responseDeadline: o.responseDeadline,
    paymentDeadline: o.paymentDeadline,
    pickupCode: showCode ? o.pickupCode : null,
    readyInMinutes: o.readyInMinutes,
    estimatedReadyAt: o.estimatedReadyAt,
    readyNote: o.readyNote,
    unreadMessageCount: unreadFor(o.id, side),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function toDetail(o: MockOrder, side: Side): OrderDetail {
  const s = findShop(o.shopId).shop;
  const forShop = side === "shop";
  return clone({
    ...toOrder(o, side),
    files: o.files,
    services: o.services,
    payment: o.payment,
    delivery: o.delivery,
    deliveryAddress: o.deliveryAddress,
    deliveryRecipientName: forShop ? null : o.deliveryRecipientName, // shop never sees these
    deliveryRecipientPhone: forShop ? null : o.deliveryRecipientPhone,
    shop: { id: s.id, name: s.name, address: s.address, phone: s.phone },
  });
}

function toMessage(m: MockMessage): Message {
  return { id: m.id, orderId: m.orderId, sender: m.sender, body: m.body, createdAt: m.createdAt };
}

function chatsFor(orders: MockOrder[], side: Side): ChatList {
  const all = store().messages;
  const rows = orders
    .map((o) => {
      const mine = all.filter((m) => m.orderId === o.id);
      const last = mine.at(-1) ?? null;
      return { o, last };
    })
    .filter(({ o, last }) => !TERMINAL.includes(o.status) || last)
    .sort((a, b) =>
      (b.last?.createdAt ?? b.o.createdAt).localeCompare(a.last?.createdAt ?? a.o.createdAt),
    )
    .map(({ o, last }) => ({
      orderId: o.id,
      orderNo: o.orderNo,
      shopName: findShop(o.shopId).shop.name,
      status: o.status,
      isClosed: TERMINAL.includes(o.status),
      lastMessage: last
        ? { sender: last.sender, body: last.body, createdAt: last.createdAt }
        : null,
      unreadMessageCount: unreadFor(o.id, side),
    }));
  return { totalUnread: rows.reduce((n, r) => n + r.unreadMessageCount, 0), chats: rows };
}

// --- pricing (mock copy of CONTRACTS 5, for sample numbers only) ------------------------------

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function deliveryFee(shop: Shop, lat: number, lng: number) {
  return 4000 + Math.ceil(1000 * km(shop, { lat, lng })); // DECISIONS O5 sample formula
}

function priceFiles(ms: MockShop, files: FileSettingInput[]) {
  const unsupported: number[] = [];
  let print = 0;
  let pages = 0;
  files.forEach((f, i) => {
    const rule = ms.pricing.rules.find(
      (r) => r.color === f.color && r.paper === f.paper && r.sides === f.sides,
    );
    const filePages = f.pageCount * f.copies;
    pages += filePages;
    if (!rule) unsupported.push(i);
    else print += filePages * rule.pricePerPageSatang;
  });
  if (unsupported.length) {
    fail("VALIDATION_ERROR", "ร้านนี้ไม่รับงานชุดค่านี้ กรุณาเลือกร้านอื่น", {
      fileIndexes: unsupported,
    });
  }
  return { print, pages };
}

function serviceLines(ms: MockShop, files: FileSettingInput[], selected: SelectedService[] = []) {
  return selected.map((sel) => {
    const svc = ms.services.find((s) => s.id === sel.serviceId && s.isActive);
    if (!svc) fail("VALIDATION_ERROR", "ไม่พบบริการเสริมที่เลือก");
    const indexes = sel.fileIndexes ?? files.map((_, i) => i);
    const badIndex = indexes.some((i) => !Number.isInteger(i) || i < 0 || i >= files.length);
    if (svc.unit === "per_set" && (indexes.length === 0 || badIndex)) {
      fail("VALIDATION_ERROR", `เลือกไฟล์ที่ใช้บริการ "${svc.name}" ไม่ถูกต้อง`);
    }
    const quantity = svc.unit === "per_set" ? indexes.reduce((n, i) => n + files[i].copies, 0) : 1;
    return {
      svc,
      indexes,
      line: {
        serviceId: svc.id,
        name: svc.name,
        unit: svc.unit,
        unitPriceSatang: svc.priceSatang,
        quantity,
        lineTotalSatang: svc.priceSatang === null ? null : svc.priceSatang * quantity,
      },
    };
  });
}

function computeEstimate(
  body: EstimateRequest,
): EstimateResult & { print: number; services: number } {
  const ms = findShop(body.shopId);
  if (!body.files.length) fail("VALIDATION_ERROR", "กรุณาเลือกไฟล์อย่างน้อย 1 ไฟล์");
  const { print, pages } = priceFiles(ms, body.files);
  const lines = serviceLines(ms, body.files, body.services);
  const services = lines.reduce((n, l) => n + (l.line.lineTotalSatang ?? 0), 0);
  const manual =
    ms.pricing.tiers.some((t) => t.minPages <= pages) ||
    lines.some((l) => l.line.unitPriceSatang === null);

  let delivery = 0;
  if (body.fulfillment === "delivery") {
    if (body.deliveryLat === undefined || body.deliveryLng === undefined) {
      fail("VALIDATION_ERROR", "ต้องอนุญาตตำแหน่งก่อนเลือกส่งถึงที่");
    }
    if (!ms.shop.acceptsDelivery) fail("VALIDATION_ERROR", "ร้านนี้ไม่รับจัดส่ง");
    delivery = deliveryFee(ms.shop, body.deliveryLat, body.deliveryLng);
  }

  const subtotal = print + services;
  const fee = feeFor(subtotal);
  return {
    print,
    services,
    requiresManualPrice: manual,
    estimatedPrintSatang: manual ? null : print,
    servicesSatang: manual ? null : services,
    serviceLines: lines.map((l) => l.line),
    platformFeeSatang: manual ? null : fee,
    deliveryFeeSatang: delivery,
    totalSatang: manual ? null : subtotal + fee + delivery,
  };
}

// --- shop account ----------------------------------------------------------------------------

function currentShopState(): ShopMe["state"] {
  const fromUrl = param("mockShop");
  if (shopState) return shopState;
  if (fromUrl === "no_profile" || fromUrl === "pending" || fromUrl === "suspended") return fromUrl;
  return "active";
}

function myShop(): MockShop {
  return findShop(store().myShopId);
}

/** Settings APIs: pending shops may use them (CONTRACTS 6.2). */
function requireShopAccount(): MockShop {
  const state = currentShopState();
  if (state === "no_profile") fail("FORBIDDEN", "กรุณาสมัครร้านก่อน");
  if (state === "suspended") fail("FORBIDDEN", "บัญชีร้านถูกระงับ กรุณาติดต่อแอดมิน");
  return myShop();
}

/** Orders/chats: only active shops. */
function requireActiveShop(): MockShop {
  const ms = requireShopAccount();
  if (currentShopState() !== "active") fail("FORBIDDEN", "ร้านของคุณยังรอแอดมินอนุมัติ");
  return ms;
}

function shopView(ms: MockShop): Shop {
  const state = currentShopState();
  return clone({ ...ms.shop, status: state === "no_profile" ? ms.shop.status : state });
}

// --- messages --------------------------------------------------------------------------------

function listMessages(o: MockOrder, after?: string) {
  return store()
    .messages.filter((m) => m.orderId === o.id && (!after || m.createdAt > after))
    .map(toMessage);
}

function addMessage(o: MockOrder, sender: MockMessage["sender"], body: string): Message {
  if (TERMINAL.includes(o.status)) fail("CHAT_CLOSED");
  const text = body.trim();
  if (!text || text.length > 1000) fail("VALIDATION_ERROR", "ข้อความต้องยาว 1–1000 ตัวอักษร");
  const m: MockMessage = {
    id: newId(),
    orderId: o.id,
    sender,
    body: text,
    createdAt: nowIso(),
    readAt: null,
  };
  store().messages.push(m);
  return toMessage(m);
}

function markRead(o: MockOrder, side: Side) {
  const stamp = nowIso();
  for (const m of store().messages) {
    const fromOther = side === "customer" ? m.sender === "shop" : m.sender === "customer";
    if (m.orderId === o.id && fromOther && !m.readAt) m.readAt = stamp;
  }
  return { unreadMessageCount: 0 as const };
}

const thaiTime = (iso: string) =>
  new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

// --- the mock API ----------------------------------------------------------------------------

export const mockApi: Api = {
  // 6.1 customer
  async signUploads({ files }) {
    await gate();
    if (!files.length || files.length > MAX_FILES)
      fail("VALIDATION_ERROR", `เลือกได้ 1–${MAX_FILES} ไฟล์`);
    for (const f of files) {
      if (!ALLOWED_MIME.includes(f.mime))
        fail("VALIDATION_ERROR", "รองรับเฉพาะไฟล์ PDF, JPG และ PNG");
      if (f.sizeBytes > MAX_FILE_BYTES) fail("VALIDATION_ERROR", "ไฟล์ต้องไม่เกิน 20 MB");
    }
    return files.map((f) => ({
      path: `order-files/pending/${store().customerId}/${newId()}-${f.name.replace(/[^\p{L}\p{N}._-]+/gu, "_")}`,
      uploadUrl: "mock://upload",
      token: "mock-token",
    }));
  },

  async listShops(pos) {
    await gate();
    const items: ShopListItem[] = store()
      .shops.filter((ms) => ms.shop.status === "active" && ms.pricing.rules.length > 0)
      .map((ms) => ({
        id: ms.shop.id,
        name: ms.shop.name,
        address: ms.shop.address,
        distanceKm: pos ? Math.round(km(ms.shop, pos) * 10) / 10 : null,
        isOpen: ms.isOpen,
        opensAt: ms.opensAt,
        closesAt: ms.closesAt,
        isPaused: ms.shop.isPaused,
        acceptsDelivery: ms.shop.acceptsDelivery,
        startingPriceSatang: Math.min(...ms.pricing.rules.map((r) => r.pricePerPageSatang)),
        services: ms.services
          .filter((s) => s.isActive)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((s) => ({ id: s.id, name: s.name, priceSatang: s.priceSatang, unit: s.unit })),
      }));
    return pos
      ? items.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
      : items.sort((a, b) => a.name.localeCompare(b.name, "th"));
  },

  async estimate(body) {
    await gate();
    // parse() keeps only the contract fields (drops the internal print/services numbers)
    return EstimateResult.parse(computeEstimate(body));
  },

  async createOrder(body: CreateOrderRequest) {
    await gate();
    const ms = findShop(body.shopId);
    if (!ms.isOpen) fail("SHOP_CLOSED");
    if (ms.shop.isPaused) fail("SHOP_PAUSED");
    if (body.files.length > MAX_FILES)
      fail("VALIDATION_ERROR", `เลือกได้ไม่เกิน ${MAX_FILES} ไฟล์`);
    if (
      body.fulfillment === "delivery" &&
      (!body.deliveryAddress?.trim() ||
        body.deliveryLat === undefined ||
        body.deliveryLng === undefined ||
        !body.deliveryRecipientName?.trim() ||
        !body.deliveryRecipientPhone?.trim())
    ) {
      fail("VALIDATION_ERROR", "กรุณากรอกข้อมูลผู้รับและที่อยู่จัดส่งให้ครบ");
    }
    if ((body.customerNote?.length ?? 0) > 500)
      fail("VALIDATION_ERROR", "หมายเหตุยาวเกิน 500 ตัวอักษร");

    const est = computeEstimate(body);
    const files = body.files.map((f) => ({
      id: newId(),
      originalName: f.originalName,
      mime: f.mime,
      sizeBytes: f.sizeBytes,
      pageCount: f.pageCount,
      color: f.color,
      paper: f.paper,
      sides: f.sides,
      copies: f.copies,
    }));
    const services: OrderService[] = serviceLines(
      ms,
      body.files,
      body.services,
    ).flatMap<OrderService>(({ svc, indexes }) =>
      svc.unit === "per_set"
        ? indexes.map((i) => ({
            id: newId(),
            name: svc.name,
            unit: svc.unit,
            unitPriceSatang: svc.priceSatang,
            fileId: files[i].id,
            quantity: files[i].copies,
            lineTotalSatang: svc.priceSatang === null ? null : svc.priceSatang * files[i].copies,
          }))
        : [
            {
              id: newId(),
              name: svc.name,
              unit: svc.unit,
              unitPriceSatang: svc.priceSatang,
              fileId: null,
              quantity: 1,
              lineTotalSatang: svc.priceSatang,
            },
          ],
    );

    const d = store();
    const stamp = nowIso();
    const order: MockOrder = {
      id: newId(),
      orderNo: `PG-${String(d.nextOrderNo++).padStart(4, "0")}`,
      customerId: d.customerId,
      shopId: ms.shop.id,
      status: "submitted",
      fulfillment: body.fulfillment,
      deliveryAddress: body.fulfillment === "delivery" ? body.deliveryAddress!.trim() : null,
      deliveryLat: body.fulfillment === "delivery" ? body.deliveryLat! : null,
      deliveryLng: body.fulfillment === "delivery" ? body.deliveryLng! : null,
      deliveryRecipientName:
        body.fulfillment === "delivery" ? body.deliveryRecipientName!.trim() : null,
      deliveryRecipientPhone:
        body.fulfillment === "delivery" ? body.deliveryRecipientPhone!.trim() : null,
      customerNote: body.customerNote?.trim() || null,
      requiresManualPrice: est.requiresManualPrice,
      estimatedPrintSatang: est.print,
      estimatedServicesSatang: est.services,
      printSubtotalSatang: null,
      platformFeeSatang: null,
      deliveryFeeSatang: est.deliveryFeeSatang,
      totalSatang: null,
      rejectReason: null,
      responseDeadline: plusMinutes(SHOP_RESPONSE_MINUTES),
      paymentDeadline: null,
      readyInMinutes: null,
      estimatedReadyAt: null,
      readyNote: null,
      pickupCode: null,
      paidAt: null,
      completedAt: null,
      createdAt: stamp,
      updatedAt: stamp,
      files,
      services,
      payment: null,
      delivery: null,
      codeAttempts: 0,
    };
    d.orders.unshift(order);
    return toOrder(order, "customer");
  },

  async listMyOrders() {
    await gate();
    const d = store();
    return d.orders
      .filter((o) => o.customerId === d.customerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((o) => toOrder(o, "customer"));
  },

  async getMyOrder(id) {
    await gate();
    return toDetail(myCustomerOrder(id), "customer");
  },

  async cancelMyOrder(id) {
    await gate();
    const o = myCustomerOrder(id);
    move(o, ["submitted", "awaiting_payment"], "cancelled"); // after paying: admin only (D19)
    return toOrder(o, "customer");
  },

  async listMyMessages(orderId, after) {
    await gate();
    return listMessages(myCustomerOrder(orderId), after);
  },

  async sendMyMessage(orderId, body) {
    await gate();
    return addMessage(myCustomerOrder(orderId), "customer", body);
  },

  async markMyMessagesRead(orderId) {
    await gate();
    return markRead(myCustomerOrder(orderId), "customer");
  },

  async listMyChats() {
    await gate();
    const d = store();
    return chatsFor(
      d.orders.filter((o) => o.customerId === d.customerId),
      "customer",
    );
  },

  // 6.2 shop
  async getShopMe() {
    await gate();
    const state = currentShopState();
    return { state, shop: state === "no_profile" ? null : shopView(myShop()) };
  },

  async registerShop(body) {
    await gate();
    if (currentShopState() !== "no_profile") fail("ALREADY_REGISTERED");
    if (!body.name.trim() || !body.phone.trim() || !body.address.trim()) {
      fail("VALIDATION_ERROR", "กรุณากรอกชื่อร้าน เบอร์ และที่อยู่ให้ครบ");
    }
    const ms = myShop();
    Object.assign(ms.shop, { ...body, status: "pending" });
    shopState = "pending";
    return shopView(ms);
  },

  async getShopProfile() {
    await gate();
    return shopView(requireShopAccount());
  },

  async updateShopProfile(body) {
    await gate();
    const ms = requireShopAccount();
    Object.assign(ms.shop, body);
    return shopView(ms);
  },

  async getShopHours() {
    await gate();
    return clone(requireShopAccount().hours);
  },

  async updateShopHours(body: ShopHour[]) {
    await gate();
    const ms = requireShopAccount();
    if (body.length !== 7) fail("VALIDATION_ERROR", "ต้องตั้งเวลาให้ครบ 7 วัน");
    ms.hours = clone(body);
    return clone(ms.hours);
  },

  async getShopPricing() {
    await gate();
    return clone(requireShopAccount().pricing);
  },

  async updateShopPricing(body: ShopPricing) {
    await gate();
    const ms = requireShopAccount();
    ms.pricing = clone(body);
    return clone(ms.pricing);
  },

  async listShopServices() {
    await gate();
    return clone([...requireShopAccount().services].sort((a, b) => a.sortOrder - b.sortOrder));
  },

  async createShopService(body) {
    await gate();
    const ms = requireShopAccount();
    if (ms.services.length >= 20) fail("VALIDATION_ERROR", "เพิ่มบริการได้ไม่เกิน 20 รายการ");
    if (!body.name.trim() || body.name.length > 60)
      fail("VALIDATION_ERROR", "ชื่อบริการต้องยาว 1–60 ตัวอักษร");
    const svc: ShopService = {
      id: newId(),
      name: body.name.trim(),
      priceSatang: body.priceSatang,
      unit: body.unit,
      isActive: true,
      sortOrder: ms.services.length + 1,
    };
    ms.services.push(svc);
    return clone(svc);
  },

  async updateShopService(id, body) {
    await gate();
    const ms = requireShopAccount();
    const svc = ms.services.find((s) => s.id === id) ?? fail("NOT_FOUND", "ไม่พบบริการนี้");
    if (!body.name.trim() || body.name.length > 60)
      fail("VALIDATION_ERROR", "ชื่อบริการต้องยาว 1–60 ตัวอักษร");
    Object.assign(svc, body, { name: body.name.trim() });
    return clone(svc);
  },

  async deleteShopService(id) {
    await gate();
    const ms = requireShopAccount();
    if (!ms.services.some((s) => s.id === id)) fail("NOT_FOUND", "ไม่พบบริการนี้");
    ms.services = ms.services.filter((s) => s.id !== id);
    return { ok: true as const };
  },

  async listShopOrders(statuses) {
    await gate();
    const ms = requireActiveShop();
    return store()
      .orders.filter(
        (o) => o.shopId === ms.shop.id && (!statuses?.length || statuses.includes(o.status)),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((o) => toOrder(o, "shop"));
  },

  async getShopOrder(id) {
    await gate();
    return toDetail(myShopOrder(id), "shop");
  },

  async getShopFileUrl(orderId, fileId, mode = "view") {
    await gate();
    const o = myShopOrder(orderId);
    const f = o.files.find((x) => x.id === fileId) ?? fail("NOT_FOUND", "ไม่พบไฟล์นี้");
    const text = `ไฟล์ตัวอย่างสมมติ: ${f.originalName} (${f.pageCount} หน้า) · โหมด ${mode}`;
    const url =
      typeof URL.createObjectURL === "function" && typeof Blob !== "undefined"
        ? URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }))
        : "about:blank";
    // Expire like the real signed URL (5 min) so blobs do not pile up
    if (url.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(url), 300_000);
    return { url, expiresInSeconds: 300 };
  },

  async confirmOrder(id, body) {
    await gate();
    const o = myShopOrder(id);
    const parsed = ConfirmOrderBody.safeParse(body);
    if (!parsed.success) fail("VALIDATION_ERROR", "กรุณาเลือกเวลาเสร็จประมาณ (อย่างใดอย่างหนึ่ง)");
    if (o.requiresManualPrice && body.printSubtotalSatang === undefined)
      fail("MANUAL_PRICE_REQUIRED");
    if (body.estimatedReadyAt && body.estimatedReadyAt <= nowIso()) {
      fail("VALIDATION_ERROR", "เวลาเสร็จต้องอยู่ในอนาคต");
    }
    const subtotal =
      body.printSubtotalSatang ?? (o.estimatedPrintSatang ?? 0) + (o.estimatedServicesSatang ?? 0);
    const fee = feeFor(subtotal);
    move(o, ["submitted"], "awaiting_payment", {
      printSubtotalSatang: subtotal,
      platformFeeSatang: fee,
      totalSatang: subtotal + fee + o.deliveryFeeSatang,
      paymentDeadline: plusMinutes(PAYMENT_WINDOW_MINUTES),
      readyInMinutes: body.readyInMinutes ?? null,
      estimatedReadyAt: body.estimatedReadyAt ?? null,
      readyNote: body.readyNote?.trim() || null,
    });
    return toOrder(o, "shop");
  },

  async updateOrderEta(id, body) {
    await gate();
    const o = myShopOrder(id);
    if (!EtaBody.safeParse(body).success || body.estimatedReadyAt <= nowIso()) {
      fail("VALIDATION_ERROR", "เวลาเสร็จต้องอยู่ในอนาคต");
    }
    move(o, ["paid", "printing"], o.status, {
      estimatedReadyAt: body.estimatedReadyAt,
      readyNote: body.readyNote?.trim() || o.readyNote,
    });
    store().messages.push({
      id: newId(),
      orderId: o.id,
      sender: "system",
      body: `ร้านปรับเวลาเสร็จประมาณเป็น ${thaiTime(body.estimatedReadyAt)}`,
      createdAt: nowIso(),
      readAt: null,
    });
    return toOrder(o, "shop");
  },

  async rejectOrder(id, reason) {
    await gate();
    const o = myShopOrder(id);
    if (!reason?.trim()) fail("VALIDATION_ERROR", "กรุณาใส่เหตุผลที่ปฏิเสธ");
    move(o, ["submitted", "paid", "printing"], "rejected", { rejectReason: reason.trim() });
    return toOrder(o, "shop");
  },

  async startPrinting(id) {
    await gate();
    const o = myShopOrder(id);
    move(o, ["paid"], "printing");
    return toOrder(o, "shop");
  },

  async markReady(id) {
    await gate();
    const o = myShopOrder(id);
    move(o, ["printing"], "ready");
    if (o.fulfillment === "delivery") {
      // The system books a rider right away (CONTRACTS 4: ready -> courier_requested)
      move(o, ["ready"], "courier_requested", {
        delivery: {
          id: newId(),
          provider: "manual",
          status: "pending_admin",
          feeSatang: null,
          trackingUrl: null,
          note: null,
          updatedAt: nowIso(),
        },
      });
    }
    return toOrder(o, "shop");
  },

  async completePickup(id, pickupCode) {
    await gate();
    const o = myShopOrder(id);
    if (o.fulfillment !== "pickup") fail("ORDER_INVALID_TRANSITION");
    if (o.codeAttempts >= 5) fail("RATE_LIMITED");
    if (o.status === "ready" && pickupCode.trim() !== o.pickupCode) {
      o.codeAttempts += 1;
      fail("VALIDATION_ERROR", "รหัสรับงานไม่ถูกต้อง");
    }
    move(o, ["ready"], "completed", { completedAt: nowIso() });
    return toOrder(o, "shop");
  },

  async listShopMessages(orderId, after) {
    await gate();
    return listMessages(myShopOrder(orderId), after);
  },

  async sendShopMessage(orderId, body) {
    await gate();
    return addMessage(myShopOrder(orderId), "shop", body);
  },

  async markShopMessagesRead(orderId) {
    await gate();
    return markRead(myShopOrder(orderId), "shop");
  },

  async listShopChats() {
    await gate();
    const ms = requireActiveShop();
    return chatsFor(
      store().orders.filter((o) => o.shopId === ms.shop.id),
      "shop",
    );
  },

  async subscribePush() {
    await gate();
    requireShopAccount();
    return { ok: true as const };
  },

  async unsubscribePush() {
    await gate();
    requireShopAccount();
    return { ok: true as const };
  },

  // 6.3 payment
  async createCharge(orderId) {
    await gate();
    const o = myCustomerOrder(orderId);
    if (o.status !== "awaiting_payment" || o.totalSatang === null) fail("ORDER_INVALID_TRANSITION");
    o.payment ??= {
      id: newId(),
      status: "pending",
      amountSatang: o.totalSatang,
      rejectReason: null,
      createdAt: nowIso(),
    };
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#fff" stroke="#12284c" stroke-width="4"/><text x="100" y="105" font-size="16" text-anchor="middle" fill="#12284c">QR ตัวอย่างสมมติ</text></svg>`;
    return {
      paymentId: o.payment.id,
      amountSatang: o.totalSatang,
      promptpayPayload: "MOCK-PROMPTPAY-PAYLOAD",
      qrDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      expiresAt: o.paymentDeadline ?? plusMinutes(PAYMENT_WINDOW_MINUTES),
    };
  },

  async signSlipUpload(orderId, mime) {
    await gate();
    const o = myCustomerOrder(orderId);
    if (!["image/jpeg", "image/png"].includes(mime))
      fail("VALIDATION_ERROR", "สลิปต้องเป็นรูป JPG หรือ PNG");
    const ext = mime === "image/png" ? "png" : "jpg";
    return {
      path: `payment-slips/${o.id}/${newId()}.${ext}`,
      uploadUrl: "mock://upload",
      token: "mock-token",
    };
  },

  async submitSlip(orderId, slipPath) {
    await gate();
    const o = myCustomerOrder(orderId);
    if (o.status !== "awaiting_payment") fail("ORDER_INVALID_TRANSITION");
    if (!slipPath) fail("VALIDATION_ERROR", "กรุณาแนบสลิป");
    const outcome = param("mockSlip") ?? "verified";
    o.payment ??= {
      id: newId(),
      status: "pending",
      amountSatang: o.totalSatang ?? 0,
      rejectReason: null,
      createdAt: nowIso(),
    };
    if (outcome === "rejected") {
      o.payment.status = "rejected";
      o.payment.rejectReason = "อ่านสลิปไม่ได้ (ตัวอย่างสมมติ)";
      return { status: "rejected" as const, reason: o.payment.rejectReason };
    }
    if (outcome === "pending_review") {
      o.payment.status = "pending_review";
      return { status: "pending_review" as const };
    }
    o.payment.status = "verified";
    markPaid(o);
    return { status: "verified" as const };
  },
};

// --- dev helpers (for trying badges, sounds and polling by hand) -------------------------------

/** Call from the browser console via window.__printgoMock in dev. */
export const mockDev = {
  reset: resetMock,
  /** Pretend the customer wrote in the chat of an order. */
  customerSays(orderId: string, body = "สวัสดีค่ะ (ข้อความตัวอย่าง)") {
    return addMessage(findOrder(orderId), "customer", body);
  },
  /** Pretend the shop wrote in the chat of an order. */
  shopSays(orderId: string, body = "ได้รับงานแล้วค่ะ (ข้อความตัวอย่าง)") {
    return addMessage(findOrder(orderId), "shop", body);
  },
  /** A new order lands in the shop queue (tests the "new order" sound and badge). */
  async newOrder() {
    const before = mockConfig.delay;
    mockConfig.delay = false;
    try {
      return await mockApi.createOrder({
        shopId: store().myShopId,
        fulfillment: "pickup",
        files: [
          {
            path: "order-files/pending/mock/ตัวอย่าง.pdf",
            originalName: "งานใหม่ตัวอย่าง.pdf",
            mime: "application/pdf",
            sizeBytes: 300_000,
            pageCount: 5,
            color: "bw",
            paper: "A4",
            sides: "single",
            copies: 1,
          },
        ],
      });
    } finally {
      mockConfig.delay = before;
    }
  },
  /** Pretend the customer paid (skips the slip step). */
  pay(orderId: string) {
    markPaid(findOrder(orderId));
  },
  orders: () => store().orders.map((o) => ({ id: o.id, orderNo: o.orderNo, status: o.status })),
};

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __printgoMock?: typeof mockDev }).__printgoMock = mockDev;
}
