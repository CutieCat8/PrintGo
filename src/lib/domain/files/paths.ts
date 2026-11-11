import { randomUUID } from "node:crypto";

/**
 * Customer files live in the private `order-files` bucket (never public, CLAUDE.md rule 5).
 * CONTRACTS section 3 writes paths with the bucket name in front:
 *   order-files/pending/{customerId}/{uuid}-{name}   before the order exists
 *   order-files/{orderId}/{uuid}-{name}              after P5 moved the file into the order
 * `path` in the API and `order_files.storage_path` use that full form; Storage calls use the key
 * without the bucket name (see toObjectKey).
 */
export const ORDER_FILES_BUCKET = "order-files";

/** O6 (open, default): at most 10 files of at most 20 MB per order. */
export const MAX_FILES_PER_ORDER = 10;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** D8: PDF and images only. The value is the extension used in storage keys. */
export const ALLOWED_MIME = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
} as const;
export type AllowedMime = keyof typeof ALLOWED_MIME;
export const ALLOWED_MIME_TYPES = Object.keys(ALLOWED_MIME) as AllowedMime[];

const MAX_STEM_LENGTH = 80;
const MAX_ORIGINAL_NAME_LENGTH = 255;

/** Characters that never belong in a shown file name: control characters and bidi overrides. */
const UNSAFE_DISPLAY_CHARS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;

function baseName(name: string): string {
  const parts = name.split(/[\\/]/);
  return parts[parts.length - 1] ?? "";
}

/**
 * The name to show people (the shop's file list). Never used in a storage path.
 * Drops any folder part and control characters, keeps Thai and other letters, caps the length.
 */
export function cleanOriginalName(name: string): string {
  const cleaned = baseName(name.normalize("NFC")).replace(UNSAFE_DISPLAY_CHARS, "").trim();
  const capped = Array.from(cleaned).slice(0, MAX_ORIGINAL_NAME_LENGTH).join("");
  return capped === "" ? "file" : capped;
}

/**
 * A storage-safe file name: `{uuid}-{stem}.{ext}`.
 * Storage keys are kept to ASCII letters, digits, `.`, `_` and `-`, because object stores reject
 * or mangle many other characters. A Thai-only name becomes the stem "file"; the real name is kept
 * in `order_files.original_name`. The extension comes from the (allowed) mime type, never from the
 * name, so a PDF cannot be stored as `.html`. The uuid keeps names unique.
 */
export function sanitizeStorageName(name: string, mime: AllowedMime, uuid = randomUUID()): string {
  const withoutExt = baseName(name.normalize("NFC")).replace(/\.[A-Za-z0-9]{1,8}$/, "");
  const stem =
    withoutExt
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/\.{2,}/g, ".")
      .replace(/^[._-]+|[._-]+$/g, "")
      .slice(0, MAX_STEM_LENGTH)
      .replace(/[._-]+$/g, "") || "file";
  return `${uuid}-${stem}.${ALLOWED_MIME[mime]}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The path to hand out for a new upload: order-files/pending/{customerId}/{uuid}-{name}. */
export function pendingPath(customerId: string, storageName: string): string {
  if (!UUID.test(customerId)) throw new Error("pendingPath: customerId must be a uuid");
  return `${ORDER_FILES_BUCKET}/pending/${customerId}/${storageName}`;
}

/** The Storage key (without the bucket name) for a full path, or null if it is not a safe path. */
export function toObjectKey(path: string): string | null {
  const prefix = `${ORDER_FILES_BUCKET}/`;
  if (!path.startsWith(prefix)) return null;
  const key = path.slice(prefix.length);
  const segments = key.split("/");
  const safe = segments.every(
    (s) => s !== "" && s !== "." && s !== ".." && !/[\\\u0000-\u001f]/.test(s),
  );
  return safe && segments.length >= 2 ? key : null;
}

/** Is this a file the given customer uploaded and has not attached to an order yet? */
export function isPendingPathOf(customerId: string, path: string): boolean {
  const key = toObjectKey(path);
  if (key === null) return false;
  const segments = key.split("/");
  return segments.length === 3 && segments[0] === "pending" && segments[1] === customerId;
}

/** Where a pending file goes once it belongs to an order: order-files/{orderId}/{same file name}. */
export function orderPathFor(orderId: string, pendingFilePath: string): string {
  const key = toObjectKey(pendingFilePath);
  if (key === null || !UUID.test(orderId)) throw new Error("orderPathFor: bad path or order id");
  const fileName = key.split("/")[2];
  return `${ORDER_FILES_BUCKET}/${orderId}/${fileName}`;
}
