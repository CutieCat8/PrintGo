import { notFound } from "next/navigation";
import { Button, Card, Money, PageShell, StatusBadge } from "@/components/ui";

/** PageShell preview (dev only). Sample data, ตัวอย่างสมมติ. */
export default function DevLiffShellPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <PageShell
      title="ออเดอร์ PG-0012"
      backHref="/dev/ui"
      footer={<Button fullWidth>ตกลง ชำระเงิน</Button>}
    >
      <p className="mb-3 text-sm text-ink-muted">ตัวอย่างสมมติ · ลองย่อจอให้กว้าง 360px</p>
      <Card>
        <div className="flex items-center justify-between">
          <p className="font-semibold text-brand">ร้านตัวอย่าง A</p>
          <StatusBadge status="awaiting_payment" />
        </div>
        <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1">
          <dt>ค่าปริ้น</dt>
          <dd className="text-right">
            <Money satang={2200} />
          </dd>
          <dt>ค่าบริการ</dt>
          <dd className="text-right">
            <Money satang={300} />
          </dd>
          <dt className="font-semibold">รวม</dt>
          <dd className="text-right font-semibold">
            <Money satang={2500} />
          </dd>
        </dl>
      </Card>
    </PageShell>
  );
}
