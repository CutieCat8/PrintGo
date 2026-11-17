import { isHandedOffToDelivery } from "@/components/ui/status";
import type { Order } from "@/lib/db/types";

/** The shop's "finished" orders split by how they ended, with the true count of each. */
export type DoneGroupKey = "completed" | "handed_off" | "rejected" | "cancelled" | "expired";

export type DoneGroup = {
  key: DoneGroupKey;
  title: string;
  /** Every order of this kind, not only the ones listed. */
  count: number;
  /** The most recent ones (at most `perGroup`). */
  items: Order[];
};

const GROUPS: { key: DoneGroupKey; title: string }[] = [
  { key: "completed", title: "เสร็จสิ้น" },
  { key: "handed_off", title: "ปริ้นเสร็จแล้ว (ส่งถึงที่)" },
  { key: "rejected", title: "ร้านปฏิเสธ" },
  { key: "cancelled", title: "ยกเลิก" },
  { key: "expired", title: "หมดเวลา" },
];

/** Which group an order belongs to, or null while the shop still has work on it. */
export function doneGroupOf(o: Pick<Order, "status" | "fulfillment">): DoneGroupKey | null {
  if (o.status === "completed" || o.status === "rejected") return o.status;
  if (o.status === "cancelled" || o.status === "expired") return o.status;
  return isHandedOffToDelivery(o.status, o.fulfillment) ? "handed_off" : null;
}

/** Non-empty groups in a fixed order, newest first inside each. */
export function groupDoneOrders(orders: Order[], perGroup = 30): DoneGroup[] {
  const sorted = [...orders].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return GROUPS.map(({ key, title }) => {
    const all = sorted.filter((o) => doneGroupOf(o) === key);
    return { key, title, count: all.length, items: all.slice(0, perGroup) };
  }).filter((g) => g.count > 0);
}
