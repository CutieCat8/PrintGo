import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toDb } from "@/lib/db/case";
import { getServiceClient } from "@/lib/db/server";
import { OrderRow, parseRow, ShopHourRow } from "@/lib/db/types";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_BYTES,
  ORDER_FILES_BUCKET,
  cleanOriginalName,
  isPendingPathOf,
  orderPathFor,
  toObjectKey,
} from "@/lib/domain/files/paths";
import { isShopOpen } from "@/lib/domain/shops/hours";
import { ApiError } from "@/lib/errors";
import { notifyShop } from "@/lib/push/notifyShop";
import { loadShopPricing, priceOrder } from "./quote";
import { normalizeThaiPhone, type CreateOrderBody } from "./schemas";
import { presentOrder, type OrderView } from "./view";

const DEFAULT_SHOP_RESPONSE_MINUTES = 15; // O2 (open): SHOP_RESPONSE_MINUTES

function shopResponseMinutes(): number {
  const raw = process.env.SHOP_RESPONSE_MINUTES;
  if (raw === undefined || raw.trim() === "") return DEFAULT_SHOP_RESPONSE_MINUTES;
  const minutes = Number(raw);
  if (!Number.isSafeInteger(minutes) || minutes <= 0) {
    throw new Error(`SHOP_RESPONSE_MINUTES must be a positive integer, got "${raw}"`);
  }
  return minutes;
}

const invalid = (message: string, details: Record<string, unknown> = {}) =>
  new ApiError("VALIDATION_ERROR", 422, message, details);

type CheckedFile = {
  input: CreateOrderBody["files"][number];
  id: string;
  fromKey: string;
  toPath: string;
  toKey: string;
  mime: string;
  sizeBytes: number;
};

/**
 * Each file must be one this customer uploaded (their own pending folder) and must really exist in
 * Storage. Size and type are read from Storage when it reports them, not trusted from the request.
 */
async function checkFiles(
  db: SupabaseClient,
  customerId: string,
  orderId: string,
  files: CreateOrderBody["files"],
): Promise<CheckedFile[]> {
  const bucket = db.storage.from(ORDER_FILES_BUCKET);
  const checked: CheckedFile[] = [];
  for (const [index, input] of files.entries()) {
    if (!isPendingPathOf(customerId, input.path)) {
      throw invalid("ไฟล์ไม่ถูกต้อง กรุณาอัปโหลดใหม่", { fileIndex: index });
    }
    const fromKey = toObjectKey(input.path) as string;
    const info = await bucket.info(fromKey);
    if (info.error || !info.data) {
      throw invalid("ไม่พบไฟล์ที่อัปโหลด กรุณาอัปโหลดใหม่", { fileIndex: index });
    }
    const size = info.data.size ?? input.sizeBytes;
    const mime = info.data.contentType ?? input.mime;
    if (!(ALLOWED_MIME_TYPES as string[]).includes(mime)) {
      throw invalid("รองรับเฉพาะไฟล์ PDF, JPG และ PNG", { fileIndex: index });
    }
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_FILE_BYTES) {
      throw invalid("ไฟล์ใหญ่เกิน 20 MB", { fileIndex: index });
    }
    // D11: an image is one page.
    if (mime.startsWith("image/") && input.pageCount !== 1) {
      throw invalid("รูปภาพนับเป็น 1 หน้า", { fileIndex: index });
    }
    const toPath = orderPathFor(orderId, input.path);
    checked.push({
      input,
      id: randomUUID(),
      fromKey,
      toPath,
      toKey: toObjectKey(toPath) as string,
      mime,
      sizeBytes: size,
    });
  }
  return checked;
}

/** Undo a half-made order. Children first: order_files / order_services reference the order. */
async function deleteOrderRows(db: SupabaseClient, orderId: string): Promise<void> {
  for (const table of ["order_services", "order_files", "orders"]) {
    const { error } = await db
      .from(table)
      .delete()
      .eq(table === "orders" ? "id" : "order_id", orderId);
    if (error) console.error(`[createOrder] could not undo ${table} of order ${orderId}`);
  }
}

/**
 * POST /api/liff/orders. Everything that matters is decided here, never by the request: the shop
 * must be active, not paused and open; prices come from the shop's own price list; files must be
 * the customer's own uploads. Not one database transaction (supabase-js has none), so a failure
 * after the order row exists undoes the rows it wrote (see deleteOrderRows) and moves files back.
 */
export async function createOrder(
  customerId: string,
  body: CreateOrderBody,
  now: Date = new Date(),
): Promise<OrderView> {
  const db = getServiceClient();

  const pricing = await loadShopPricing(body.shopId, db);
  const { shop } = pricing;
  if (shop.isPaused) throw new ApiError("SHOP_PAUSED", 409);
  const hoursRes = await db.from("shop_hours").select("*").eq("shop_id", shop.id);
  if (hoursRes.error) throw hoursRes.error;
  const hours = (hoursRes.data ?? []).map((r) => parseRow(ShopHourRow, r));
  if (!isShopOpen(shop, hours, now).isOpen) throw new ApiError("SHOP_CLOSED", 409);

  const { estimate: est, deliveryFeeSatang } = await priceOrder(pricing, body);

  const orderId = randomUUID();
  const files = await checkFiles(db, customerId, orderId, body.files);

  const isDelivery = body.fulfillment === "delivery";
  const orderInsert = await db
    .from("orders")
    .insert(
      toDb({
        id: orderId,
        customerId,
        shopId: shop.id,
        status: "submitted",
        fulfillment: body.fulfillment,
        deliveryAddress: isDelivery ? (body.deliveryAddress ?? null) : null,
        deliveryLat: isDelivery ? (body.deliveryLat ?? null) : null,
        deliveryLng: isDelivery ? (body.deliveryLng ?? null) : null,
        deliveryRecipientName: isDelivery ? (body.deliveryRecipientName ?? null) : null,
        deliveryRecipientPhone: isDelivery
          ? normalizeThaiPhone(body.deliveryRecipientPhone ?? "")
          : null,
        customerNote: body.customerNote ?? null,
        requiresManualPrice: est.requiresManualPrice,
        estimatedPrintSatang: est.estimatedPrintSatang,
        estimatedServicesSatang: est.estimatedServicesSatang,
        deliveryFeeSatang,
        responseDeadline: new Date(now.getTime() + shopResponseMinutes() * 60_000).toISOString(),
      }),
    )
    .select()
    .single();
  if (orderInsert.error || !orderInsert.data) {
    console.error(`[createOrder] could not insert the order (db code ${orderInsert.error?.code})`);
    throw new ApiError("INTERNAL", 500);
  }
  const row = parseRow(OrderRow, orderInsert.data);

  try {
    const fileInsert = await db.from("order_files").insert(
      files.map((f) =>
        toDb({
          id: f.id,
          orderId,
          storagePath: f.toPath,
          originalName: cleanOriginalName(f.input.originalName),
          mime: f.mime,
          sizeBytes: f.sizeBytes,
          pageCount: f.input.pageCount,
          color: f.input.color,
          paper: f.input.paper,
          sides: f.input.sides,
          copies: f.input.copies,
        }),
      ),
    );
    if (fileInsert.error) throw new Error("could not insert order_files");

    // Snapshot of each chosen service: name and price as they are now (D22).
    if (est.serviceLines.length > 0) {
      const serviceInsert = await db.from("order_services").insert(
        est.serviceLines.map((l) =>
          toDb({
            orderId,
            shopServiceId: l.serviceId,
            name: l.name,
            unit: l.unit,
            unitPriceSatang: l.unitPriceSatang,
            orderFileId: l.fileIndex === null ? null : files[l.fileIndex].id,
            quantity: l.quantity,
          }),
        ),
      );
      if (serviceInsert.error) throw new Error("could not insert order_services");
    }
  } catch (err) {
    console.error(
      `[createOrder] ${err instanceof Error ? err.message : "failed"} (order ${orderId})`,
    );
    await deleteOrderRows(db, orderId);
    throw new ApiError("INTERNAL", 500);
  }

  // Move the files into the order's folder. If one move fails, put the others back and undo the order.
  const bucket = db.storage.from(ORDER_FILES_BUCKET);
  const moved: CheckedFile[] = [];
  for (const f of files) {
    const { error } = await bucket.move(f.fromKey, f.toKey);
    if (error) {
      console.error(`[createOrder] could not move a file of order ${orderId}`);
      for (const done of moved) {
        const back = await bucket.move(done.toKey, done.fromKey);
        // A file left in the order's folder would never be cleaned up: say so, and try to remove it.
        if (back.error) {
          console.error(
            `[createOrder] could not move a file back; left at ${orderId}/ (needs manual cleanup)`,
          );
          await bucket.remove([done.toKey]);
        }
      }
      await deleteOrderRows(db, orderId);
      // The source file is gone: another request (a double tap) already used it.
      const source = await bucket.exists(f.fromKey);
      if (!source.error && source.data === false) {
        throw invalid("ไฟล์นี้ถูกใช้ในออเดอร์อื่นแล้ว");
      }
      throw new ApiError("INTERNAL", 500);
    }
    moved.push(f);
  }

  try {
    await notifyShop(shop.id, "order_new", { orderId, orderNo: row.orderNo });
  } catch (err) {
    console.error(
      `[createOrder] notifyShop failed for order ${orderId}: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }

  return presentOrder(row, { shopName: shop.name, viewer: "customer" });
}
