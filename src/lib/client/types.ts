import { z } from "zod";
import {
  ColorMode,
  Fulfillment,
  MessageSender,
  OrderStatus,
  Paper,
  ServiceUnit,
  Sides,
} from "@/lib/db/types";

/**
 * Request/response shapes from docs/CONTRACTS.md section 6 that `@/lib/db/types` does not cover yet.
 * Field names are copied from the contract; do not invent new ones here (ask ซี instead).
 * Schemas (not just types) so tests can check the mock returns exactly these shapes.
 */

const id = z.uuid();
const satang = z.number().int().nonnegative();
const iso = z.string();

// --- 6.1 customer ----------------------------------------------------------------------------

export type UploadSignRequest = { files: { name: string; mime: string; sizeBytes: number }[] };
export const UploadSignResult = z.array(
  z.object({ path: z.string(), uploadUrl: z.string(), token: z.string() }),
);

/**
 * One card in GET /api/liff/shops.
 * `opensAt` / `closesAt`: CONTRACTS gives no format. Assumed "HH:mm" (Thai time) or null until ซี confirms.
 */
export const ShopListItem = z.object({
  id,
  name: z.string(),
  address: z.string(),
  distanceKm: z.number().nullable(),
  isOpen: z.boolean(),
  opensAt: z.string().nullable(),
  closesAt: z.string().nullable(),
  isPaused: z.boolean(),
  acceptsDelivery: z.boolean(),
  startingPriceSatang: satang,
  services: z.array(
    z.object({ id, name: z.string(), priceSatang: satang.nullable(), unit: ServiceUnit }),
  ),
});

export type FileSettingInput = {
  pageCount: number;
  color: ColorMode;
  paper: Paper;
  sides: Sides;
  copies: number;
};
export type SelectedService = { serviceId: string; fileIndexes?: number[] };

export type EstimateRequest = {
  shopId: string;
  fulfillment: Fulfillment;
  deliveryLat?: number;
  deliveryLng?: number;
  files: FileSettingInput[];
  services?: SelectedService[];
};

export const EstimateResult = z.object({
  requiresManualPrice: z.boolean(),
  estimatedPrintSatang: satang.nullable(),
  servicesSatang: satang.nullable(),
  serviceLines: z.array(
    z.object({
      serviceId: id,
      name: z.string(),
      unit: ServiceUnit,
      unitPriceSatang: satang.nullable(),
      quantity: z.number().int().positive(),
      lineTotalSatang: satang.nullable(),
    }),
  ),
  platformFeeSatang: satang.nullable(),
  deliveryFeeSatang: satang,
  totalSatang: satang.nullable(),
});

export type CreateOrderRequest = {
  shopId: string;
  fulfillment: Fulfillment;
  deliveryAddress?: string;
  deliveryLat?: number;
  deliveryLng?: number;
  deliveryRecipientName?: string;
  deliveryRecipientPhone?: string;
  customerNote?: string;
  files: (FileSettingInput & {
    path: string;
    originalName: string;
    mime: string;
    sizeBytes: number;
  })[];
  services?: SelectedService[];
};

/** GET /api/liff/chats and GET /api/shop/chats */
export const ChatList = z.object({
  totalUnread: z.number().int().nonnegative(),
  chats: z.array(
    z.object({
      orderId: id,
      orderNo: z.string(),
      shopName: z.string(),
      status: OrderStatus,
      isClosed: z.boolean(),
      lastMessage: z.object({ sender: MessageSender, body: z.string(), createdAt: iso }).nullable(),
      unreadMessageCount: z.number().int().nonnegative(),
    }),
  ),
});

export const UnreadReset = z.object({ unreadMessageCount: z.literal(0) });

// --- 6.2 shop --------------------------------------------------------------------------------

export const FileUrl = z.object({ url: z.string(), expiresInSeconds: z.number().int().positive() });

export type RegisterShopRequest = {
  name: string;
  phone: string;
  address: string;
  lat: number;
  lng: number;
  acceptsDelivery: boolean;
};

export type ShopProfileRequest = RegisterShopRequest & { cutoffMinutes: number; isPaused: boolean };

export const ShopHour = z.object({
  weekday: z.number().int().min(0).max(6),
  openTime: z.string(),
  closeTime: z.string(),
  isClosed: z.boolean(),
});

export const ShopPricing = z.object({
  rules: z.array(
    z.object({ color: ColorMode, paper: Paper, sides: Sides, pricePerPageSatang: satang }),
  ),
  tiers: z.array(z.object({ minPages: z.number().int().positive(), note: z.string().nullable() })),
});

export type ShopServiceCreateRequest = {
  name: string;
  priceSatang: number | null;
  unit: ServiceUnit;
};
export type ShopServiceUpdateRequest = ShopServiceCreateRequest & {
  isActive: boolean;
  sortOrder: number;
};

export type PushSubscribeRequest = { endpoint: string; keys: { p256dh: string; auth: string } };
export const Ok = z.object({ ok: z.literal(true) });

// --- 6.3 payment -----------------------------------------------------------------------------

export const Charge = z.object({
  paymentId: id,
  amountSatang: satang,
  promptpayPayload: z.string(),
  qrDataUrl: z.string(),
  expiresAt: iso,
});

export const SlipResult = z.object({
  status: z.enum(["verified", "pending_review", "rejected"]),
  reason: z.string().optional(),
});

export const SlipSign = z.object({ path: z.string(), uploadUrl: z.string(), token: z.string() });

export type UploadSignItem = z.infer<typeof UploadSignResult>[number];
export type ShopListItem = z.infer<typeof ShopListItem>;
export type EstimateResult = z.infer<typeof EstimateResult>;
export type ChatList = z.infer<typeof ChatList>;
export type FileUrl = z.infer<typeof FileUrl>;
export type ShopHour = z.infer<typeof ShopHour>;
export type ShopPricing = z.infer<typeof ShopPricing>;
export type Charge = z.infer<typeof Charge>;
export type SlipResult = z.infer<typeof SlipResult>;
export type SlipSign = z.infer<typeof SlipSign>;
