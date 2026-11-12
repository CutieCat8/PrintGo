import { describe, expect, it } from "vitest";
import { isShopOpen, type HoursRow } from "./hours";

// 2026-11-11 is a Wednesday (3), 11-12 Thursday (4), 11-13 Friday (5), 11-15 Sunday (0).
const bkk = (iso: string) => new Date(`${iso}+07:00`);

const day = (
  weekday: number,
  open = "09:00:00",
  close = "18:00:00",
  isClosed = false,
): HoursRow => ({
  weekday,
  openTime: open,
  closeTime: close,
  isClosed,
});
// Open every day 09:00-18:00, closed on Sunday.
const week: HoursRow[] = [0, 1, 2, 3, 4, 5, 6].map((d) => day(d, "09:00", "18:00", d === 0));

const shop = { isPaused: false, cutoffMinutes: 30 };

describe("isShopOpen", () => {
  it("is closed before opening and tells when it opens today", () => {
    expect(isShopOpen(shop, week, bkk("2026-11-12T08:59:00"))).toEqual({
      isOpen: false,
      opensAt: "09:00",
      closesAt: "18:00",
    });
  });

  it("is open from the opening minute", () => {
    expect(isShopOpen(shop, week, bkk("2026-11-12T09:00:00")).isOpen).toBe(true);
    expect(isShopOpen(shop, week, bkk("2026-11-12T13:00:00"))).toEqual({
      isOpen: true,
      opensAt: "09:00",
      closesAt: "18:00",
    });
  });

  it("stops taking jobs when less than cutoff minutes remain (exactly cutoff is still open)", () => {
    expect(isShopOpen(shop, week, bkk("2026-11-12T17:30:00")).isOpen).toBe(true); // 30 left
    expect(isShopOpen(shop, week, bkk("2026-11-12T17:31:00")).isOpen).toBe(false); // 29 left
  });

  it("after the cutoff it reports the next opening (tomorrow)", () => {
    expect(isShopOpen(shop, week, bkk("2026-11-12T17:45:00"))).toEqual({
      isOpen: false,
      opensAt: "09:00",
      closesAt: "18:00",
    });
  });

  it("is closed at and after closing time, even with cutoff 0", () => {
    const noCutoff = { isPaused: false, cutoffMinutes: 0 };
    expect(isShopOpen(noCutoff, week, bkk("2026-11-12T17:59:00")).isOpen).toBe(true);
    expect(isShopOpen(noCutoff, week, bkk("2026-11-12T18:00:00")).isOpen).toBe(false);
    expect(isShopOpen(noCutoff, week, bkk("2026-11-12T23:59:00")).isOpen).toBe(false);
  });

  it("a paused shop is never open but still shows its hours", () => {
    expect(isShopOpen({ ...shop, isPaused: true }, week, bkk("2026-11-12T13:00:00"))).toEqual({
      isOpen: false,
      opensAt: "09:00",
      closesAt: "18:00",
    });
  });

  it("a day marked closed is closed and points to the next open day", () => {
    // Sunday 2026-11-15 is closed; Monday opens at 10:00 in this schedule.
    const hours = week.map((h) => (h.weekday === 1 ? day(1, "10:00", "19:00") : h));
    expect(isShopOpen(shop, hours, bkk("2026-11-15T12:00:00"))).toEqual({
      isOpen: false,
      opensAt: "10:00",
      closesAt: "19:00",
    });
  });

  it("a day with no hours row counts as closed", () => {
    const withoutThursday = week.filter((h) => h.weekday !== 4);
    expect(isShopOpen(shop, withoutThursday, bkk("2026-11-12T13:00:00"))).toEqual({
      isOpen: false,
      opensAt: "09:00", // Friday
      closesAt: "18:00",
    });
  });

  it("a shop with no hours at all is closed with no times", () => {
    expect(isShopOpen(shop, [], bkk("2026-11-12T13:00:00"))).toEqual({
      isOpen: false,
      opensAt: null,
      closesAt: null,
    });
  });

  it("a shop open only one day of the week finds that day again next week", () => {
    const onlyThursday = [day(4, "09:00", "18:00")];
    expect(isShopOpen(shop, onlyThursday, bkk("2026-11-12T19:00:00"))).toEqual({
      isOpen: false,
      opensAt: "09:00",
      closesAt: "18:00",
    });
  });

  it("uses Thai time, not UTC: 18:00Z on Thursday is 01:00 on Friday in Bangkok", () => {
    const fridayOnly = [day(5, "00:30", "23:00")];
    const instant = new Date("2026-11-12T18:00:00Z");
    expect(isShopOpen(shop, fridayOnly, instant).isOpen).toBe(true);
    // The same instant read as UTC would be Thursday, where this shop has no hours.
    const thursdayOnly = [day(4, "00:30", "23:00")];
    expect(isShopOpen(shop, thursdayOnly, instant).isOpen).toBe(false);
  });

  it("the weekday follows Thai midnight: 17:00Z Saturday is already Sunday (closed)", () => {
    // 2026-11-14 is Saturday (6); 17:00Z = 00:00 Sunday 2026-11-15 in Bangkok.
    expect(isShopOpen(shop, week, new Date("2026-11-14T16:59:00Z")).isOpen).toBe(false); // 23:59 Sat
    expect(isShopOpen(shop, week, new Date("2026-11-15T03:00:00Z"))).toMatchObject({
      isOpen: false, // 10:00 Sunday, closed day
      opensAt: "09:00", // Monday
    });
  });

  it("after closing, the next opening is tomorrow's hours, not today's", () => {
    const hours = [day(4, "09:00", "18:00"), day(5, "10:00", "19:00")];
    expect(isShopOpen(shop, hours, bkk("2026-11-12T19:00:00"))).toEqual({
      isOpen: false,
      opensAt: "10:00",
      closesAt: "19:00",
    });
    // Inside the cutoff window: the same rule.
    expect(isShopOpen(shop, hours, bkk("2026-11-12T17:45:00")).opensAt).toBe("10:00");
  });

  it("accepts a closing time of 24:00 (Postgres allows it) as end of day", () => {
    const hours = [day(4, "09:00", "24:00:00")];
    expect(isShopOpen(shop, hours, bkk("2026-11-12T23:30:00"))).toEqual({
      isOpen: true,
      opensAt: "09:00",
      closesAt: "24:00",
    });
    expect(isShopOpen(shop, hours, bkk("2026-11-12T23:31:00")).isOpen).toBe(false);
  });

  it("does not accept 24:00 as an opening time or anything later", () => {
    expect(() =>
      isShopOpen(shop, [day(4, "24:00", "24:00")], bkk("2026-11-12T10:00:00")),
    ).toThrow();
    expect(() =>
      isShopOpen(shop, [day(4, "09:00", "25:00")], bkk("2026-11-12T10:00:00")),
    ).toThrow();
  });

  it("reads the clock to the minute: 17:30:59 still counts as 17:30", () => {
    expect(isShopOpen(shop, week, bkk("2026-11-12T17:30:59")).isOpen).toBe(true);
  });

  it("reads Postgres times with seconds", () => {
    const hours = [day(4, "09:00:00", "18:00:00")];
    expect(isShopOpen(shop, hours, bkk("2026-11-12T10:00:00")).closesAt).toBe("18:00");
  });

  it("throws on an invalid time or date", () => {
    expect(() => isShopOpen(shop, [day(4, "9am", "18:00")], bkk("2026-11-12T10:00:00"))).toThrow();
    expect(() => isShopOpen(shop, week, new Date("nope"))).toThrow();
  });
});
