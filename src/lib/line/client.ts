/**
 * Sends messages to LINE users through the Messaging API (reply and push).
 * A reply uses the one-time `replyToken` from a webhook event; push can reach a user at any time.
 */
const API = "https://api.line.me/v2/bot/message";
const MAX_MESSAGES = 5; // LINE accepts at most 5 message objects per request

export type LineMessage =
  | { type: "text"; text: string }
  | { type: "flex"; altText: string; contents: Record<string, unknown> };

export class LineApiError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`LINE API answered ${status}: ${detail}`);
    this.name = "LineApiError";
  }
}

async function send(
  path: "reply" | "push",
  target: Record<string, string>,
  messages: LineMessage[],
) {
  if (messages.length === 0 || messages.length > MAX_MESSAGES) {
    throw new Error(`LINE takes 1 to ${MAX_MESSAGES} messages per request, got ${messages.length}`);
  }
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token)
    throw new Error("Missing environment variable LINE_CHANNEL_ACCESS_TOKEN (see .env.example)");

  const res = await fetch(`${API}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...target, messages }),
  });
  if (!res.ok) throw new LineApiError(res.status, (await res.text()).slice(0, 300));
}

export const replyMessages = (replyToken: string, messages: LineMessage[]) =>
  send("reply", { replyToken }, messages);

export const pushMessages = (to: string, messages: LineMessage[]) => send("push", { to }, messages);
