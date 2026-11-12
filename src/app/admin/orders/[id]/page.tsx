import { requireAdminPage } from "../../_lib/guard";
import { z } from "zod";
import { notFound } from "next/navigation";
import { OrderReview } from "../../_components/OrderReview";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  return <OrderReview id={id.data} />;
}
