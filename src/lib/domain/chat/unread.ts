import type { SupabaseClient } from "@supabase/supabase-js";

/** Which side is looking. The unread messages are the other side's (system messages never count). */
export type ChatSide = "customer" | "shop";
export const otherSide = (side: ChatSide): ChatSide => (side === "customer" ? "shop" : "customer");

const CHUNK = 100;

/**
 * How many messages from the other side each of these orders still has unread, in as few queries
 * as possible (one per 100 orders). Orders without unread messages are simply missing from the map.
 */
export async function unreadCounts(
  db: SupabaseClient,
  orderIds: string[],
  viewer: ChatSide,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (let i = 0; i < orderIds.length; i += CHUNK) {
    const { data, error } = await db
      .from("messages")
      .select("order_id")
      .in("order_id", orderIds.slice(i, i + CHUNK))
      .eq("sender", otherSide(viewer))
      .is("read_at", null);
    if (error) throw error;
    for (const row of data ?? []) {
      const id = row.order_id as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

export async function unreadCount(
  db: SupabaseClient,
  orderId: string,
  viewer: ChatSide,
): Promise<number> {
  return (await unreadCounts(db, [orderId], viewer)).get(orderId) ?? 0;
}
