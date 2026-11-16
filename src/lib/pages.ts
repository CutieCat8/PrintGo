/**
 * Page selection ("พิมพ์ 7 จาก 12 หน้า"): "1-3, 5, 8-10" <-> a list of page numbers.
 * Pure and shared: the browser uses it to validate what the customer types, the server uses it to
 * count the pages that are billed (the browser's count is never trusted).
 * A stored range is canonical: sorted, no duplicates, no spaces ("1-3,5,8-10"). `null` = all pages.
 */

export type PageRangeResult =
  { ok: true; pages: number[]; canonical: string | null } | { ok: false; message: string };

/**
 * The longest text we accept. The odd pages of a 10,000-page file are ~24,000 characters, so the
 * cap is above that. Parsing stays cheap: ranges are merged as intervals (no per-page loop per
 * token), so the work is bounded by the text length and by the file's page count.
 */
export const MAX_RANGE_TEXT = 30_000;

const SEPARATORS = /[,，;；\s]+/;
const DASHES = /[–—−]/g;
const SPACED_DASH = /\s*-\s*/g;

/** [1,2,3,5,8,9,10] -> "1-3,5,8-10" */
export function formatRanges(pages: readonly number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `${sorted[i]}-${sorted[j]}` : String(sorted[i]));
    i = j + 1;
  }
  return parts.join(",");
}

/**
 * Parses what a customer typed against a file of `total` pages. Empty text is an error here (the
 * caller decides what "all pages" means). Selecting every page gives `canonical: null`.
 */
export function parsePageRange(input: string, total: number): PageRangeResult {
  if (!Number.isInteger(total) || total < 1)
    return { ok: false, message: "ไม่ทราบจำนวนหน้าของไฟล์" };
  if (input.length > MAX_RANGE_TEXT) return { ok: false, message: "ช่วงหน้ายาวเกินไป" };
  const tokens = input
    .replace(DASHES, "-")
    .replace(SPACED_DASH, "-") // "1 - 3" is "1-3"
    .split(SEPARATORS)
    .filter((t) => t !== "");
  if (tokens.length === 0) return { ok: false, message: "ระบุหน้าที่ต้องการพิมพ์" };

  const intervals: [number, number][] = [];
  for (const token of tokens) {
    const m = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(token);
    if (!m)
      return {
        ok: false,
        message: `อ่านช่วงหน้า "${token.slice(0, 20)}" ไม่ได้ ใช้รูปแบบเช่น 1-3, 5, 8-10`,
      };
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : Number(m[2]);
    if (from < 1 || to < 1) return { ok: false, message: "หน้าเริ่มที่ 1" };
    if (from > to) return { ok: false, message: `ช่วง ${from}-${to} กลับด้าน` };
    if (to > total) return { ok: false, message: `ไฟล์นี้มี ${total} หน้า` };
    intervals.push([from, to]);
  }
  // Merge overlapping/adjacent intervals, then list the pages once (at most `total` of them).
  intervals.sort((x, y) => x[0] - y[0]);
  const pages: number[] = [];
  let next = 1;
  for (const [from, to] of intervals) {
    for (let p = Math.max(from, next); p <= to; p++) pages.push(p);
    next = Math.max(next, to + 1);
  }
  return { ok: true, pages, canonical: pages.length === total ? null : formatRanges(pages) };
}

/**
 * Pages that will be printed for one copy. `null`/empty range = all `total` pages. A range that
 * does not parse counts as all pages here (display only); the server rejects it before billing.
 */
export function selectedPageCount(range: string | null | undefined, total: number): number {
  if (range === null || range === undefined || range === "") return total;
  const r = parsePageRange(range, total);
  return r.ok ? r.pages.length : total;
}
