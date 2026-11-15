import { requireAdminPage } from "../_lib/guard";
import { Orders } from "../_components/Orders";
// Admin pages verify the session for each request before rendering.
export const instant = false;

export default async function Page() {
  await requireAdminPage();
  return <Orders />;
}
