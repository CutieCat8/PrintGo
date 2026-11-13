import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { ApiError } from "@/lib/errors";

/** Per-render/request cache only. Pages call this too: layout reuse is not an auth boundary. */
export const requireAdminPage = cache(async () => {
  const incoming = await headers();
  const request = new Request("http://localhost/admin", { headers: incoming });
  try {
    return await requireAdmin(request);
  } catch (error) {
    if (error instanceof ApiError && error.code === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof ApiError && error.code === "FORBIDDEN") notFound();
    throw error;
  }
});
