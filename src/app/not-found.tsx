import Link from "next/link";
import { buttonClasses } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-canvas p-6 text-center">
      <p className="text-5xl" aria-hidden="true">
        🔎
      </p>
      <h1 className="text-xl font-semibold text-brand">ไม่พบหน้าที่ต้องการ</h1>
      <p className="text-ink-muted">ลิงก์อาจผิด หรือหน้านี้ถูกย้ายไปแล้ว</p>
      <Link href="/" className={buttonClasses({ variant: "secondary" })}>
        กลับหน้าแรก
      </Link>
    </main>
  );
}
