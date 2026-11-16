import { etaText, formatDayTime } from "@/lib/client/format";
import { formatBaht } from "@/lib/domain/pricing/format";
import type { OrderRow } from "@/lib/db/types";
import type { LineMessage } from "../client";
import type { NotifyEvent } from "../notify";

/**
 * Pure builders for the LINE messages a customer gets when an order changes (Z6).
 * No database, no network, no clock of their own (`now` is passed in): the same input always gives
 * the same message, so they are covered by plain tests.
 *
 * Privacy: the pickup code is no longer sent (pickup works by telling the shop the order number),
 * and the message is pushed to the order's own customer only (notify.ts). Money is shown through formatBaht.
 */

export type NotifyData = {
  order: OrderRow;
  shopName: string;
  shopAddress: string;
  services: { name: string; quantity: number; unitPriceSatang: number | null }[];
  /** Why the latest payment slip was rejected (payment_rejected). */
  paymentRejectReason: string | null;
  trackingUrl: string | null;
  /** Latest message of the shop (chat_message). */
  chatPreview: string | null;
  /** Full LIFF link for a path under /liff, e.g. liff("/orders/123"). */
  liff: (path: string) => string;
  now: Date;
};

const NAVY = "#12284C";
const ORANGE = "#F26B21";
const MUTED = "#6B7280";
const CHAT_PREVIEW_CHARS = 60;

type Button = { label: string; uri: string; primary?: boolean };
type Row = { label: string; value: string; bold?: boolean };

const text = (t: string, extra: Record<string, unknown> = {}) => ({
  type: "text",
  text: t,
  wrap: true,
  size: "sm",
  ...extra,
});

function rowBox({ label, value, bold }: Row) {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      text(label, { color: MUTED, flex: 3 }),
      text(value, { align: "end", flex: 4, weight: bold ? "bold" : "regular" }),
    ],
  };
}

/** One card: coloured title, plain lines, label/value rows, buttons. */
function bubble(args: {
  title: string;
  lines?: string[];
  rows?: Row[];
  buttons?: Button[];
  accent?: string;
}): Record<string, unknown> {
  const body: unknown[] = [
    ...(args.lines ?? []).map((l) => text(l)),
    ...(args.rows ?? []).map(rowBox),
  ];
  const bubbleJson: Record<string, unknown> = {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: args.accent ?? NAVY,
      paddingAll: "md",
      contents: [text(args.title, { color: "#FFFFFF", weight: "bold", size: "md" })],
    },
    body: { type: "box", layout: "vertical", spacing: "sm", contents: body },
  };
  if (args.buttons?.length) {
    bubbleJson.footer = {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: args.buttons.map((b) => ({
        type: "button",
        style: b.primary ? "primary" : "secondary",
        color: b.primary ? ORANGE : undefined,
        height: "sm",
        action: { type: "uri", label: b.label.slice(0, 20), uri: b.uri },
      })),
    };
  }
  return bubbleJson;
}

function flex(altText: string, contents: Record<string, unknown>): LineMessage {
  // LINE shows altText on the phone's notification and caps it at 400 characters
  return { type: "flex", altText: altText.slice(0, 400), contents };
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export function buildNotifyMessage(event: NotifyEvent, d: NotifyData): LineMessage {
  const { order, now } = d;
  const no = order.orderNo;
  const view: Button = { label: "ดูออเดอร์", uri: d.liff(`/orders/${order.id}`), primary: true };
  const eta = etaText(order, now);
  const isPickup = order.fulfillment === "pickup";

  switch (event) {
    case "quote_ready": {
      const rows: Row[] = [
        {
          label: "ค่าปริ้นและบริการเสริม",
          value: `${formatBaht(order.printSubtotalSatang ?? 0)} บาท`,
        },
        { label: "ค่าบริการแพลตฟอร์ม", value: `${formatBaht(order.platformFeeSatang ?? 0)} บาท` },
      ];
      if (order.fulfillment === "delivery") {
        rows.push({ label: "ค่าส่ง", value: `${formatBaht(order.deliveryFeeSatang)} บาท` });
      }
      rows.push({ label: "รวม", value: `${formatBaht(order.totalSatang ?? 0)} บาท`, bold: true });

      const lines = d.services.map((s) =>
        s.unitPriceSatang === null
          ? `• ${s.name} ×${s.quantity} — ราคาตามตกลง (รวมในยอดแล้ว)`
          : `• ${s.name} ×${s.quantity} — ${formatBaht(s.unitPriceSatang * s.quantity)} บาท`,
      );
      if (eta) lines.push(eta);
      if (order.readyNote) lines.push(`หมายเหตุร้าน: ${order.readyNote}`);
      if (order.paymentDeadline) {
        lines.push(`กรุณาชำระก่อน ${formatDayTime(order.paymentDeadline, now)} น.`);
      }
      return flex(
        `ร้าน ${d.shopName} ยืนยันราคาออเดอร์ ${no} รวม ${formatBaht(order.totalSatang ?? 0)} บาท`,
        bubble({
          title: `ใบเสนอราคา ${no}`,
          lines,
          rows,
          buttons: [{ ...view, label: "ชำระเงิน" }],
        }),
      );
    }

    case "eta_changed": {
      const lines = [eta ? `ร้านปรับเวลา: ${eta}` : "ร้านปรับเวลาเสร็จ"];
      if (order.readyNote) lines.push(`หมายเหตุร้าน: ${order.readyNote}`);
      return flex(
        `ร้าน ${d.shopName} ปรับเวลาเสร็จของออเดอร์ ${no}`,
        bubble({
          title: `ปรับเวลาเสร็จ ${no}`,
          lines,
          // No cancel button after payment (D19): the customer can only chat with the shop
          buttons: [
            { label: "เปิดแชท", uri: d.liff(`/chats/${order.id}`), primary: true },
            { ...view, primary: false },
          ],
        }),
      );
    }

    case "payment_verified": {
      const lines = ["ร้านได้รับการชำระเงินแล้ว ขอบคุณค่ะ/ครับ"];
      if (eta) lines.push(eta);
      return flex(
        `ชำระเงินออเดอร์ ${no} สำเร็จ`,
        bubble({ title: `ชำระเงินแล้ว ${no}`, lines, buttons: [view] }),
      );
    }

    case "payment_rejected":
      return flex(
        `สลิปออเดอร์ ${no} ไม่ผ่านการตรวจสอบ`,
        bubble({
          title: `สลิปไม่ผ่าน ${no}`,
          accent: "#B42318",
          lines: [
            d.paymentRejectReason ? `เหตุผล: ${d.paymentRejectReason}` : "ตรวจสลิปไม่ผ่าน",
            "กรุณาส่งสลิปใหม่ภายในเวลาที่กำหนด",
          ],
          buttons: [{ ...view, label: "ส่งสลิปใหม่" }],
        }),
      );

    case "order_rejected":
      return flex(
        `ร้าน ${d.shopName} ไม่รับออเดอร์ ${no}`,
        bubble({
          title: `ร้านไม่รับออเดอร์ ${no}`,
          accent: "#B42318",
          lines: [
            order.rejectReason ? `เหตุผล: ${order.rejectReason}` : "ร้านไม่สามารถรับงานนี้ได้",
            "ลองเลือกร้านอื่นได้เลย",
          ],
          buttons: [view],
        }),
      );

    case "order_expired":
      return flex(
        `ออเดอร์ ${no} หมดเวลา`,
        bubble({
          title: `ออเดอร์หมดเวลา ${no}`,
          accent: MUTED,
          lines: ["ออเดอร์นี้หมดเวลาแล้ว หากยังต้องการปริ้น สั่งใหม่ได้เลย"],
          buttons: [view],
        }),
      );

    case "order_cancelled":
      return flex(
        `ออเดอร์ ${no} ถูกยกเลิก`,
        bubble({
          title: `ยกเลิกออเดอร์ ${no}`,
          accent: MUTED,
          lines: [
            order.rejectReason ? `เหตุผล: ${order.rejectReason}` : "ออเดอร์นี้ถูกยกเลิก",
            "หากชำระเงินแล้ว แอดมินจะโอนเงินคืนให้",
          ],
          buttons: [view],
        }),
      );

    case "printing":
      return flex(
        `ร้าน ${d.shopName} กำลังปริ้นออเดอร์ ${no}`,
        bubble({
          title: `กำลังปริ้น ${no}`,
          lines: ["ร้านเริ่มปริ้นงานของคุณแล้ว", ...(eta ? [eta] : [])],
          buttons: [view],
        }),
      );

    case "ready": {
      if (isPickup) {
        return flex(
          `ออเดอร์ ${no} พร้อมรับแล้วที่ ${d.shopName}`,
          bubble({
            title: `พร้อมรับแล้ว ${no}`,
            lines: [`รับที่ ${d.shopName}`, d.shopAddress, `แจ้งเลขออเดอร์ ${no} กับร้านตอนมารับ`],
            buttons: [view],
          }),
        );
      }
      return flex(
        `ออเดอร์ ${no} ปริ้นเสร็จแล้ว กำลังหาไรเดอร์`,
        bubble({
          title: `ปริ้นเสร็จแล้ว ${no}`,
          lines: ["กำลังหาไรเดอร์มารับงานไปส่งให้คุณ"],
          buttons: [view],
        }),
      );
    }

    case "courier_requested":
      return flex(
        `เรียกไรเดอร์ให้ออเดอร์ ${no} แล้ว`,
        bubble({
          title: `เรียกไรเดอร์แล้ว ${no}`,
          lines: ["กำลังรอไรเดอร์รับงานจากร้าน"],
          buttons: [view],
        }),
      );

    case "in_transit": {
      const buttons: Button[] = [view];
      if (d.trackingUrl && /^https:\/\//.test(d.trackingUrl)) {
        buttons.push({ label: "ติดตามไรเดอร์", uri: d.trackingUrl });
      }
      return flex(
        `ไรเดอร์กำลังนำส่งออเดอร์ ${no}`,
        bubble({
          title: `กำลังจัดส่ง ${no}`,
          lines: ["ไรเดอร์รับงานแล้ว กำลังนำส่งถึงคุณ"],
          buttons,
        }),
      );
    }

    case "handed_over":
      return flex(
        `ร้านส่งมอบออเดอร์ ${no} แล้ว กรุณากดยืนยันรับของ`,
        bubble({
          title: `ร้านส่งมอบงานแล้ว ${no}`,
          lines: [
            "กรุณาตรวจงานให้เรียบร้อย แล้วกดยืนยันรับของ",
            "ถ้าไม่กดภายใน 10 นาที ระบบจะถือว่าคุณรับของแล้ว",
          ],
          buttons: [{ ...view, label: "ตรวจงานและยืนยัน" }],
        }),
      );

    case "completed":
      return flex(
        `ออเดอร์ ${no} เสร็จสมบูรณ์`,
        bubble({
          title: `เสร็จสมบูรณ์ ${no}`,
          lines: ["ขอบคุณที่ใช้ PrintGo"],
          buttons: [{ ...view, label: "ดูสรุปออเดอร์" }],
        }),
      );

    case "chat_message": {
      const preview = d.chatPreview
        ? clip(d.chatPreview, CHAT_PREVIEW_CHARS)
        : "ร้านส่งข้อความถึงคุณ";
      return flex(
        // altText is what the phone's notification shows: short, no private content
        `ร้านมีคำถามเรื่องออเดอร์ ${no}`,
        bubble({
          title: `ข้อความจากร้าน ${no}`,
          lines: [`${d.shopName}: ${preview}`],
          buttons: [{ label: "ตอบร้าน", uri: d.liff(`/chats/${order.id}`), primary: true }],
        }),
      );
    }
  }
}
