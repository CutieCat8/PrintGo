import { requireAdminPage } from "../_lib/guard";
import { Orders } from "../_components/Orders";
export default async function Page() {
  await requireAdminPage();
  return <Orders />;
}
