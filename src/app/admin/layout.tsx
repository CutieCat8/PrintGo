import type { ReactNode } from "react";
import { requireAdminPage } from "./_lib/guard";
import { AdminFrame } from "./_components/AdminFrame";

export const instant = false;
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminPage();
  return <AdminFrame>{children}</AdminFrame>;
}
