import { getServiceClient } from "@/lib/db/server";
import { ApiError } from "@/lib/errors";
import { cleanOriginalName, ORDER_FILES_BUCKET, toObjectKey } from "./paths";

/** Signed URLs for the shop live 5 minutes (CONTRACTS 6.2). */
export const SHOP_FILE_URL_SECONDS = 300;

export type FileUrlMode = "view" | "download";

/**
 * A short-lived signed URL for a shop to open or download one file of one of its own orders (D20).
 * Everything that is not "your order, your file, not deleted" answers 404, so a shop cannot tell
 * another shop's order from one that does not exist. The URL is never logged.
 */
export async function createShopFileUrl(args: {
  shopId: string;
  orderId: string;
  fileId: string;
  mode: FileUrlMode;
}): Promise<{ url: string; expiresInSeconds: number }> {
  const { shopId, orderId, fileId, mode } = args;
  const db = getServiceClient();

  const order = await db.from("orders").select("id, shop_id").eq("id", orderId).maybeSingle();
  if (order.error) throw order.error;
  if (!order.data || order.data.shop_id !== shopId) throw new ApiError("NOT_FOUND", 404);

  const file = await db
    .from("order_files")
    .select("storage_path, original_name, deleted_at")
    .eq("id", fileId)
    .eq("order_id", orderId)
    .maybeSingle();
  if (file.error) throw file.error;
  if (!file.data || file.data.deleted_at !== null) throw new ApiError("NOT_FOUND", 404);

  const key = toObjectKey(file.data.storage_path as string);
  if (key === null) throw new ApiError("INTERNAL", 500);
  // Second line of defence: a file of this order lives under its own folder, never another one.
  if (!key.startsWith(`${orderId}/`)) throw new ApiError("NOT_FOUND", 404);

  // `download` makes Storage answer with "attachment" (the string is the saved file name);
  // without it the browser opens the file itself.
  const signed = await db.storage
    .from(ORDER_FILES_BUCKET)
    .createSignedUrl(
      key,
      SHOP_FILE_URL_SECONDS,
      mode === "download"
        ? { download: cleanOriginalName(file.data.original_name as string) }
        : undefined,
    );
  if (signed.error || !signed.data) {
    console.error(`[files] could not sign file ${fileId} of order ${orderId}`);
    throw new ApiError("NOT_FOUND", 404);
  }
  return { url: signed.data.signedUrl, expiresInSeconds: SHOP_FILE_URL_SECONDS };
}
