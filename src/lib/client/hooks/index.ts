"use client";

import useSWR, { type SWRConfiguration } from "swr";
import type { OrderStatus } from "@/lib/db/types";
import { api } from "../api";
import { isApiClientError } from "../http";

/**
 * Data hooks for pages. Polling uses SWR's refreshInterval, which already pauses while the tab is
 * hidden (refreshWhenHidden=false) and offline, and refreshes when the user comes back.
 * Every hook returns SWR's { data, error, isLoading, mutate } (error is an ApiClientError).
 */

export type Side = "customer" | "shop";

/** Polling intervals in ms (YURI.md Y2). */
export const POLL = {
  order: 5_000,
  shopOrders: 6_000,
  messages: 4_000,
  chatsCustomer: 10_000,
  chatsShop: 6_000,
} as const;

const TERMINAL: OrderStatus[] = ["completed", "rejected", "cancelled", "expired"];

/** completed / rejected / cancelled / expired: nothing will change any more. */
export function isTerminal(status: OrderStatus) {
  return TERMINAL.includes(status);
}

/** Do not keep retrying errors that a retry cannot fix. */
const base: SWRConfiguration = {
  refreshWhenHidden: false,
  refreshWhenOffline: false,
  onErrorRetry(err, _key, _config, revalidate, { retryCount }) {
    if (isApiClientError(err) && [401, 403, 404, 409, 422].includes(err.status)) return;
    if (retryCount >= 3) return;
    setTimeout(() => revalidate({ retryCount }), 2_000 * 2 ** retryCount);
  },
};

// --- customer ----------------------------------------------------------------------------------

/** Shops for the picker. Pass the position only when the user allowed location. */
export function useShops(pos: { lat: number; lng: number } | null) {
  return useSWR(
    ["shops", pos?.lat ?? null, pos?.lng ?? null],
    () => api.listShops(pos ?? undefined),
    base,
  );
}

export function useMyOrders() {
  return useSWR("myOrders", () => api.listMyOrders(), base);
}

/** One order. Polls every 5 s until it reaches a final status. `id` null = do not load yet. */
export function useOrder(id: string | null, side: Side = "customer") {
  return useSWR(
    id ? ["order", side, id] : null,
    ([, , orderId]) => (side === "customer" ? api.getMyOrder(orderId) : api.getShopOrder(orderId)),
    {
      ...base,
      refreshInterval: (latest) => (latest && isTerminal(latest.status) ? 0 : POLL.order),
    },
  );
}

// --- shop ------------------------------------------------------------------------------------

export function useShopMe() {
  return useSWR("shopMe", () => api.getShopMe(), base);
}

/** The shop queue, refreshed every 6 s. `enabled=false` while the shop is not active. */
export function useShopOrders(statuses?: OrderStatus[], enabled = true) {
  return useSWR(
    enabled ? ["shopOrders", statuses?.join(",") ?? "all"] : null,
    () => api.listShopOrders(statuses),
    { ...base, refreshInterval: POLL.shopOrders },
  );
}

// --- chat ------------------------------------------------------------------------------------

/** Messages of one order, refreshed every 4 s. Stops polling once `closed` is true. */
export function useMessages(orderId: string | null, side: Side, closed = false) {
  return useSWR(
    orderId ? ["messages", side, orderId] : null,
    ([, , id]) => (side === "customer" ? api.listMyMessages(id) : api.listShopMessages(id)),
    { ...base, refreshInterval: closed ? 0 : POLL.messages },
  );
}

/** Chat rooms + totalUnread for badges. Customer every 10 s, shop every 6 s. */
export function useChats(side: Side, enabled = true) {
  return useSWR(
    enabled ? ["chats", side] : null,
    () => (side === "customer" ? api.listMyChats() : api.listShopChats()),
    { ...base, refreshInterval: side === "customer" ? POLL.chatsCustomer : POLL.chatsShop },
  );
}
