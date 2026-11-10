import { getServiceClient } from "./server";

/**
 * Webhooks can arrive more than once (network retries, redelivery). Every handler claims the
 * event id first and does its work only if the claim is new. The unique id makes the claim atomic,
 * even when two copies arrive at the same moment.
 */
export async function claimWebhookEvent(id: string, source: string): Promise<boolean> {
  const { error } = await getServiceClient().from("webhook_events").insert({ id, source });
  if (!error) return true;
  if (error.code === "23505") return false; // unique violation: seen before
  throw error;
}
