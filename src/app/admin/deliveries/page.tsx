import { requireAdminPage } from "../_lib/guard";
import { Deliveries } from "../_components/Deliveries";
export const instant = false;
export default async function DeliveriesPage() {
  await requireAdminPage();
  return <Deliveries />;
}
