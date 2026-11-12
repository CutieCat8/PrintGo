import Link from "next/link";
import { buttonClasses } from "@/components/ui";

/** Public landing: customers order inside LINE; shops sign in here. */
export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-canvas p-6 text-center">
      <div>
        <p className="text-5xl font-bold text-brand">
          Print<span className="text-accent">Go</span>
        </p>
        <p className="mt-3 text-lg text-ink-muted">Your file goes in. Your print comes home.</p>
        <p className="mt-1 text-ink-muted">
          ส่งไฟล์ เลือกร้าน รับงานเอง หรือให้ไรเดอร์ไปส่ง ผ่าน LINE
        </p>
      </div>
      <div className="grid w-full max-w-md gap-3 sm:grid-cols-2">
        <section className="rounded-card bg-surface p-5 shadow-card ring-1 ring-line">
          <h2 className="font-semibold text-brand">สำหรับลูกค้า</h2>
          <p className="mt-1 text-sm text-ink-muted">
            เพิ่มเพื่อน LINE OA ของ PrintGo แล้วกดเมนู สั่งปริ้น
          </p>
        </section>
        <section className="flex flex-col rounded-card bg-surface p-5 shadow-card ring-1 ring-line">
          <h2 className="font-semibold text-brand">สำหรับร้านปริ้น</h2>
          <p className="mt-1 text-sm text-ink-muted">รับออเดอร์ ยืนยันราคา และคุยกับลูกค้า</p>
          <Link href="/login" className={buttonClasses({ className: "mt-3" })}>
            เข้าสู่ระบบร้าน
          </Link>
        </section>
      </div>
    </main>
  );
}
