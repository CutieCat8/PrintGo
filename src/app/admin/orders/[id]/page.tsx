import { requireAdminPage } from "../../_lib/guard";
import { z } from "zod";
import { notFound } from "next/navigation";
import { OrderReview } from "../../_components/OrderReview";
// Admin pages verify the session for each request before rendering.
export const instant = false;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  return <OrderReview id={id.data} />;
}
