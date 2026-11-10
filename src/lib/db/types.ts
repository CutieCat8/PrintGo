import { z } from "zod";
import { fromDb } from "./case";
import {
  ColorMode,
  DeliveryProviderName,
  DeliveryStatus,
  ENUMS,
  Fulfillment,
  MessageSender,
  OrderStatus,
  Paper,
  PaymentStatus,
  PaymentVerifier,
  RefundStatus,
  Role,
  ServiceUnit,
  SettlementStatus,
  ShopStatus,
  Sides,
} from "./enums";

/**
 * Shared types for the whole team. Must match docs/CONTRACTS.md section 3 (tables) and
 * section 6.6 (what the API returns) character for character. Field names are camelCase;
 * `fromDb` / `toDb` convert to and from the snake_case columns.
 */
export * from "./enums";

const id = z.uuid();
const timestamp = z.string(); // ISO 8601; the database returns timestamptz as text
const satang = z.number().int().nonnegative(); // money is integer satang, never negative
const base = { id, createdAt: timestamp };

// ---------------------------------------------------------------------------------------------
// Table rows (section 3)
// ---------------------------------------------------------------------------------------------

export const ProfileRow = z.object({
  ...base,
  authUserId: id,
  role: Role,
  shopId: id.nullable(),
});

export const CustomerRow = z.object({
  ...base,
  lineUserId: z.string(),
  displayName: z.string(),
  pictureUrl: z.string().nullable(),
});

export const ShopRow = z.object({
  ...base,
  name: z.string(),
  phone: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  status: ShopStatus,
  isPaused: z.boolean(),
  acceptsDelivery: z.boolean(),
  cutoffMinutes: z.number().int().nonnegative(),
});

export const ShopHourRow = z.object({
  ...base,
  shopId: id,
  weekday: z.number().int().min(0).max(6), // 0 = Sunday
  openTime: z.string(), // "HH:MM:SS"
  closeTime: z.string(),
  isClosed: z.boolean(),
});

export const ShopPricingRuleRow = z.object({
  ...base,
  shopId: id,
  color: ColorMode,
  paper: Paper,
  sides: Sides,
  pricePerPageSatang: satang,
});

export const ShopDiscountTierRow = z.object({
  ...base,
  shopId: id,
  minPages: z.number().int().positive(),
  note: z.string().nullable(),
});

export const ShopServiceRow = z.object({
  ...base,
  shopId: id,
  name: z.string(),
  priceSatang: satang.nullable(), // null = "ราคาตามตกลง"
  unit: ServiceUnit,
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});

export const OrderRow = z.object({
  ...base,
  orderNo: z.string(),
  customerId: id,
  shopId: id,
  status: OrderStatus,
  fulfillment: Fulfillment,
  deliveryAddress: z.string().nullable(),
  deliveryLat: z.number().nullable(),
  deliveryLng: z.number().nullable(),
  deliveryRecipientName: z.string().nullable(),
  deliveryRecipientPhone: z.string().nullable(),
  customerNote: z.string().nullable(),
  requiresManualPrice: z.boolean(),
  estimatedPrintSatang: satang.nullable(),
  estimatedServicesSatang: satang.nullable(),
  printSubtotalSatang: satang.nullable(),
  platformFeeSatang: satang.nullable(),
  deliveryFeeSatang: satang,
  totalSatang: satang.nullable(),
  rejectReason: z.string().nullable(),
  responseDeadline: timestamp,
  paymentDeadline: timestamp.nullable(),
  readyInMinutes: z.number().int().nullable(),
  estimatedReadyAt: timestamp.nullable(),
  readyNote: z.string().nullable(),
  pickupCode: z.string().nullable(),
  paidAt: timestamp.nullable(),
  completedAt: timestamp.nullable(),
  updatedAt: timestamp,
});

export const OrderFileRow = z.object({
  ...base,
  orderId: id,
  storagePath: z.string(),
  originalName: z.string(),
  mime: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  pageCount: z.number().int().positive(),
  color: ColorMode,
  paper: Paper,
  sides: Sides,
  copies: z.number().int().positive(),
  deletedAt: timestamp.nullable(),
});

export const OrderServiceRow = z.object({
  ...base,
  orderId: id,
  shopServiceId: id.nullable(),
  name: z.string(),
  unit: ServiceUnit,
  unitPriceSatang: satang.nullable(),
  orderFileId: id.nullable(),
  quantity: z.number().int().positive(),
});

export const PaymentRow = z.object({
  ...base,
  orderId: id,
  amountSatang: satang,
  status: PaymentStatus,
  slipPath: z.string().nullable(),
  slipRef: z.string().nullable(),
  verifiedBy: PaymentVerifier.nullable(),
  verifiedAt: timestamp.nullable(),
  rejectReason: z.string().nullable(),
});

export const DeliveryRow = z.object({
  ...base,
  orderId: id,
  provider: DeliveryProviderName,
  providerRef: z.string().nullable(),
  status: DeliveryStatus,
  feeSatang: satang.nullable(),
  trackingUrl: z.string().nullable(),
  note: z.string().nullable(),
  updatedAt: timestamp,
});

export const MessageRow = z.object({
  ...base,
  orderId: id,
  sender: MessageSender,
  body: z.string(),
  readAt: timestamp.nullable(),
  pushSentAt: timestamp.nullable(),
});

export const SettlementRow = z.object({
  ...base,
  shopId: id,
  orderId: id,
  amountSatang: satang,
  status: SettlementStatus,
  paidAt: timestamp.nullable(),
  proofPath: z.string().nullable(),
});

export const RefundRow = z.object({
  ...base,
  orderId: id,
  amountSatang: satang,
  reason: z.string(),
  status: RefundStatus,
  paidAt: timestamp.nullable(),
});

export const PushSubscriptionRow = z.object({
  ...base,
  shopId: id,
  authUserId: id,
  endpoint: z.string(),
  p256dh: z.string(),
  auth: z.string(),
  userAgent: z.string().nullable(),
  lastSuccessAt: timestamp.nullable(),
});

export const WebhookEventRow = z.object({
  id: z.string(), // event id from the provider, not a uuid
  source: z.string(),
  createdAt: timestamp,
});

/** Table name -> row schema. migration.test.ts checks this against the SQL. */
export const TABLES = {
  profiles: ProfileRow,
  customers: CustomerRow,
  shops: ShopRow,
  shop_hours: ShopHourRow,
  shop_pricing_rules: ShopPricingRuleRow,
  shop_discount_tiers: ShopDiscountTierRow,
  shop_services: ShopServiceRow,
  orders: OrderRow,
  order_files: OrderFileRow,
  order_services: OrderServiceRow,
  payments: PaymentRow,
  deliveries: DeliveryRow,
  messages: MessageRow,
  settlements: SettlementRow,
  refunds: RefundRow,
  push_subscriptions: PushSubscriptionRow,
  webhook_events: WebhookEventRow,
} as const;

/** Read a database row (snake_case) as a typed camelCase object; throws if it does not fit. */
export function parseRow<S extends z.ZodType>(schema: S, row: Record<string, unknown>): z.infer<S> {
  return schema.parse(fromDb(row));
}

// ---------------------------------------------------------------------------------------------
// What the API returns (section 6.6): deliberately smaller than the rows
// ---------------------------------------------------------------------------------------------

export const OrderFile = OrderFileRow.pick({
  id: true,
  originalName: true,
  mime: true,
  sizeBytes: true,
  pageCount: true,
  color: true,
  paper: true,
  sides: true,
  copies: true,
});

export const ShopService = ShopServiceRow.pick({
  id: true,
  name: true,
  priceSatang: true,
  unit: true,
  isActive: true,
  sortOrder: true,
});

export const OrderService = z.object({
  id,
  name: z.string(),
  unit: ServiceUnit,
  unitPriceSatang: satang.nullable(),
  fileId: id.nullable(),
  quantity: z.number().int().positive(),
  lineTotalSatang: satang.nullable(), // unitPrice x quantity; null while the price is not set
});

export const Message = MessageRow.pick({
  id: true,
  orderId: true,
  sender: true,
  body: true,
  createdAt: true,
});

export const Shop = ShopRow.pick({
  id: true,
  name: true,
  phone: true,
  address: true,
  lat: true,
  lng: true,
  status: true,
  isPaused: true,
  acceptsDelivery: true,
  cutoffMinutes: true,
});

export const ShopMe = z.object({
  state: z.enum(["no_profile", ...ENUMS.ShopStatus]),
  shop: Shop.nullable(),
});

/** Never includes slipPath / slipRef. */
export const Payment = PaymentRow.pick({
  id: true,
  status: true,
  amountSatang: true,
  rejectReason: true,
  createdAt: true,
});

export const Delivery = DeliveryRow.pick({
  id: true,
  provider: true,
  status: true,
  feeSatang: true,
  trackingUrl: true,
  note: true,
  updatedAt: true,
});

export const Order = OrderRow.pick({
  id: true,
  orderNo: true,
  status: true,
  fulfillment: true,
  shopId: true,
  customerNote: true,
  requiresManualPrice: true,
  estimatedPrintSatang: true,
  estimatedServicesSatang: true,
  printSubtotalSatang: true,
  platformFeeSatang: true,
  deliveryFeeSatang: true,
  totalSatang: true,
  rejectReason: true,
  responseDeadline: true,
  paymentDeadline: true,
  pickupCode: true, // customer side only
  readyInMinutes: true,
  estimatedReadyAt: true,
  readyNote: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  shopName: z.string(),
  unreadMessageCount: z.number().int().nonnegative(),
});

export const OrderDetail = Order.extend({
  files: z.array(OrderFile),
  services: z.array(OrderService),
  payment: Payment.nullable(),
  delivery: Delivery.nullable(),
  deliveryAddress: z.string().nullable(),
  deliveryRecipientName: z.string().nullable(), // never sent to the shop
  deliveryRecipientPhone: z.string().nullable(), // never sent to the shop
  shop: z.object({ id, name: z.string(), address: z.string(), phone: z.string() }),
});

// ---------------------------------------------------------------------------------------------
// Request bodies shared by two people (shop dashboard <-> shop API)
// ---------------------------------------------------------------------------------------------

const isoTime = z.iso.datetime({ offset: true });
const readyNote = z.string().max(200);

/** POST /api/shop/orders/:id/confirm. The ready time is mandatory, in exactly one form (D19). */
export const ConfirmOrderBody = z
  .object({
    printSubtotalSatang: z.number().int().positive().optional(),
    readyInMinutes: z.number().int().min(5).max(2880).optional(),
    estimatedReadyAt: isoTime.optional(),
    readyNote: readyNote.optional(),
  })
  .refine((body) => (body.readyInMinutes === undefined) !== (body.estimatedReadyAt === undefined), {
    message: "ต้องระบุเวลาเสร็จอย่างใดอย่างหนึ่ง (readyInMinutes หรือ estimatedReadyAt)",
  });

/** POST /api/shop/orders/:id/eta */
export const EtaBody = z.object({ estimatedReadyAt: isoTime, readyNote: readyNote.optional() });

export type ProfileRow = z.infer<typeof ProfileRow>;
export type CustomerRow = z.infer<typeof CustomerRow>;
export type ShopRow = z.infer<typeof ShopRow>;
export type ShopHourRow = z.infer<typeof ShopHourRow>;
export type ShopPricingRuleRow = z.infer<typeof ShopPricingRuleRow>;
export type ShopDiscountTierRow = z.infer<typeof ShopDiscountTierRow>;
export type ShopServiceRow = z.infer<typeof ShopServiceRow>;
export type OrderRow = z.infer<typeof OrderRow>;
export type OrderFileRow = z.infer<typeof OrderFileRow>;
export type OrderServiceRow = z.infer<typeof OrderServiceRow>;
export type PaymentRow = z.infer<typeof PaymentRow>;
export type DeliveryRow = z.infer<typeof DeliveryRow>;
export type MessageRow = z.infer<typeof MessageRow>;
export type SettlementRow = z.infer<typeof SettlementRow>;
export type RefundRow = z.infer<typeof RefundRow>;
export type PushSubscriptionRow = z.infer<typeof PushSubscriptionRow>;
export type WebhookEventRow = z.infer<typeof WebhookEventRow>;

export type OrderFile = z.infer<typeof OrderFile>;
export type ShopService = z.infer<typeof ShopService>;
export type OrderService = z.infer<typeof OrderService>;
export type Message = z.infer<typeof Message>;
export type Shop = z.infer<typeof Shop>;
export type ShopMe = z.infer<typeof ShopMe>;
export type Payment = z.infer<typeof Payment>;
export type Delivery = z.infer<typeof Delivery>;
export type Order = z.infer<typeof Order>;
export type OrderDetail = z.infer<typeof OrderDetail>;
export type ConfirmOrderBody = z.infer<typeof ConfirmOrderBody>;
export type EtaBody = z.infer<typeof EtaBody>;
