import { ZodError } from "zod";

/**
 * Error codes and their HTTP status, exactly as listed in docs/CONTRACTS.md section 1.
 * The status lives here once, so a route cannot answer a code with the wrong status.
 */
type StatusByCode = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  ORDER_INVALID_TRANSITION: 409,
  SHOP_CLOSED: 409,
  SHOP_PAUSED: 409,
  MANUAL_PRICE_REQUIRED: 409,
  PAYMENT_DUPLICATE_SLIP: 409,
  PAYMENT_AMOUNT_MISMATCH: 409,
  CHAT_CLOSED: 409,
  ALREADY_REGISTERED: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export type ErrorCode = keyof StatusByCode;

/** Shown to users when the caller does not give a more specific message. */
const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "กรุณาเข้าสู่ระบบ",
  FORBIDDEN: "คุณไม่มีสิทธิ์ทำรายการนี้",
  NOT_FOUND: "ไม่พบข้อมูลที่ต้องการ",
  VALIDATION_ERROR: "ข้อมูลที่ส่งมาไม่ถูกต้อง",
  ORDER_INVALID_TRANSITION: "สถานะออเดอร์เปลี่ยนไปแล้ว กรุณารีเฟรช",
  SHOP_CLOSED: "ร้านปิดอยู่ในขณะนี้",
  SHOP_PAUSED: "ร้านพักรับงานชั่วคราว",
  MANUAL_PRICE_REQUIRED: "ออเดอร์นี้ต้องให้ร้านกำหนดราคา",
  PAYMENT_DUPLICATE_SLIP: "สลิปนี้ถูกใช้แล้ว",
  PAYMENT_AMOUNT_MISMATCH: "ยอดเงินในสลิปไม่ตรงกับยอดที่ต้องชำระ",
  CHAT_CLOSED: "ออเดอร์นี้จบแล้ว แชทปิดแล้ว",
  ALREADY_REGISTERED: "บัญชีนี้สมัครร้านไว้แล้ว",
  RATE_LIMITED: "ทำรายการถี่เกินไป กรุณาลองใหม่ภายหลัง",
  INTERNAL: "ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง",
};

type ErrorBody = {
  error: { code: ErrorCode; message: string; details: Record<string, unknown> };
};

export class ApiError<C extends ErrorCode = ErrorCode> extends Error {
  readonly code: C;
  readonly status: StatusByCode[C];
  readonly details: Record<string, unknown>;

  /** `status` must be the one CONTRACTS assigns to `code`; the compiler checks it. */
  constructor(
    code: C,
    status: StatusByCode[C],
    message?: string,
    details: Record<string, unknown> = {},
  ) {
    super(message ?? DEFAULT_MESSAGE[code]);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  toBody(): ErrorBody {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message }));
    return new ApiError("VALIDATION_ERROR", 422, undefined, { issues });
  }
  // Unknown failure: log the real cause on the server, tell the client nothing about it.
  console.error("Unhandled error in route handler", err);
  return new ApiError("INTERNAL", 500);
}

/**
 * Wraps a route handler so that every failure leaves as the error body from CONTRACTS section 1.
 * Handlers just `throw new ApiError(...)` or let Zod `.parse()` throw.
 */
export function handle<Ctx>(fn: (req: Request, ctx: Ctx) => Promise<Response> | Response) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      const apiError = toApiError(err);
      return Response.json(apiError.toBody(), { status: apiError.status });
    }
  };
}
