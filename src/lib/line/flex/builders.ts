import { etaText, formatDayTime } from "@/lib/client/format";
import { formatBaht } from "@/lib/domain/pricing/format";
import type { OrderRow } from "@/lib/db/types";
import type { LineMessage } from "../client";
import type { NotifyEvent } from "../notify";

/**
 * Pure builders for the LINE messages a customer gets when an order changes (Z6).
 * No database, no network, no clock of their own (`now` is passed in): the same input always gives
 * the same messages, so they are covered by plain tests.
 *
 * Shape (agreed with the team): a short form card where the customer must act or needs the
 * details (quote, paid, rider on the way, handed over, delivered, and the small problem cards),
 * and a plain text message for the rest. A card carries a button instead of a bare link, so the
 * customer never sees a long URL floating in the chat. The one exception is the pickup map link.
 *
 * Privacy: the pickup code is never sent (pickup works by telling the shop the order number),
 * and messages are pushed to the order's own customer only (notify.ts).
 * Money is shown through formatBaht.
 */

export type NotifyData = {
  order: OrderRow;
  shopName: string;
  shopAddress: string;
  /** Shop position, used for the Google Maps link in the "ready for pickup" text. */
  shopLat: number | null;
  shopLng: number | null;
  /** The customer's LINE display name (shown as the receiver on the quote). */
  customerName: string;
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

const GREEN = "#14532D"; // forest green: titles and the main button
const INK = "#1A1815";
const MUTED = "#6B7280";
const LINE_COLOR = "#E7E5E4";
const CHAT_PREVIEW_CHARS = 60;

const MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

/** "17 พฤศจิกายน 2569 / 04:01 น." in Bangkok time (Thailand has no DST: always +07:00). */
export function thaiDateTime(d: Date): string {
  const t = new Date(d.getTime() + 7 * 3600_000);
  const hh = String(t.getUTCHours()).padStart(2, "0");
  const mm = String(t.getUTCMinutes()).padStart(2, "0");
  return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear() + 543} / ${hh}:${mm} น.`;
}

type Node = Record<string, unknown>;
type Row = { label: string; value: string; bold?: boolean };

const text = (t: string, extra: Record<string, unknown> = {}): Node => ({
  type: "text",
  text: t,
  wrap: true,
  size: "sm",
  ...extra,
});

const muted = (t: string, extra: Record<string, unknown> = {}) =>
  text(t, { color: MUTED, size: "xs", ...extra });

const centered = (t: string, extra: Record<string, unknown> = {}) =>
  text(t, { align: "center", color: INK, ...extra });

const heading = (t: string) => text(t, { weight: "bold", size: "md", color: INK });
const strong = (t: string) => text(t, { weight: "bold", color: INK });

function rowBox({ label, value, bold }: Row): Node {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      text(label, { color: bold ? INK : MUTED, flex: 3, weight: bold ? "bold" : "regular" }),
      text(value, { align: "end", flex: 4, weight: bold ? "bold" : "regular", color: INK }),
    ],
  };
}

const rows = (list: Row[]): Node => ({
  type: "box",
  layout: "vertical",
  spacing: "md",
  contents: list.map(rowBox),
});

/** Big total line: label on the left, amount on the right. */
const totalBox = (label: string, value: string): Node => ({
  type: "box",
  layout: "horizontal",
  contents: [
    text(label, { weight: "bold", size: "lg", color: INK, flex: 3 }),
    text(value, { weight: "bold", size: "xl", color: INK, align: "end", flex: 4 }),
  ],
});

/** The https base of the public site; LINE cannot load http images, so a plain-http base gives null. */
function publicBase(): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return /^https:\/\//.test(base) ? base : null;
}

type Button = { label: string; uri: string; outlined?: boolean };

type CardArgs = {
  title: string;
  now: Date;
  orderNo: string;
  /** The first (quote) card is bigger and shows the brand name under the logo. */
  big?: boolean;
  /** Image path under /public shown between the header and the sections, e.g. "/rider-route.png". */
  hero?: { path: string; ratio: string };
  /** Groups of nodes; a hairline goes between groups. */
  sections: Node[][];
  button?: Button;
};

/**
 * One minimal form card (white, no coloured bar): logo, green title, order number and time, then
 * groups of details separated by hairlines, then one plain green button at the bottom.
 */
function card(args: CardArgs): Record<string, unknown> {
  const base = publicBase();
  const logoSize = args.big ? "76px" : "52px";
  const head: Node[] = [
    ...(base
      ? [
          {
            type: "image",
            url: `${base}/logo-256.png`,
            size: logoSize,
            aspectMode: "fit",
            align: "center",
          },
        ]
      : []),
    ...(args.big
      ? [text("PrintGo", { color: GREEN, weight: "bold", size: "xl", align: "center", margin: "md" })]
      : []),
    text(args.title, {
      color: GREEN,
      weight: "bold",
      size: args.big ? "md" : "lg",
      align: "center",
      margin: "md",
    }),
    text(args.orderNo, { weight: "bold", size: "xl", align: "center", color: INK, margin: "lg" }),
    muted(thaiDateTime(args.now), { align: "center" }),
  ];

  const body: Node[] = [...head];
  if (args.hero && base) {
    body.push({
      type: "image",
      url: `${base}${args.hero.path}`,
      size: "full",
      aspectRatio: args.hero.ratio,
      aspectMode: "fit",
      margin: "lg",
    });
  }
  for (const section of args.sections) {
    if (section.length === 0) continue;
    body.push({ type: "separator", margin: "lg", color: LINE_COLOR });
    body.push({ type: "box", layout: "vertical", spacing: "md", margin: "lg", contents: section });
  }

  const bubble: Record<string, unknown> = {
    type: "bubble",
    size: "mega",
    body: { type: "box", layout: "vertical", paddingAll: "xl", spacing: "sm", contents: body },
  };
  const b = args.button;
  if (b && !b.outlined) {
    bubble.footer = {
      type: "box",
      layout: "vertical",
      paddingAll: "none",
      contents: [
        { type: "separator", color: LINE_COLOR },
        {
          type: "button",
          style: "link",
          color: GREEN,
          height: "md",
          action: { type: "uri", label: b.label.slice(0, 20), uri: b.uri },
        },
      ],
    };
  } else if (b) {
    // Outlined capsule button inside the body (used by the rider card)
    (bubble.body as { contents: Node[] }).contents.push({
      type: "box",
      layout: "vertical",
      margin: "xl",
      paddingAll: "md",
      cornerRadius: "xxl",
      borderColor: GREEN,
      borderWidth: "medium",
      action: { type: "uri", label: b.label.slice(0, 20), uri: b.uri },
      contents: [text(b.label, { color: GREEN, weight: "bold", align: "center", size: "md" })],
    });
  }
  return bubble;
}

/** A short card for a problem or a reply: one bold line, one small line, one button. */
function miniCard(args: {
  title: string;
  now: Date;
  orderNo: string;
  line: string;
  note?: string | null;
  button: Button;
}): Record<string, unknown> {
  return card({
    title: args.title,
    now: args.now,
    orderNo: args.orderNo,
    sections: [
      [
        centered(args.line, { weight: "bold" }),
        ...(args.note ? [muted(args.note, { align: "center" })] : []),
      ],
    ],
    button: args.button,
  });
}

function flex(altText: string, contents: Record<string, unknown>): LineMessage {
  // LINE shows altText on the phone's notification and caps it at 400 characters
  return { type: "flex", altText: altText.slice(0, 400), contents };
}

const plain = (t: string): LineMessage => ({ type: "text", text: t });

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** "เสร็จประมาณ 15 นาทีหลังชำระเงิน" -> "15 นาทีหลังชำระเงิน" (for a label/value row). */
const etaValue = (eta: string | null) => (eta ? eta.replace(/^เสร็จประมาณ\s*/, "") : null);

const baht = (satang: number) => `฿${formatBaht(satang)}`;

const THANKS = "ขอบคุณที่ไว้วางใจให้ PrintGo ดูแลน้า 🙇🏻‍♂️\nแล้วพบกันใหม่ในออเดอร์ถัดไปนะคะ 🫶🏻";

/**
 * The messages to push for one event (in order). An empty list means "send nothing":
 * the printing step and the courier request are left out on purpose to keep an order's chat short.
 */
export function buildNotifyMessages(event: NotifyEvent, d: NotifyData): LineMessage[] {
  const { order, now } = d;
  const no = order.orderNo;
  const isPickup = order.fulfillment === "pickup";
  const view = (label: string): Button => ({ label, uri: d.liff(`/orders/${order.id}`) });
  const chat = (label: string): Button => ({ label, uri: d.liff(`/chats/${order.id}`) });
  const eta = etaValue(etaText(order, now));
  const orderType = isPickup ? "รับเองที่ร้าน" : "จัดส่งถึงที่ (เดลิเวอรี่)";

  switch (event) {
    case "quote_ready": {
      const money: Row[] = [
        {
          label: "ค่าปริ้นและบริการเสริม",
          value: baht(order.printSubtotalSatang ?? 0),
        },
        { label: "ค่าบริการแพลตฟอร์ม", value: baht(order.platformFeeSatang ?? 0) },
      ];
      if (!isPickup) money.push({ label: "ค่าจัดส่ง", value: baht(order.deliveryFeeSatang) });

      const info: Row[] = [
        { label: "ประเภทออเดอร์", value: orderType },
        { label: "การชำระเงิน", value: "QR พร้อมเพย์" },
        ...(eta ? [{ label: "เวลาเสร็จโดยประมาณ", value: eta }] : []),
      ];

      const serviceLines = d.services.map((s) =>
        muted(
          s.unitPriceSatang === null
            ? `• ${s.name} ×${s.quantity} — ราคาตามตกลง (รวมในยอดแล้ว)`
            : `• ${s.name} ×${s.quantity} — ${baht(s.unitPriceSatang * s.quantity)}`,
        ),
      );
      const receiverNote = isPickup
        ? `รับเองที่ร้าน · แจ้งเลขออเดอร์ ${no} กับร้านตอนมารับ`
        : (order.deliveryAddress ?? "");
      const receiverName = isPickup
        ? d.customerName
        : (order.deliveryRecipientName ?? d.customerName);

      return [
        flex(
          `ร้าน ${d.shopName} ยืนยันราคาออเดอร์ ${no} รวม ${formatBaht(order.totalSatang ?? 0)} บาท`,
          card({
            big: true,
            title: "รายการสรุปออเดอร์ปริ้น",
            now,
            orderNo: no,
            sections: [
              [heading("ร้าน"), strong(d.shopName), muted(d.shopAddress, { size: "sm" })],
              [
                heading("ผู้รับ"),
                strong(receiverName),
                ...(receiverNote ? [muted(receiverNote, { size: "sm" })] : []),
              ],
              [
                rows(info),
                ...(order.readyNote ? [muted(`หมายเหตุร้าน: ${order.readyNote}`)] : []),
              ],
              [...serviceLines, rows(money)],
              [totalBox("ราคารวม", baht(order.totalSatang ?? 0))],
              [
                ...(order.paymentDeadline
                  ? [
                      centered(`กรุณาชำระก่อน ${formatDayTime(order.paymentDeadline, now)} น.`, {
                        weight: "bold",
                        color: GREEN,
                      }),
                    ]
                  : []),
                muted("เอกสารฉบับนี้เป็นใบเสนอราคาเพื่อให้ยืนยันและชำระเงิน ไม่ถือเป็นใบเสร็จรับเงิน", {
                  align: "center",
                  size: "xxs",
                }),
              ],
            ],
            button: view("ชำระเงิน"),
          }),
        ),
      ];
    }

    case "payment_verified":
      return [
        flex(
          `ชำระเงินออเดอร์ ${no} สำเร็จ`,
          card({
            title: "ชำระเงินแล้ว",
            now,
            orderNo: no,
            sections: [
              [
                rows([
                  { label: "ร้าน", value: d.shopName },
                  { label: "ประเภทออเดอร์", value: isPickup ? "รับเองที่ร้าน" : "จัดส่งถึงที่" },
                  ...(eta ? [{ label: "เสร็จโดยประมาณ", value: eta }] : []),
                ]),
              ],
              [totalBox("ยอดที่ชำระ", baht(order.totalSatang ?? 0))],
              [muted("ขอบคุณที่ใช้ PrintGo", { align: "center", size: "sm" })],
            ],
            button: view("ดูออเดอร์"),
          }),
        ),
      ];

    case "payment_rejected":
      return [
        flex(
          `สลิปออเดอร์ ${no} ไม่ผ่านการตรวจสอบ`,
          miniCard({
            title: "สลิปไม่ผ่าน",
            now,
            orderNo: no,
            line: d.paymentRejectReason ? `เหตุผล: ${d.paymentRejectReason}` : "ตรวจสลิปไม่ผ่าน",
            note: "กรุณาส่งสลิปใหม่อีกครั้ง",
            button: view("ส่งสลิปใหม่"),
          }),
        ),
      ];

    case "order_rejected":
      return [
        flex(
          `ร้าน ${d.shopName} ไม่รับออเดอร์ ${no}`,
          miniCard({
            title: "ร้านไม่สามารถรับออเดอร์ได้",
            now,
            orderNo: no,
            line: order.rejectReason
              ? `เหตุผล: ${order.rejectReason}`
              : "ร้านไม่สามารถรับงานนี้ได้",
            note: "ถ้าชำระเงินแล้ว ระบบจะคืนเงินให้",
            // The order page has the "สั่งใหม่ที่ร้านอื่น" action
            button: view("เลือกร้านอื่น"),
          }),
        ),
      ];

    case "eta_changed":
      return [
        flex(
          `ร้าน ${d.shopName} ปรับเวลาเสร็จของออเดอร์ ${no}`,
          miniCard({
            title: "ร้านปรับเวลาเสร็จ",
            now,
            orderNo: no,
            line: eta ? `เวลาเสร็จใหม่: ${eta}` : "ร้านปรับเวลาเสร็จของออเดอร์นี้",
            note: order.readyNote ? `ร้านแจ้งว่า: ${order.readyNote}` : null,
            // No cancel button after payment (D19): the customer can only chat with the shop
            button: chat("คุยกับร้าน"),
          }),
        ),
      ];

    case "chat_message": {
      const preview = d.chatPreview
        ? clip(d.chatPreview, CHAT_PREVIEW_CHARS)
        : "ร้านส่งข้อความถึงคุณ";
      return [
        flex(
          // altText is what the phone's notification shows: short, no private content
          `ร้านมีคำถามเรื่องออเดอร์ ${no}`,
          miniCard({
            title: "ข้อความจากร้าน",
            now,
            orderNo: no,
            line: `“${preview}”`,
            note: `จาก ${d.shopName}`,
            button: chat("ตอบร้าน"),
          }),
        ),
      ];
    }

    case "order_expired":
      return [
        plain(
          `⏰ ออเดอร์ ${no} หมดเวลาชำระเงินแล้วนะคะ ออเดอร์นี้จึงถูกยกเลิกอัตโนมัติและไม่มีการเรียกเก็บเงินใดๆ ไว้สะดวกสั่งใหม่ได้ตลอดเลยนะค้า`,
        ),
      ];

    case "order_cancelled":
      return [
        plain(
          `ออเดอร์ ${no} ถูกยกเลิกเรียบร้อยแล้วนะคะ หากรายการนี้ชำระเงินแล้ว สามารถแจ้งสลิปทางแชทนี้เพื่อให้แอดมินตรวจสอบและโอนเงินคืนได้เลยค่า🙏🏻✨`,
        ),
      ];

    // Left out on purpose: the paid card already says the shop will print it, and the
    // "ready" text says the courier is being called. Fewer messages per order.
    case "printing":
    case "courier_requested":
      return [];

    case "ready": {
      if (isPickup) {
        const maps =
          d.shopLat !== null && d.shopLng !== null
            ? `https://www.google.com/maps/search/?api=1&query=${d.shopLat},${d.shopLng}`
            : null;
        return [
          plain(
            [
              `✅ ออเดอร์ ${no} ปริ้นเสร็จแล้ว มารับได้เลยค่า`,
              `📍 พิกัดร้าน ${d.shopName} (${d.shopAddress})`,
              ...(maps ? [`🗺️ Google Maps: ${maps}`] : []),
              "",
              `แจ้งเลขออเดอร์ ${no} กับร้านตอนมารับนะคะ`,
            ].join("\n"),
          ),
        ];
      }
      return [
        plain(`✅ ออเดอร์ ${no} ปริ้นเสร็จแล้วค่า\n🛵 ร้านกำลังเรียกไรเดอร์มารับงานไปส่งให้คุณ`),
      ];
    }

    case "in_transit": {
      const tracking = d.trackingUrl && /^https:\/\//.test(d.trackingUrl) ? d.trackingUrl : null;
      return [
        flex(
          `ไรเดอร์กำลังนำส่งออเดอร์ ${no}`,
          card({
            title: "ไรเดอร์กำลังนำส่งงานถึงคุณ",
            now,
            orderNo: no,
            hero: { path: "/rider-route.png", ratio: "5:2" },
            sections: [
              [
                centered("กรุณาเตรียมตัวรับสาย", { weight: "bold", size: "md" }),
                muted(
                  tracking
                    ? "กดปุ่มด้านล่างเพื่อติดตามตำแหน่งไรเดอร์"
                    : "ดูสถานะการจัดส่งได้ในหน้าออเดอร์",
                  { align: "center" },
                ),
              ],
            ],
            button: {
              label: tracking ? "ติดตามไรเดอร์" : "ดูออเดอร์",
              uri: tracking ?? d.liff(`/orders/${order.id}`),
              outlined: true,
            },
          }),
        ),
      ];
    }

    case "handed_over":
      return [
        flex(
          `ร้านส่งมอบออเดอร์ ${no} แล้ว กรุณากดยืนยันรับของ`,
          card({
            title: "📦 ร้านส่งมอบงานแล้ว",
            now,
            orderNo: no,
            sections: [
              [
                centered("กรุณาตรวจงานให้เรียบร้อย แล้วกดยืนยันรับของ"),
                muted("ถ้าไม่กดภายใน 10 นาที ระบบจะถือว่าคุณรับของแล้ว", { align: "center" }),
              ],
            ],
            button: view("ตรวจงานและยืนยัน"),
          }),
        ),
      ];

    case "completed": {
      // Pickup was already closed with the "handed over" card; delivery gets its own card here
      if (isPickup) return [plain(THANKS)];
      return [
        flex(
          `ออเดอร์ ${no} จัดส่งถึงคุณแล้ว`,
          card({
            title: "📦 จัดส่งงานถึงคุณแล้ว",
            now,
            orderNo: no,
            sections: [
              [
                centered("กรุณาตรวจงานให้เรียบร้อย"),
                muted("หากงานมีปัญหา คุยกับร้านได้ในหน้าออเดอร์", { align: "center" }),
              ],
            ],
            button: view("ดูออเดอร์"),
          }),
        ),
        plain(THANKS),
      ];
    }
  }
}
