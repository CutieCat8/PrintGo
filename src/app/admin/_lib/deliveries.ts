import "server-only";
import { getServiceClient } from "@/lib/db/server";
import { fromDb } from "@/lib/db/case";
import { readLedgerPages, sumSatang } from "@/lib/payment/ledger";
import { DeliveryQueue, AdminOverview } from "./delivery-types";

export function thaiDayRange(now: Date) {
  const day = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
  const start = new Date(`${day}T00:00:00+07:00`);
  return { start: start.toISOString(), end: new Date(start.getTime() + 86400000).toISOString() };
}
export function calculateOverview(
  rows: readonly {
    created_at: string;
    completed_at: string | null;
    status: string;
    platform_fee_satang: number | null;
  }[],
  now: Date,
) {
  const { start, end } = thaiDayRange(now);
  const today = (at: string | null) =>
    at !== null && Date.parse(at) >= Date.parse(start) && Date.parse(at) < Date.parse(end);
  const created = rows.filter((r) => today(r.created_at));
  const completed = rows.filter((r) => r.status === "completed");
  return AdminOverview.parse({
    ordersToday: created.length,
    completedToday: created.filter((r) => r.status === "completed").length,
    platformFeeTodaySatang: sumSatang(
      completed.filter((r) => today(r.completed_at)).map((r) => r.platform_fee_satang ?? NaN),
    ),
    platformFeeTotalSatang: sumSatang(completed.map((r) => r.platform_fee_satang ?? NaN)),
  });
}
export async function loadOverview(now = new Date()) {
  const db = getServiceClient();
  const rows = await readLedgerPages<{
    id: string;
    created_at: string;
    completed_at: string | null;
    status: string;
    platform_fee_satang: number | null;
  }>((after) => {
    let q = db
      .from("orders")
      .select("id,created_at,completed_at,status,platform_fee_satang")
      .order("id")
      .limit(100);
    if (after) q = q.gt("id", after);
    return q;
  });
  return calculateOverview(rows, now);
}
export async function loadDeliveryQueue() {
  const db = getServiceClient();
  type Row = {
    id: string;
    order_id: string;
    provider: string;
    status: string;
    fee_satang: number | null;
    tracking_url: string | null;
    note: string | null;
    updated_at: string;
    orders: {
      order_no: string;
      status: string;
      delivery_address: string | null;
      delivery_recipient_name: string | null;
      delivery_recipient_phone: string | null;
      delivery_lat: number | null;
      delivery_lng: number | null;
      delivery_fee_satang: number;
      shops: { name: string; address: string; phone: string };
    };
  };
  const rows = await readLedgerPages<Row>((after) => {
    let q = db
      .from("deliveries")
      .select(
        "id,order_id,provider,status,fee_satang,tracking_url,note,updated_at,orders!inner(order_no,status,delivery_address,delivery_recipient_name,delivery_recipient_phone,delivery_lat,delivery_lng,delivery_fee_satang,shops!inner(name,address,phone))",
      )
      .eq("provider", "manual")
      .in("orders.status", ["courier_requested", "in_transit"])
      .order("id")
      .limit(100);
    if (after) q = q.gt("id", after);
    return q as unknown as PromiseLike<{ data: Row[] | null; error: unknown }>;
  });
  return DeliveryQueue.parse({
    deliveries: rows.map((r) => ({
      id: r.order_id,
      orderNo: r.orders.order_no,
      status: r.orders.status,
      shop: r.orders.shops,
      address: r.orders.delivery_address,
      recipientName: r.orders.delivery_recipient_name,
      recipientPhone: r.orders.delivery_recipient_phone,
      lat: r.orders.delivery_lat,
      lng: r.orders.delivery_lng,
      estimatedFeeSatang: r.orders.delivery_fee_satang,
      delivery: fromDb(r),
    })),
  });
}
