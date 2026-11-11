import type { SlipResult } from "./types";

/** O9: no automatic approval without a trustworthy verification result. */
export function manualReview(): SlipResult {
  return { result: "review", reason: "กำลังรอเจ้าหน้าที่ตรวจสอบสลิป" };
}
