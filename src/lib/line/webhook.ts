import { z } from "zod";
import type { LineMessage } from "./client";

/**
 * What the bot does with events LINE sends to /api/line/webhook (task Z5): greet new friends,
 * answer chat text with the menu, and open an order from a postback. Orders themselves happen
 * in LIFF, so every answer is a link into it.
 */

export const LineEvent = z.looseObject({
  type: z.string(),
  webhookEventId: z.string().optional(),
  replyToken: z.string().optional(),
  message: z.looseObject({ type: z.string() }).optional(),
  postback: z.looseObject({ data: z.string() }).optional(),
});
export type LineEvent = z.infer<typeof LineEvent>;

/** The payload LINE posts. `events` is empty when you press "Verify" in the LINE console. */
export const WebhookPayload = z.object({ events: z.array(LineEvent) });

export type WebhookDeps = {
  /** True the first time an event id is seen, false for a repeat. Atomic. */
  claim: (webhookEventId: string) => Promise<boolean>;
  reply: (replyToken: string, messages: LineMessage[]) => Promise<void>;
  liffId: string;
};

const text = (t: string): LineMessage[] => [{ type: "text", text: t }];

function answerFor(event: LineEvent, liff: (path: string) => string): LineMessage[] | null {
  if (event.type === "follow") {
    return text(
      "ยินดีต้อนรับสู่ PrintGo\nส่งไฟล์ เลือกร้าน แล้วรอรับงานได้ในแชทนี้เลย\n\n" +
        `เริ่มสั่งปริ้นที่เมนูด้านล่าง หรือแตะลิงก์นี้\n${liff("/new")}`,
    );
  }
  if (event.type === "message" && event.message?.type === "text") {
    return text(
      `สั่งปริ้น: ${liff("/new")}\nสถานะงาน: ${liff("/orders")}\nคุยกับร้าน: ${liff("/chats")}\n\n` +
        "หรือใช้เมนูด้านล่างได้เลย",
    );
  }
  if (event.type === "postback" && event.postback) {
    const params = new URLSearchParams(event.postback.data);
    const id = z.uuid().safeParse(params.get("id"));
    if (params.get("action") === "view_order" && id.success) {
      return text(`ดูออเดอร์ได้ที่นี่\n${liff(`/orders/${id.data}`)}`);
    }
  }
  return null;
}

export async function processEvent(event: LineEvent, deps: WebhookDeps): Promise<void> {
  if (event.webhookEventId && !(await deps.claim(event.webhookEventId))) return;
  if (!event.replyToken) return;

  const liff = (path: string) => `https://liff.line.me/${deps.liffId}${path}`;
  const messages = answerFor(event, liff);
  if (messages) await deps.reply(event.replyToken, messages);
}
