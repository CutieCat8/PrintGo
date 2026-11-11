import {
  Delivery,
  Order,
  OrderDetail,
  OrderFile,
  OrderService,
  Payment,
  type DeliveryRow,
  type OrderFileRow,
  type OrderRow,
  type OrderServiceRow,
  type PaymentRow,
} from "@/lib/db/types";
import type { z } from "zod";

/** Who is looking: decides what is hidden (CONTRACTS 6.6, CLAUDE.md rules 3.7 and 10). */
export type Viewer = "customer" | "shop";

const PICKUP_CODE_VISIBLE = ["paid", "printing", "ready"];

/**
 * The `Order` of CONTRACTS 6.6. Output goes through the shared Zod schema, which keeps only the
 * listed fields, so nothing else of the database row can leak.
 * - customer, price set by the shop, still `submitted`: our estimate is hidden (null);
 * - pickup code: only the customer, only for a pickup order that is paid/printing/ready.
 */
export function presentOrder(
  row: OrderRow,
  opts: { shopName: string; viewer: Viewer; unreadMessageCount?: number },
): OrderView {
  const hidePrice =
    opts.viewer === "customer" && row.requiresManualPrice && row.status === "submitted";
  const showPickupCode =
    opts.viewer === "customer" &&
    row.fulfillment === "pickup" &&
    PICKUP_CODE_VISIBLE.includes(row.status);
  return Order.parse({
    ...row,
    estimatedPrintSatang: hidePrice ? null : row.estimatedPrintSatang,
    estimatedServicesSatang: hidePrice ? null : row.estimatedServicesSatang,
    pickupCode: showPickupCode ? row.pickupCode : null,
    shopName: opts.shopName,
    unreadMessageCount: opts.unreadMessageCount ?? 0, // real number comes with chat (P8)
  });
}
export type OrderView = z.infer<typeof Order>;

/** What a shop gets: OrderDetail without the recipient's name and phone. */
export const ShopOrderDetail = OrderDetail.omit({
  deliveryRecipientName: true,
  deliveryRecipientPhone: true,
});
export type OrderDetailView = z.infer<typeof OrderDetail>;
export type ShopOrderDetailView = z.infer<typeof ShopOrderDetail>;

export type DetailParts = {
  shop: { id: string; name: string; address: string; phone: string };
  files: OrderFileRow[];
  services: OrderServiceRow[];
  payment: PaymentRow | null;
  delivery: DeliveryRow | null;
};

function presentParts(row: OrderRow, parts: DetailParts, viewer: Viewer) {
  const hidePrice = viewer === "customer" && row.requiresManualPrice && row.status === "submitted";
  return {
    files: parts.files.map((f) => OrderFile.parse(f)),
    services: parts.services.map((s) => {
      const lineTotal =
        s.unitPriceSatang === null || hidePrice ? null : s.unitPriceSatang * s.quantity;
      return OrderService.parse({
        id: s.id,
        name: s.name,
        unit: s.unit,
        unitPriceSatang: hidePrice ? null : s.unitPriceSatang,
        fileId: s.orderFileId,
        quantity: s.quantity,
        lineTotalSatang: lineTotal,
      });
    }),
    payment: parts.payment ? Payment.parse(parts.payment) : null, // never slipPath / slipRef
    delivery: parts.delivery ? Delivery.parse(parts.delivery) : null,
    deliveryAddress: row.deliveryAddress,
    shop: parts.shop,
  };
}

/** `OrderDetail` for the customer who owns the order (includes the recipient). */
export function presentCustomerOrderDetail(
  row: OrderRow,
  parts: DetailParts,
  opts: { unreadMessageCount?: number } = {},
): OrderDetailView {
  return OrderDetail.parse({
    ...presentOrder(row, { shopName: parts.shop.name, viewer: "customer", ...opts }),
    ...presentParts(row, parts, "customer"),
    deliveryRecipientName: row.deliveryRecipientName,
    deliveryRecipientPhone: row.deliveryRecipientPhone,
  });
}

/** `OrderDetail` for the shop: no pickup code, no recipient name/phone (CLAUDE.md rule 10). */
export function presentShopOrderDetail(
  row: OrderRow,
  parts: DetailParts,
  opts: { unreadMessageCount?: number } = {},
): ShopOrderDetailView {
  return ShopOrderDetail.parse({
    ...presentOrder(row, { shopName: parts.shop.name, viewer: "shop", ...opts }),
    ...presentParts(row, parts, "shop"),
  });
}
