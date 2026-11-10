import { z } from "zod";

/**
 * Enum values, exactly as in docs/CONTRACTS.md section 2 (same names, same order).
 * The SQL migration declares the same types; migration.test.ts fails if the two drift apart.
 */
export const ENUMS = {
  OrderStatus: [
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
  ],
  Fulfillment: ["pickup", "delivery"],
  ColorMode: ["bw", "color"],
  Paper: ["A4", "A3"],
  Sides: ["single", "double"],
  ShopStatus: ["pending", "active", "suspended"],
  PaymentStatus: ["pending", "pending_review", "verified", "rejected"],
  PaymentVerifier: ["slipok", "admin"],
  DeliveryProviderName: ["manual", "grab"],
  DeliveryStatus: ["pending_admin", "booked", "in_transit", "delivered", "failed", "cancelled"],
  MessageSender: ["customer", "shop", "system"],
  SettlementStatus: ["pending", "paid"],
  RefundStatus: ["pending", "paid"],
  Role: ["shop", "admin"],
  ServiceUnit: ["per_set", "per_order"],
} as const;

export const OrderStatus = z.enum(ENUMS.OrderStatus);
export const Fulfillment = z.enum(ENUMS.Fulfillment);
export const ColorMode = z.enum(ENUMS.ColorMode);
export const Paper = z.enum(ENUMS.Paper);
export const Sides = z.enum(ENUMS.Sides);
export const ShopStatus = z.enum(ENUMS.ShopStatus);
export const PaymentStatus = z.enum(ENUMS.PaymentStatus);
export const PaymentVerifier = z.enum(ENUMS.PaymentVerifier);
export const DeliveryProviderName = z.enum(ENUMS.DeliveryProviderName);
export const DeliveryStatus = z.enum(ENUMS.DeliveryStatus);
export const MessageSender = z.enum(ENUMS.MessageSender);
export const SettlementStatus = z.enum(ENUMS.SettlementStatus);
export const RefundStatus = z.enum(ENUMS.RefundStatus);
export const Role = z.enum(ENUMS.Role);
export const ServiceUnit = z.enum(ENUMS.ServiceUnit);

export type OrderStatus = z.infer<typeof OrderStatus>;
export type Fulfillment = z.infer<typeof Fulfillment>;
export type ColorMode = z.infer<typeof ColorMode>;
export type Paper = z.infer<typeof Paper>;
export type Sides = z.infer<typeof Sides>;
export type ShopStatus = z.infer<typeof ShopStatus>;
export type PaymentStatus = z.infer<typeof PaymentStatus>;
export type PaymentVerifier = z.infer<typeof PaymentVerifier>;
export type DeliveryProviderName = z.infer<typeof DeliveryProviderName>;
export type DeliveryStatus = z.infer<typeof DeliveryStatus>;
export type MessageSender = z.infer<typeof MessageSender>;
export type SettlementStatus = z.infer<typeof SettlementStatus>;
export type RefundStatus = z.infer<typeof RefundStatus>;
export type Role = z.infer<typeof Role>;
export type ServiceUnit = z.infer<typeof ServiceUnit>;
