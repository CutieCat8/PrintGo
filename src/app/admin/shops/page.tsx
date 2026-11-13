import { requireAdminPage } from "../_lib/guard";
import { Shops } from "../_components/Shops";
export default async function AdminShopsPage() {
  await requireAdminPage();
  return <Shops />;
}
