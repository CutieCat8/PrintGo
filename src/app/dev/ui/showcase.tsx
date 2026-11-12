"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  ChoiceGroup,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Money,
  Radio,
  Select,
  Sheet,
  Skeleton,
  SkeletonCard,
  StatusBadge,
  Textarea,
  Timeline,
  ToastProvider,
  buttonClasses,
  useToast,
  type StatusTone,
} from "@/components/ui";
import { ENUMS } from "@/lib/db/enums";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4">
      <Card padding="lg">
        <CardHeader title={title} />
        {children}
      </Card>
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

const TONES: StatusTone[] = [
  "amber",
  "orange",
  "blue",
  "navy",
  "teal",
  "violet",
  "green",
  "red",
  "gray",
];

function ToastDemo() {
  const toast = useToast();
  return (
    <Row>
      <Button variant="secondary" onClick={() => toast("ยืนยันราคาแล้ว", "success")}>
        สำเร็จ
      </Button>
      <Button variant="secondary" onClick={() => toast("ออเดอร์นี้เปลี่ยนสถานะแล้ว", "error")}>
        ผิดพลาด
      </Button>
      <Button variant="secondary" onClick={() => toast("มีออเดอร์ใหม่ 1 รายการ")}>
        แจ้งข้อมูล
      </Button>
    </Row>
  );
}

function Gallery() {
  const [note, setNote] = useState("ขอเย็บมุมซ้ายบน");
  const [modalOpen, setModalOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [color, setColor] = useState("bw");
  const [busy, setBusy] = useState(false);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold text-brand">
          Print<span className="text-accent">Go</span> · ชุดคอมโพเนนต์
        </h1>
        <p className="text-ink-muted">
          หน้านี้สำหรับทีมพัฒนาเท่านั้น (เปิดได้เฉพาะโหมด dev) · ข้อมูลทั้งหมดเป็น{" "}
          <strong>ตัวอย่างสมมติ</strong> · import จาก <code>@/components/ui</code>
        </p>
        <nav className="mt-3 flex flex-wrap gap-2 text-sm">
          <Link className={buttonClasses({ variant: "secondary", size: "sm" })} href="/dev/ui/liff">
            ดู PageShell (ลูกค้า)
          </Link>
          <Link className={buttonClasses({ variant: "secondary", size: "sm" })} href="/dev/ui/shop">
            ดู DashboardShell (ร้าน)
          </Link>
        </nav>
      </header>

      <Section id="colors" title="สีธีม">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["bg-brand text-white", "brand #12284C"],
            ["bg-accent text-brand", "accent #F26B21"],
            ["bg-accent-ink text-white", "accent-ink (ปุ่ม)"],
            ["bg-canvas text-ink ring-1 ring-line", "canvas (พื้นหน้า)"],
            ["bg-surface text-ink ring-1 ring-line", "surface (การ์ด)"],
            ["bg-ink text-white", "ink (ตัวอักษร)"],
            ["bg-danger text-white", "danger"],
            ["bg-warning-50 text-warning-ink ring-1 ring-amber-200", "warning"],
          ].map(([cls, name]) => (
            <div key={name} className={`rounded-control p-3 text-sm font-medium ${cls}`}>
              {name}
            </div>
          ))}
        </div>
      </Section>

      <Section id="buttons" title="Button">
        <div className="flex flex-col gap-4">
          <Row>
            <Button>ส่งให้ร้านยืนยัน</Button>
            <Button variant="secondary">ดูรายละเอียด</Button>
            <Button variant="ghost">ยกเลิก</Button>
            <Button variant="danger">ปฏิเสธงาน</Button>
          </Row>
          <Row>
            <Button size="sm">เล็ก (ร้าน)</Button>
            <Button size="md">ปกติ 44px</Button>
            <Button size="lg">ใหญ่ (ร้าน)</Button>
          </Row>
          <Row>
            <Button disabled>ปิดใช้งาน</Button>
            <Button loading>กำลังส่ง…</Button>
            <Button
              variant="secondary"
              loading={busy}
              onClick={() => {
                setBusy(true);
                setTimeout(() => setBusy(false), 1500);
              }}
            >
              กดเพื่อลอง loading
            </Button>
          </Row>
          <Button fullWidth>ถัดไป: เลือกร้าน (เต็มความกว้าง)</Button>
        </div>
      </Section>

      <Section id="fields" title="Input · Textarea · Select · Checkbox · Radio">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="ชื่อผู้รับ" placeholder="เช่น สมหญิง" required autoComplete="name" />
          <Input
            label="เบอร์โทร"
            inputMode="tel"
            defaultValue="08"
            error="กรุณากรอกเบอร์ 10 หลัก"
          />
          <Input label="ช่องที่ปิดอยู่" disabled defaultValue="แก้ไขไม่ได้" />
          <Select
            label="ขนาดกระดาษ"
            hint="ร้านจะคิดราคาตามขนาด"
            placeholder="เลือกขนาด…"
            options={[
              { value: "A4", label: "A4" },
              { value: "A3", label: "A3" },
            ]}
          />
          <Textarea
            className="sm:col-span-2"
            label="หมายเหตุถึงร้าน"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <ChoiceGroup legend="สี">
            <Radio
              name="color"
              value="bw"
              label="ขาวดำ"
              checked={color === "bw"}
              onChange={() => setColor("bw")}
            />
            <Radio
              name="color"
              value="color"
              label="สี"
              description="ราคาสูงกว่าขาวดำ"
              checked={color === "color"}
              onChange={() => setColor("color")}
            />
          </ChoiceGroup>
          <ChoiceGroup legend="บริการเสริม" error="ตัวอย่างข้อความผิดพลาดของกลุ่ม">
            <Checkbox label="เย็บมุม" description="฿5/ชุด" defaultChecked />
            <Checkbox label="ปกใส" description="ราคาตามตกลง" />
            <Checkbox label="เข้าเล่มสันกาว" disabled description="ร้านนี้ไม่มีบริการ" />
          </ChoiceGroup>
        </div>
      </Section>

      <Section id="badges" title="StatusBadge (11 สถานะ) · Badge">
        <div className="flex flex-col gap-4">
          <Row>
            {ENUMS.OrderStatus.map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </Row>
          <Row>
            <span className="text-sm text-ink-muted">ready + วิธีรับ:</span>
            <StatusBadge status="ready" fulfillment="pickup" />
            <StatusBadge status="ready" fulfillment="delivery" />
          </Row>
          <Row>
            {TONES.map((t) => (
              <Badge key={t} tone={t}>
                {t}
              </Badge>
            ))}
          </Row>
        </div>
      </Section>

      <Section id="money" title="Money (รับค่าเป็นสตางค์)">
        <Row>
          <Money satang={2200} className="text-lg font-semibold" />
          <Money satang={125050} className="text-lg font-semibold" />
          <Money satang={5} />
          <span className="text-sm text-ink-muted">
            ← 2200, 125050, 5 สตางค์ · ค่าที่เป็น null ห้ามส่งเข้า Money ให้แสดงข้อความแทน
          </span>
        </Row>
      </Section>

      <Section id="timeline" title="Timeline">
        <div className="grid gap-6 sm:grid-cols-2">
          <Timeline
            steps={[
              { key: "s", title: "รอร้านยืนยัน", time: "10:23 น.", state: "done" },
              { key: "a", title: "รอชำระเงิน", time: "10:30 น.", state: "done" },
              {
                key: "p",
                title: "กำลังปริ้น",
                description: "เสร็จประมาณ 11:00 น.",
                state: "current",
              },
              { key: "r", title: "พร้อมรับ", state: "upcoming" },
              { key: "c", title: "เสร็จสิ้น", state: "upcoming" },
            ]}
          />
          <Timeline
            steps={[
              { key: "s", title: "รอร้านยืนยัน", time: "10:23 น.", state: "done" },
              {
                key: "x",
                title: "ร้านปฏิเสธ",
                description: "เหตุผล: ไฟล์มีรหัสผ่าน",
                state: "failed",
              },
            ]}
          />
        </div>
      </Section>

      <Section id="overlays" title="Modal · Sheet · Toast">
        <div className="flex flex-col gap-4">
          <Row>
            <Button variant="secondary" onClick={() => setModalOpen(true)}>
              เปิด Modal
            </Button>
            <Button variant="secondary" onClick={() => setSheetOpen(true)}>
              เปิด Sheet
            </Button>
          </Row>
          <ToastDemo />
        </div>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="ยกเลิกออเดอร์?"
          description="ยกเลิกแล้วย้อนกลับไม่ได้"
          footer={
            <>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                ไม่ยกเลิก
              </Button>
              <Button variant="danger" onClick={() => setModalOpen(false)}>
                ยืนยันยกเลิก
              </Button>
            </>
          }
        />
        <Sheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="เลือกเหตุผลที่ปฏิเสธ"
          footer={
            <Button fullWidth onClick={() => setSheetOpen(false)}>
              ตกลง
            </Button>
          }
        >
          <ChoiceGroup legend="เหตุผล">
            <Radio name="reason" label="เปิดไฟล์ไม่ได้" defaultChecked />
            <Radio name="reason" label="ไฟล์มีรหัสผ่าน/ไฟล์เสีย" />
            <Radio name="reason" label="ไม่รับงานชุดนี้" />
          </ChoiceGroup>
        </Sheet>
      </Section>

      <Section id="states" title="4 สถานะของหน้า: โหลด · ว่าง · ผิดพลาด · ปกติ">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium text-ink-muted">กำลังโหลด</p>
            <SkeletonCard />
            <div className="mt-3 flex gap-2">
              <Skeleton className="h-11 w-24" />
              <Skeleton className="h-11 flex-1" />
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-ink-muted">ปกติ</p>
            <Card>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-brand">PG-0012</p>
                  <p className="text-sm text-ink-muted">ร้านตัวอย่าง A · 2 ไฟล์ · 12 หน้า</p>
                </div>
                <StatusBadge status="printing" />
              </div>
              <p className="mt-2 text-right">
                <Money satang={2500} className="font-semibold" />
              </p>
            </Card>
          </div>
          <Card padding="none">
            <EmptyState
              title="ยังไม่มีออเดอร์"
              description="สั่งปริ้นงานแรกได้เลย"
              action={<Button>สั่งปริ้น</Button>}
            />
          </Card>
          <Card padding="none">
            <ErrorState onRetry={() => undefined} />
          </Card>
        </div>
      </Section>
    </div>
  );
}

export function Showcase() {
  return (
    <ToastProvider>
      <Gallery />
    </ToastProvider>
  );
}
