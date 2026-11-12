import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { claimWebhookEvent } from "@/lib/db/webhookEvents";
import { getServiceClient } from "@/lib/db/server";
import { ApiError } from "@/lib/errors";
import { mapGrabStatus, readGrabConfig } from "./grab";
import { applyDeliveryUpdate } from "./index";

/**
 * The Grab doc defines no signature, only two optional headers (client id / client secret).
 * We require both to match our own credentials, so a request without them is refused.
 */
const Payload = z.object({
  deliveryID: z.string().min(1),
  timestamp: z.number().int(),
  status: z.string().min(1),
  trackURL: z.string().optional(),
  failedReason: z.string().optional(),
});

function same(a: string | null, b: string): boolean {
  if (a === null) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const FINAL = new Set(["delivered", "cancelled", "failed"]);

export async function handleGrabWebhook(req: Request): Promise<Response> {
  const config = readGrabConfig();
  if (!config) return Response.json({ error: "Grab is not configured" }, { status: 501 });
  if (
    !same(req.headers.get("authorization-id"), config.clientId) ||
    !same(req.headers.get("authorization"), config.clientSecret)
  ) {
    throw new ApiError("UNAUTHENTICATED", 401);
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", 422);
  }
  const event = Payload.parse(json);

  const status = mapGrabStatus(event.status);
  // Grab may resend the same status; the id makes the second copy a no-op.
  const isNew = await claimWebhookEvent(`grab:${event.deliveryID}:${event.status}:${event.timestamp}`, "grab");
  if (!isNew) return Response.json({ ok: true });

  const { data: row, error } = await getServiceClient()
    .from("deliveries")
    .select("order_id, status")
    .eq("provider", "grab")
    .eq("provider_ref", event.deliveryID)
    .maybeSingle();
  if (error) throw error;
  if (!row) return Response.json({ ok: true }); // not ours (or not saved yet): answer 200 so Grab stops resending

  // A late "in transit" must not overwrite a delivery that already ended.
  if (FINAL.has(row.status) && row.status !== status) return Response.json({ ok: true });

  await applyDeliveryUpdate(row.order_id, {
    status,
    ...(event.trackURL ? { trackingUrl: event.trackURL } : {}),
    ...(event.failedReason ? { note: event.failedReason } : {}),
  });
  return Response.json({ ok: true });
}
