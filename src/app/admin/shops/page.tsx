import { requireAdminPage } from "../_lib/guard";
import { Shops } from "../_components/Shops";
// Admin pages verify the session for each request before rendering.
export const instant = false;

export default async function AdminShopsPage() {
  await requireAdminPage();
  return <Shops />;
}
