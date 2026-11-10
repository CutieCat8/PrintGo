/** Opening hours in Thai time (Asia/Bangkok), as the shop's customers see them. */
export type HoursShop = { isPaused: boolean; cutoffMinutes: number };
export type HoursRow = {
  weekday: number; // 0 = Sunday .. 6 = Saturday
  openTime: string; // "HH:MM" or "HH:MM:SS" (Postgres time)
  closeTime: string;
  isClosed: boolean;
};
export type OpenState = { isOpen: boolean; opensAt: string | null; closesAt: string | null };

// Thailand has no daylight saving, so a fixed +7 hours is exact for Asia/Bangkok. Using it
// (instead of the server's local zone) keeps the answer the same on any machine.
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MINUTES = 24 * 60;

function bangkokNow(now: Date): { weekday: number; minutes: number } {
  if (Number.isNaN(now.getTime())) throw new Error("isShopOpen: invalid date");
  const local = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  return { weekday: local.getUTCDay(), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

/** "24:00" is accepted for a closing time only (Postgres allows it): it means end of day. */
function toMinutes(time: string, allowEndOfDay = false): number {
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!m) throw new Error(`Invalid time "${time}"`);
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  if (minutes > DAY_MINUTES || (minutes === DAY_MINUTES && !allowEndOfDay))
    throw new Error(`Invalid time "${time}"`);
  return minutes;
}

function format(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * Is the shop taking new jobs right now?
 * - paused, closed that day, no hours row for the day, before opening, at or after closing: no
 * - less than `cutoffMinutes` left before closing: no ("closing soon, no new jobs")
 *   (exactly `cutoffMinutes` left is still open)
 * Seconds are ignored (the clock is read to the minute), so 17:30:59 still counts as 17:30. P5 must use this
 * same function when it checks "is the shop open" for a new order.
 * `opensAt`/`closesAt` are "HH:mm": today's hours while today's window is still ahead or running,
 * otherwise the next day the shop opens. They describe the schedule, so a paused shop shows them too.
 */
export function isShopOpen(shop: HoursShop, hours: readonly HoursRow[], now: Date): OpenState {
  const { weekday, minutes } = bangkokNow(now);

  const today = hours.find((h) => h.weekday === weekday && !h.isClosed);
  if (today) {
    const open = toMinutes(today.openTime);
    const close = toMinutes(today.closeTime, true);
    const window = { opensAt: format(open), closesAt: format(close) };
    if (minutes < open) return { isOpen: false, ...window };
    if (minutes < close && close - minutes >= shop.cutoffMinutes) {
      return { isOpen: !shop.isPaused, ...window };
    }
  }

  for (let offset = 1; offset <= 7; offset++) {
    const next = hours.find((h) => h.weekday === (weekday + offset) % 7 && !h.isClosed);
    if (next) {
      return {
        isOpen: false,
        opensAt: format(toMinutes(next.openTime)),
        closesAt: format(toMinutes(next.closeTime, true)),
      };
    }
  }
  return { isOpen: false, opensAt: null, closesAt: null };
}
