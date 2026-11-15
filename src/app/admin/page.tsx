import { requireAdminPage } from "./_lib/guard";
import { Overview } from "./_components/Overview";
// Admin pages verify the session for each request before rendering.
export const instant = false;

export default async function AdminPage() {
  await requireAdminPage();
  return <Overview />;
}
