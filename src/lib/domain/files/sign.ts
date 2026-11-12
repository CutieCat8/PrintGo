import { z } from "zod";
import { getServiceClient } from "@/lib/db/server";
import { ApiError } from "@/lib/errors";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_BYTES,
  MAX_FILES_PER_ORDER,
  ORDER_FILES_BUCKET,
  pendingPath,
  sanitizeStorageName,
  toObjectKey,
} from "./paths";

/** CONTRACTS 6.1 POST /api/liff/uploads/sign: { files: [{ name, mime, sizeBytes }] } */
export const UploadSignInput = z.object({
  files: z
    .array(
      z.object({
        name: z.string("ต้องมีชื่อไฟล์").min(1, "ต้องมีชื่อไฟล์").max(255, "ชื่อไฟล์ยาวเกินไป"),
        mime: z.enum(ALLOWED_MIME_TYPES, "รองรับเฉพาะไฟล์ PDF, JPG และ PNG"),
        sizeBytes: z
          .number("ขนาดไฟล์ต้องเป็นตัวเลข")
          .int()
          .positive("ไฟล์ว่างเปล่า")
          .max(MAX_FILE_BYTES, "ไฟล์ใหญ่เกิน 20 MB"),
      }),
    )
    .min(1, "ต้องเลือกไฟล์อย่างน้อย 1 ไฟล์")
    .max(MAX_FILES_PER_ORDER, `อัปโหลดได้ไม่เกิน ${MAX_FILES_PER_ORDER} ไฟล์ต่อออเดอร์`),
});
export type UploadSignInput = z.infer<typeof UploadSignInput>;

export type SignedUpload = { path: string; uploadUrl: string; token: string };

/**
 * One signed upload URL per file, under the customer's own pending folder. The customer's browser
 * sends the file straight to Storage; it never goes through our API (CLAUDE.md rule 5). The bucket
 * itself also enforces the 20 MB and mime limits.
 */
export async function signUploads(
  customerId: string,
  input: UploadSignInput,
): Promise<SignedUpload[]> {
  const bucket = getServiceClient().storage.from(ORDER_FILES_BUCKET);
  const result: SignedUpload[] = [];
  for (const file of input.files) {
    const path = pendingPath(customerId, sanitizeStorageName(file.name, file.mime));
    const key = toObjectKey(path) as string;
    const { data, error } = await bucket.createSignedUploadUrl(key);
    if (error || !data) {
      console.error("[uploads] could not create a signed upload URL");
      throw new ApiError("INTERNAL", 500);
    }
    result.push({ path, uploadUrl: data.signedUrl, token: data.token });
  }
  return result;
}
