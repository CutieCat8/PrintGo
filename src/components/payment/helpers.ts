export function slipFileProblem(file: Pick<File, "type" | "size">): string | null {
  if (!["image/jpeg", "image/png"].includes(file.type)) return "รองรับสลิป JPEG หรือ PNG เท่านั้น";
  if (file.size <= 0 || file.size > 5 * 1024 * 1024)
    return "รูปสลิปต้องมีขนาดไม่เกิน 5 MB และไม่ใช่ไฟล์ว่าง";
  return null;
}
export function secondsLeft(deadline: string, now: number): number {
  const target = Date.parse(deadline);
  return Number.isFinite(target) ? Math.max(0, Math.ceil((target - now) / 1000)) : 0;
}
export function countdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
export const PAID_STATUSES = new Set([
  "paid",
  "printing",
  "ready",
  "courier_requested",
  "in_transit",
  "completed",
]);
