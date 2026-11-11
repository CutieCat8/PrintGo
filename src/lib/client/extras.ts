import type { ShopListItem, SelectedService } from "./types";

/**
 * Finishing the customer can ask for per file while setting up the order (ปกใส, เข้าเล่ม ...).
 * These are NOT prices or new API fields: services stay each shop's own (D22). After a shop is
 * chosen, each wish is matched to that shop's service by name and pre-ticked; the customer can
 * still change it on the summary page. A shop without a match is shown as "ไม่มี ...".
 */
export const EXTRAS = [
  { key: "clear_cover", label: "ปกใส", icon: "📘", match: /ปกใส|ปกพลาสติก/ },
  { key: "binding", label: "เข้าเล่ม", icon: "📚", match: /เข้าเล่ม|สันกาว|สันเกลียว|สันห่วง/ },
  { key: "staple", label: "เย็บมุม", icon: "📎", match: /เย็บ/ },
  { key: "laminate", label: "เคลือบ", icon: "✨", match: /เคลือบ/ },
  { key: "punch", label: "เจาะรู", icon: "🕳️", match: /เจาะ/ },
] as const;

export type ExtraKey = (typeof EXTRAS)[number]["key"];

export const EXTRA_LABEL = Object.fromEntries(EXTRAS.map((e) => [e.key, e.label])) as Record<
  ExtraKey,
  string
>;

type Service = ShopListItem["services"][number];

/** The shop's first service whose name matches the wish, or null. */
export function matchService(services: Service[], key: ExtraKey): Service | null {
  const extra = EXTRAS.find((e) => e.key === key);
  if (!extra) return null;
  return services.find((s) => extra.match.test(s.name)) ?? null;
}

/** Every wish across the files, in catalogue order, without repeats. */
export function wantedExtras(files: { extras?: ExtraKey[] }[]): ExtraKey[] {
  const all = new Set(files.flatMap((f) => f.extras ?? []));
  return EXTRAS.map((e) => e.key).filter((k) => all.has(k));
}

/** Which of the wished extras this shop offers, and which it does not. */
export function shopExtras(services: Service[], wanted: ExtraKey[]) {
  const has: ExtraKey[] = [];
  const missing: ExtraKey[] = [];
  for (const k of wanted) (matchService(services, k) ? has : missing).push(k);
  return { has, missing };
}

/**
 * The shop services to pre-select for the files' wishes. A per-set service applies to the files
 * that asked for it (left out = every file, the API default); a per-order service once.
 */
export function servicesForExtras(
  services: Service[],
  files: { extras?: ExtraKey[] }[],
): SelectedService[] {
  const chosen = new Map<string, { unit: Service["unit"]; files: Set<number> }>();
  files.forEach((f, i) => {
    for (const k of f.extras ?? []) {
      const s = matchService(services, k);
      if (!s) continue;
      const entry = chosen.get(s.id) ?? { unit: s.unit, files: new Set<number>() };
      entry.files.add(i);
      chosen.set(s.id, entry);
    }
  });
  return [...chosen].map(([serviceId, { unit, files: idx }]) => {
    if (unit === "per_order" || idx.size === files.length) return { serviceId };
    return { serviceId, fileIndexes: [...idx].sort((a, b) => a - b) };
  });
}
