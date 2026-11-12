import { requireAdminPage } from "./_lib/guard";
import { Overview } from "./_components/Overview";
export default async function AdminPage() {
  await requireAdminPage();
  return <Overview />;
}
