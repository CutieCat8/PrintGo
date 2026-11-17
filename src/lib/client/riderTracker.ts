import type { OrderStatus } from "@/lib/db/types";

/**
 * Rider tracking card for delivery orders (LIFF). The four stages are the customer's view of
 * courier_requested -> in_transit -> completed. Grab / a real rider feed is not connected, so while
 * the order is still open the card SIMULATES the stages, 6 seconds each (SAMPLE behaviour, not real
 * rider data: CLAUDE.md rules 8 and 9). A real status is a floor: it never shows less than the truth.
 */
export const RIDER_STAGES = [
  {
    key: "searching",
    label: "หาไรเดอร์",
    title: "กำลังค้นหาไรเดอร์",
    hint: "กำลังหาไรเดอร์ใกล้ร้าน",
  },
  {
    key: "to_pickup",
    label: "ไปรับของ",
    title: "ไรเดอร์กำลังไปรับของ",
    hint: "ไรเดอร์รับงานแล้ว กำลังไปที่ร้าน",
  },
  {
    key: "delivering",
    label: "กำลังส่ง",
    title: "ไรเดอร์กำลังส่งของ",
    hint: "ของอยู่กับไรเดอร์ กำลังมาหาคุณ",
  },
  { key: "arrived", label: "ถึงแล้ว", title: "ถึงแล้ว", hint: "ไรเดอร์ส่งของถึงที่หมายแล้ว" },
] as const;

export type RiderStage = 0 | 1 | 2 | 3;
/** Seconds the simulation stays on each stage. */
export const STAGE_SECONDS = 6;

/** Stage to show now. `elapsedMs` = time since the card first appeared for this order. */
export function riderStage(status: OrderStatus, elapsedMs: number): RiderStage {
  if (status === "completed") return 3;
  const floor: RiderStage = status === "in_transit" ? 2 : 0;
  const simulated = Math.min(3, Math.max(0, Math.floor(elapsedMs / (STAGE_SECONDS * 1000))));
  return Math.max(floor, simulated) as RiderStage;
}

/** Sample arrival window (15-25 min after the card first appeared): a made-up figure, not a quote. */
export function sampleArrivalWindow(startedAtMs: number): { from: Date; to: Date } {
  return { from: new Date(startedAtMs + 15 * 60_000), to: new Date(startedAtMs + 25 * 60_000) };
}
