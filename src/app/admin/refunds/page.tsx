import { requireAdminPage } from "../_lib/guard";
import { Ledger } from "../_components/Ledger";
export const instant = false;
export default async function Page() {
  await requireAdminPage();
  return <Ledger kind="refunds" />;
}
