import { notFound } from "next/navigation";
import { Badge, Card, DashboardShell, StatusBadge } from "@/components/ui";

/** DashboardShell preview (dev only). Sample data, ตัวอย่างสมมติ. */
export default function DevShopShellPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <DashboardShell
      shopName="ร้านตัวอย่าง A (ตัวอย่างสมมติ)"
      queueBadge={3}
      headerActions={<Badge tone="green">เปิดรับงาน</Badge>}
      banner={
        <div className="bg-warning-50 px-4 py-3 text-warning-ink lg:px-6">
          ร้านของคุณรอแอดมินอนุมัติ (ตัวอย่างแถบแจ้งเตือน)
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(["submitted", "paid", "printing"] as const).map((s, i) => (
          <Card key={s}>
            <div className="flex items-center justify-between">
              <p className="text-lg font-semibold text-brand">PG-00{12 + i}</p>
              <StatusBadge status={s} />
            </div>
            <p className="mt-1 text-ink-muted">2 ไฟล์ · 12 หน้า · ขาวดำ · รับเอง</p>
          </Card>
        ))}
      </div>
    </DashboardShell>
  );
}
