import type { ErrorCode } from "@/lib/errors";

/**
 * The only place in the frontend that calls fetch(). Pages use `api` from ./api instead.
 */

/** Codes from CONTRACTS section 1, plus two the client adds when there is no API answer. */
export type ClientErrorCode = ErrorCode | "NETWORK" | "UNKNOWN";

/** Thai text for each code, used when the server sends no message (or no answer at all). */
const FALLBACK_MESSAGE: Record<ClientErrorCode, string> = {
  UNAUTHENTICATED: "กรุณาเข้าสู่ระบบอีกครั้ง",
  FORBIDDEN: "คุณไม่มีสิทธิ์ทำรายการนี้",
  NOT_FOUND: "ไม่พบข้อมูลที่ต้องการ",
  VALIDATION_ERROR: "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง",
  ORDER_INVALID_TRANSITION: "ออเดอร์นี้เปลี่ยนสถานะแล้ว",
  SHOP_CLOSED: "ร้านปิดอยู่ในขณะนี้ กรุณาเลือกร้านอื่น",
  SHOP_PAUSED: "ร้านพักรับงานชั่วคราว กรุณาเลือกร้านอื่น",
  MANUAL_PRICE_REQUIRED: "ออเดอร์นี้ต้องกำหนดราคาเอง",
  PAYMENT_DUPLICATE_SLIP: "สลิปนี้ถูกใช้ไปแล้ว",
  PAYMENT_AMOUNT_MISMATCH: "ยอดเงินในสลิปไม่ตรงกับยอดที่ต้องชำระ",
  CHAT_CLOSED: "ออเดอร์นี้จบแล้ว แชทปิดแล้ว",
  ALREADY_REGISTERED: "บัญชีนี้สมัครร้านไว้แล้ว",
  RATE_LIMITED: "ทำรายการถี่เกินไป กรุณาลองใหม่ภายหลัง",
  INTERNAL: "ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง",
  NETWORK: "เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาตรวจสอบสัญญาณแล้วลองใหม่",
  UNKNOWN: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
};

const KNOWN_CODES = new Set(Object.keys(FALLBACK_MESSAGE));

/** Every failed API call throws this. `message` is Thai and safe to show on screen. */
export class ApiClientError extends Error {
  readonly code: ClientErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: ClientErrorCode,
    status: number,
    message?: string,
    details: Record<string, unknown> = {},
  ) {
    super(message || FALLBACK_MESSAGE[code]);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isApiClientError(e: unknown): e is ApiClientError {
  return e instanceof ApiClientError;
}

/** Thai message for anything thrown, for toasts and ErrorState. */
export function errorMessage(e: unknown): string {
  return isApiClientError(e) ? e.message : FALLBACK_MESSAGE.UNKNOWN;
}

/** Turns a failed response body (CONTRACTS section 1 shape) into an ApiClientError. */
export function toApiClientError(status: number, body: unknown): ApiClientError {
  const err = (body as { error?: { code?: unknown; message?: unknown; details?: unknown } } | null)
    ?.error;
  const code =
    typeof err?.code === "string" && KNOWN_CODES.has(err.code)
      ? (err.code as ClientErrorCode)
      : "UNKNOWN";
  const message = typeof err?.message === "string" ? err.message : undefined;
  const details =
    err?.details && typeof err.details === "object" ? (err.details as Record<string, unknown>) : {};
  return new ApiClientError(code, status, message, details);
}

// --- customer token (LIFF) -------------------------------------------------------------------

type TokenProvider = () => string | null | Promise<string | null>;
let customerToken: TokenProvider = () => null;

/**
 * Y3 calls this once after liff.init(): setCustomerTokenProvider(() => liff.getIDToken()).
 * The token stays in memory only (never localStorage).
 */
export function setCustomerTokenProvider(provider: TokenProvider) {
  customerToken = provider;
}

/**
 * Development only (no LIFF ID set): act as a seed customer through the `x-dev-user` header that
 * src/lib/auth/dev.ts accepts outside production. Ignored by the server in production.
 */
let devCustomerId: string | null = null;
export function setDevCustomer(id: string | null) {
  devCustomerId = process.env.NODE_ENV === "production" ? null : id;
}

// --- request ---------------------------------------------------------------------------------

export type RequestOptions = {
  /** "customer" adds the LIFF bearer token; "cookie" relies on the Supabase session cookie. */
  auth: "customer" | "cookie";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
};

export async function request<T>(method: string, path: string, opts: RequestOptions): Promise<T> {
  const url = new URL(
    path,
    typeof window === "undefined" ? "http://localhost" : window.location.origin,
  );
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.auth === "customer") {
    const token = await customerToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    else if (devCustomerId) headers["x-dev-user"] = `customer:${devCustomerId}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiClientError("NETWORK", 0);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) throw toApiClientError(res.status, data);
  return data as T;
}
