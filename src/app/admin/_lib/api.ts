"use client";
import useSWR from "swr";
import { z } from "zod";
import { request } from "@/lib/client/http";
import { AdminShop, AdminShopList } from "./types";

export const ADMIN_SHOPS_KEY = "admin-shops";
export const adminApi = {
  async shops() {
    return AdminShopList.parse(await request("GET", "/api/admin/shops", { auth: "cookie" }));
  },
  async changeShop(id: string, action: "approve" | "suspend") {
    return z.object({ shop: AdminShop }).parse(
      await request("POST", `/api/admin/shops/${encodeURIComponent(id)}/${action}`, {
        auth: "cookie",
      }),
    ).shop;
  },
};
export function useAdminShops() {
  return useSWR(ADMIN_SHOPS_KEY, adminApi.shops, {
    refreshInterval: 15000,
    shouldRetryOnError: false,
  });
}

export async function adminRead(path: string) {
  return request("GET", `/api/admin/${path}`, { auth: "cookie" });
}
export async function adminAction(path: string, body?: unknown) {
  return request("POST", `/api/admin/${path}`, { auth: "cookie", body });
}
