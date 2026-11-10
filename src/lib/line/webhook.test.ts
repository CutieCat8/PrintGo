import { describe, expect, it, vi } from "vitest";
import { processEvent, type LineEvent, type WebhookDeps } from "./webhook";

const LIFF = "1234567890-AbCdEfGh";
const ORDER = "00000000-0000-4000-8000-0000000000e1";

function deps(firstTimeSeen = true) {
  return {
    claim: vi.fn<WebhookDeps["claim"]>(async () => firstTimeSeen),
    reply: vi.fn<WebhookDeps["reply"]>(async () => {}),
    liffId: LIFF,
  };
}
const event = (over: Partial<LineEvent>): LineEvent => ({
  type: "follow",
  webhookEventId: "evt-1",
  replyToken: "reply-1",
  ...over,
});
const repliedText = (d: ReturnType<typeof deps>) =>
  (d.reply.mock.calls[0][1][0] as { text: string }).text;

describe("processEvent", () => {
  it("welcomes a new follower with a link that opens the order form in LIFF", async () => {
    const d = deps();
    await processEvent(event({ type: "follow" }), d);
    expect(d.reply).toHaveBeenCalledTimes(1);
    expect(d.reply.mock.calls[0][0]).toBe("reply-1");
    expect(repliedText(d)).toContain(`https://liff.line.me/${LIFF}/new`);
  });

  it("answers any chat text with the short menu of links", async () => {
    const d = deps();
    await processEvent(event({ type: "message", message: { type: "text", text: "ช่วยด้วย" } }), d);
    const text = repliedText(d);
    expect(text).toContain(`/${LIFF}/new`);
    expect(text).toContain(`/${LIFF}/orders`);
    expect(text).toContain(`/${LIFF}/chats`);
  });

  it("opens an order from a view_order postback", async () => {
    const d = deps();
    await processEvent(
      event({ type: "postback", postback: { data: `action=view_order&id=${ORDER}` } }),
      d,
    );
    expect(repliedText(d)).toContain(`https://liff.line.me/${LIFF}/orders/${ORDER}`);
  });

  it("ignores a postback whose order id is not a uuid, so nothing arbitrary gets into the link", async () => {
    const d = deps();
    await processEvent(
      event({ type: "postback", postback: { data: "action=view_order&id=../../evil" } }),
      d,
    );
    expect(d.reply).not.toHaveBeenCalled();
  });

  it("does nothing the second time it sees the same event (LINE may deliver twice)", async () => {
    const d = deps(false);
    await processEvent(event({ type: "follow" }), d);
    expect(d.claim).toHaveBeenCalledWith("evt-1");
    expect(d.reply).not.toHaveBeenCalled();
  });

  it("stays quiet for events that cannot be replied to or that we do not handle", async () => {
    const d = deps();
    await processEvent(event({ type: "unfollow", replyToken: undefined }), d);
    await processEvent(event({ type: "message", message: { type: "sticker" } }), d);
    await processEvent(event({ type: "join" }), d);
    expect(d.reply).not.toHaveBeenCalled();
  });

  it("does not claim an event it has no id for, but still handles it", async () => {
    const d = deps();
    await processEvent(event({ webhookEventId: undefined }), d);
    expect(d.claim).not.toHaveBeenCalled();
    expect(d.reply).toHaveBeenCalledTimes(1);
  });
});
