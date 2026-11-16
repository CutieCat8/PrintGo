/** Pure helpers of the TimePicker (24-hour "HH:mm"). */

export type TimeParts = { hour: string; minute: string };

const TIME = /^(\d{2}):(\d{2})$/;

/** "09:30" -> { hour: "09", minute: "30" }; anything else (empty, malformed) -> both empty. */
export function splitTime(value: string | undefined): TimeParts {
  const m = value ? TIME.exec(value) : null;
  return m ? { hour: m[1], minute: m[2] } : { hour: "", minute: "" };
}

/**
 * The value to report for the chosen parts, or "" while there is no hour yet. A chosen hour with no
 * minute means ":00". With `allow24`, hour 24 is only valid as "24:00" (closing at midnight).
 */
export function joinTime({ hour, minute }: TimeParts, allow24 = false): string {
  if (!hour) return "";
  if (hour === "24") return allow24 ? "24:00" : "";
  return `${hour}:${minute || "00"}`;
}

export function hourOptions(allow24 = false): string[] {
  const last = allow24 ? 24 : 23;
  return Array.from({ length: last + 1 }, (_, h) => String(h).padStart(2, "0"));
}

/** Every minute "00" to "59" (the panel scrolls, so no steps are needed and no saved minute is hidden). */
export function allMinutes(): string[] {
  return Array.from({ length: 60 }, (_, m) => String(m).padStart(2, "0"));
}
