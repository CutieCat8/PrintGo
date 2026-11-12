import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/db/server";
import {
  parseRow,
  ShopDiscountTierRow,
  ShopPricingRuleRow,
  ShopRow,
  ShopServiceRow,
} from "@/lib/db/types";
import { quoteDelivery } from "@/lib/delivery";
import {
  calculateTotals,
  customerVisible,
  estimate,
  getFeeRate,
  type Estimate,
} from "@/lib/domain/pricing";
import { ApiError } from "@/lib/errors";
import type { EstimateBody } from "./schemas";

/** Half of the 32-bit limit, leaving room for the 5% fee and for the shop's own price. */
const MAX_ORDER_SATANG = 1_000_000_000;

export type ShopPricing = {
  shop: ShopRow;
  rules: ShopPricingRuleRow[];
  tiers: ShopDiscountTierRow[];
  services: ShopServiceRow[];
};

/** The shop's price list, read from the database (never from the request). Not active -> 404. */
export async function loadShopPricing(
  shopId: string,
  db: SupabaseClient = getServiceClient(),
): Promise<ShopPricing> {
  const shopRes = await db.from("shops").select("*").eq("id", shopId).maybeSingle();
  if (shopRes.error) throw shopRes.error;
  if (!shopRes.data) throw new ApiError("NOT_FOUND", 404);
  const shop = parseRow(ShopRow, shopRes.data);
  if (shop.status !== "active") throw new ApiError("NOT_FOUND", 404);

  const [rules, tiers, services] = await Promise.all([
    db.from("shop_pricing_rules").select("*").eq("shop_id", shopId),
    db.from("shop_discount_tiers").select("*").eq("shop_id", shopId),
    db.from("shop_services").select("*").eq("shop_id", shopId),
  ]);
  for (const res of [rules, tiers, services]) if (res.error) throw res.error;
  return {
    shop,
    rules: (rules.data ?? []).map((r) => parseRow(ShopPricingRuleRow, r)),
    tiers: (tiers.data ?? []).map((r) => parseRow(ShopDiscountTierRow, r)),
    services: (services.data ?? []).map((r) => parseRow(ShopServiceRow, r)),
  };
}

/**
 * Prices one order request against one shop's list (P1 `estimate`). Services come from the shop's
 * own rows, so another shop's service, an inactive one or a made-up id is rejected (422).
 * The delivery fee comes from `quoteDelivery` (Z7, currently a stub with a flat sample fee).
 */
export async function priceOrder(
  pricing: ShopPricing,
  body: Pick<EstimateBody, "fulfillment" | "files" | "services" | "deliveryLat" | "deliveryLng">,
): Promise<{ estimate: Estimate; deliveryFeeSatang: number }> {
  let deliveryFeeSatang = 0;
  if (body.fulfillment === "delivery") {
    if (!pricing.shop.acceptsDelivery) {
      throw new ApiError("VALIDATION_ERROR", 422, "ร้านนี้ไม่รับจัดส่ง");
    }
    if (body.deliveryLat === undefined || body.deliveryLng === undefined) {
      throw new ApiError("VALIDATION_ERROR", 422, "ต้องระบุพิกัดจัดส่ง");
    }
    const quote = await quoteDelivery(pricing.shop.id, {
      lat: body.deliveryLat,
      lng: body.deliveryLng,
    });
    deliveryFeeSatang = quote.feeSatang;
  }

  const result = estimate({
    files: body.files,
    rules: pricing.rules,
    tiers: pricing.tiers,
    shopServices: pricing.services,
    selectedServices: body.services ?? [],
    fulfillment: body.fulfillment,
    deliveryFeeSatang,
  });
  // The database stores satang in a 32-bit integer: refuse an absurd order with 422, not a 500.
  const biggest =
    result.estimatedPrintSatang + result.estimatedServicesSatang + result.deliveryFeeSatang;
  if (biggest > MAX_ORDER_SATANG) {
    throw new ApiError(
      "VALIDATION_ERROR",
      422,
      "ยอดรวมสูงเกินกว่าที่ระบบรับได้ กรุณาแบ่งเป็นหลายออเดอร์",
    );
  }
  return { estimate: result, deliveryFeeSatang: result.deliveryFeeSatang };
}

export type EstimateResponse = {
  requiresManualPrice: boolean;
  estimatedPrintSatang: number | null;
  servicesSatang: number | null;
  serviceLines: {
    serviceId: string;
    name: string;
    unit: "per_set" | "per_order";
    unitPriceSatang: number | null;
    quantity: number;
    lineTotalSatang: number | null;
  }[];
  platformFeeSatang: number | null;
  deliveryFeeSatang: number;
  totalSatang: number | null;
};

/** POST /api/liff/estimate (CONTRACTS 6.1): everything that depends on the shop's price is null when manual. */
export async function estimateForCustomer(body: EstimateBody): Promise<EstimateResponse> {
  const pricing = await loadShopPricing(body.shopId);
  const { estimate: e, deliveryFeeSatang } = await priceOrder(pricing, body);
  const visible = customerVisible(e);

  const serviceLines = visible.serviceLines.map((l) => ({
    serviceId: l.serviceId,
    name: l.name,
    unit: l.unit,
    unitPriceSatang: l.unitPriceSatang,
    quantity: l.quantity,
    lineTotalSatang: l.lineTotalSatang,
  }));

  if (e.requiresManualPrice) {
    return {
      requiresManualPrice: true,
      estimatedPrintSatang: null,
      servicesSatang: null,
      serviceLines,
      platformFeeSatang: null,
      deliveryFeeSatang,
      totalSatang: null,
    };
  }
  const totals = calculateTotals({
    printSubtotalSatang: e.estimatedPrintSatang + e.estimatedServicesSatang,
    deliveryFeeSatang,
    feeRate: getFeeRate(),
  });
  return {
    requiresManualPrice: false,
    estimatedPrintSatang: e.estimatedPrintSatang,
    servicesSatang: e.estimatedServicesSatang,
    serviceLines,
    platformFeeSatang: totals.platformFeeSatang,
    deliveryFeeSatang,
    totalSatang: totals.totalSatang,
  };
}
