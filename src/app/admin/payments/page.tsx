import { requireAdminPage } from "../_lib/guard";
import { ReviewPayments } from "../_components/ReviewPayments";
export default async function Page() {
  await requireAdminPage();
  return <ReviewPayments />;
}
