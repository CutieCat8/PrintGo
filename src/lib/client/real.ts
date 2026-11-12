import type {
  Order,
  OrderDetail,
  Message,
  Shop,
  ShopMe,
  ShopService,
  ConfirmOrderBody,
  EtaBody,
} from "@/lib/db/types";
import { request } from "./http";
import type {
  ChatList,
  Charge,
  CreateOrderRequest,
  EstimateRequest,
  EstimateResult,
  FileUrl,
  PushSubscribeRequest,
  RegisterShopRequest,
  ShopHour,
  ShopListItem,
  ShopPricing,
  ShopProfileRequest,
  ShopServiceCreateRequest,
  ShopServiceUpdateRequest,
  SlipResult,
  SlipSign,
  UploadSignItem,
  UploadSignRequest,
} from "./types";

/** Real API calls, one function per endpoint in CONTRACTS 6.1-6.3. Pages use `api` from ./api. */

const liff = { auth: "customer" } as const;
const shop = { auth: "cookie" } as const;
const enc = encodeURIComponent;

export const realApi = {
  // --- 6.1 customer (LIFF) ---
  signUploads: (body: UploadSignRequest) =>
    request<UploadSignItem[]>("POST", "/api/liff/uploads/sign", { ...liff, body }),
  listShops: (pos?: { lat: number; lng: number }) =>
    request<ShopListItem[]>("GET", "/api/liff/shops", {
      ...liff,
      query: pos ? { lat: pos.lat, lng: pos.lng } : {},
    }),
  estimate: (body: EstimateRequest) =>
    request<EstimateResult>("POST", "/api/liff/estimate", { ...liff, body }),
  createOrder: (body: CreateOrderRequest) =>
    request<Order>("POST", "/api/liff/orders", { ...liff, body }),
  listMyOrders: () => request<Order[]>("GET", "/api/liff/orders", liff),
  getMyOrder: (id: string) => request<OrderDetail>("GET", `/api/liff/orders/${enc(id)}`, liff),
  cancelMyOrder: (id: string) => request<Order>("POST", `/api/liff/orders/${enc(id)}/cancel`, liff),
  listMyMessages: (orderId: string, after?: string) =>
    request<Message[]>("GET", `/api/liff/orders/${enc(orderId)}/messages`, {
      ...liff,
      query: { after },
    }),
  sendMyMessage: (orderId: string, body: string) =>
    request<Message>("POST", `/api/liff/orders/${enc(orderId)}/messages`, {
      ...liff,
      body: { body },
    }),
  markMyMessagesRead: (orderId: string) =>
    request<{ unreadMessageCount: 0 }>(
      "POST",
      `/api/liff/orders/${enc(orderId)}/messages/read`,
      liff,
    ),
  listMyChats: () => request<ChatList>("GET", "/api/liff/chats", liff),

  // --- 6.2 shop ---
  getShopMe: () => request<ShopMe>("GET", "/api/shop/me", shop),
  registerShop: (body: RegisterShopRequest) =>
    request<Shop>("POST", "/api/shop/register", { ...shop, body }),
  getShopProfile: () => request<Shop>("GET", "/api/shop/profile", shop),
  updateShopProfile: (body: ShopProfileRequest) =>
    request<Shop>("PUT", "/api/shop/profile", { ...shop, body }),
  getShopHours: () => request<ShopHour[]>("GET", "/api/shop/hours", shop),
  updateShopHours: (body: ShopHour[]) =>
    request<ShopHour[]>("PUT", "/api/shop/hours", { ...shop, body }),
  getShopPricing: () => request<ShopPricing>("GET", "/api/shop/pricing", shop),
  updateShopPricing: (body: ShopPricing) =>
    request<ShopPricing>("PUT", "/api/shop/pricing", { ...shop, body }),
  listShopServices: () => request<ShopService[]>("GET", "/api/shop/services", shop),
  createShopService: (body: ShopServiceCreateRequest) =>
    request<ShopService>("POST", "/api/shop/services", { ...shop, body }),
  updateShopService: (id: string, body: ShopServiceUpdateRequest) =>
    request<ShopService>("PUT", `/api/shop/services/${enc(id)}`, { ...shop, body }),
  deleteShopService: (id: string) =>
    request<{ ok: true }>("DELETE", `/api/shop/services/${enc(id)}`, shop),
  /** `statuses` are joined with "," as the contract allows. */
  listShopOrders: (statuses?: Order["status"][]) =>
    request<Order[]>("GET", "/api/shop/orders", {
      ...shop,
      query: { status: statuses?.join(",") },
    }),
  getShopOrder: (id: string) => request<OrderDetail>("GET", `/api/shop/orders/${enc(id)}`, shop),
  /** Ask for a fresh URL on every click; it expires after 5 minutes. */
  getShopFileUrl: (orderId: string, fileId: string, mode: "view" | "download" = "view") =>
    request<FileUrl>("GET", `/api/shop/orders/${enc(orderId)}/files/${enc(fileId)}/url`, {
      ...shop,
      query: { mode },
    }),
  confirmOrder: (id: string, body: ConfirmOrderBody) =>
    request<Order>("POST", `/api/shop/orders/${enc(id)}/confirm`, { ...shop, body }),
  updateOrderEta: (id: string, body: EtaBody) =>
    request<Order>("POST", `/api/shop/orders/${enc(id)}/eta`, { ...shop, body }),
  rejectOrder: (id: string, reason: string) =>
    request<Order>("POST", `/api/shop/orders/${enc(id)}/reject`, { ...shop, body: { reason } }),
  startPrinting: (id: string) =>
    request<Order>("POST", `/api/shop/orders/${enc(id)}/start-printing`, shop),
  markReady: (id: string) => request<Order>("POST", `/api/shop/orders/${enc(id)}/mark-ready`, shop),
  completePickup: (id: string, pickupCode: string) =>
    request<Order>("POST", `/api/shop/orders/${enc(id)}/complete`, {
      ...shop,
      body: { pickupCode },
    }),
  listShopMessages: (orderId: string, after?: string) =>
    request<Message[]>("GET", `/api/shop/orders/${enc(orderId)}/messages`, {
      ...shop,
      query: { after },
    }),
  sendShopMessage: (orderId: string, body: string) =>
    request<Message>("POST", `/api/shop/orders/${enc(orderId)}/messages`, {
      ...shop,
      body: { body },
    }),
  markShopMessagesRead: (orderId: string) =>
    request<{ unreadMessageCount: 0 }>(
      "POST",
      `/api/shop/orders/${enc(orderId)}/messages/read`,
      shop,
    ),
  listShopChats: () => request<ChatList>("GET", "/api/shop/chats", shop),
  subscribePush: (body: PushSubscribeRequest) =>
    request<{ ok: true }>("POST", "/api/shop/push/subscribe", { ...shop, body }),
  unsubscribePush: (endpoint: string) =>
    request<{ ok: true }>("POST", "/api/shop/push/unsubscribe", { ...shop, body: { endpoint } }),

  // --- 6.3 payment (customer calls these with the LIFF token) ---
  createCharge: (orderId: string) =>
    request<Charge>("POST", `/api/payments/orders/${enc(orderId)}/charge`, liff),
  signSlipUpload: (orderId: string, mime: string) =>
    request<SlipSign>("POST", `/api/payments/orders/${enc(orderId)}/slip/sign`, {
      ...liff,
      body: { mime },
    }),
  submitSlip: (orderId: string, slipPath: string) =>
    request<SlipResult>("POST", `/api/payments/orders/${enc(orderId)}/slip`, {
      ...liff,
      body: { slipPath },
    }),
};

/** Every API function. The mock must implement exactly this. */
export type Api = typeof realApi;
