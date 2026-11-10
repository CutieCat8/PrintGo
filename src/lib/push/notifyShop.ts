/**
 * STUB. Task Z12 replaces the body with Web Push to the shop's devices (D17).
 * Must never throw: a failed push must not break creating an order or sending a message.
 */
export type ShopNotifyEvent = "order_new" | "chat_message";

export async function notifyShop(
  shopId: string,
  event: ShopNotifyEvent,
  ref: { orderId: string; orderNo: string },
): Promise<void> {
  console.info(`[notifyShop stub] ${event} -> shop ${shopId}, order ${ref.orderNo}`);
}
