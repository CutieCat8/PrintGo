import { claimWebhookEvent } from "@/lib/db/webhookEvents";
import { ApiError, handle } from "@/lib/errors";
import { replyMessages } from "@/lib/line/client";
import { verifyLineSignature } from "@/lib/line/signature";
import { processEvent, WebhookPayload } from "@/lib/line/webhook";

/**
 * LINE posts every chat event here. Order of work matters:
 * 1. read the body as raw text (the signature is over the exact bytes),
 * 2. check the signature, and only then look at the content,
 * 3. handle each event on its own, so one failure does not lose the others.
 * Once the signature is good the answer is always 200, otherwise LINE keeps resending.
 */
export const POST = handle(async (req: Request) => {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret)
    throw new Error("Missing environment variable LINE_CHANNEL_SECRET (see .env.example)");

  const rawBody = await req.text();
  if (!verifyLineSignature(secret, rawBody, req.headers.get("x-line-signature"))) {
    throw new ApiError("UNAUTHENTICATED", 401);
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    throw new ApiError("VALIDATION_ERROR", 422);
  }
  const { events } = WebhookPayload.parse(json);

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (events.length > 0 && !liffId) {
    throw new Error("Missing environment variable NEXT_PUBLIC_LIFF_ID (see .env.example)");
  }

  const deps = {
    claim: (id: string) => claimWebhookEvent(id, "line"),
    reply: replyMessages,
    liffId: liffId ?? "",
  };
  for (const event of events) {
    try {
      await processEvent(event, deps);
    } catch (error) {
      console.error("LINE webhook event failed", event.type, error);
    }
  }
  return Response.json({ ok: true });
});
