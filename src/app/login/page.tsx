import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="text-center">
          <p className="text-3xl font-bold text-brand">
            Print<span className="text-accent">Go</span>
          </p>
          <p className="text-sm text-ink-muted">สำหรับร้านปริ้น</p>
        </div>
        <section className="rounded-card bg-surface p-6 shadow-card ring-1 ring-line">
          <h1 className="text-xl font-semibold text-brand">เข้าสู่ระบบ / สมัครร้านค้า</h1>
          <p className="mt-2 text-sm text-ink-muted">
            กรอกอีเมล เราจะส่งลิงก์เข้าสู่ระบบให้ ไม่ต้องใช้รหัสผ่าน
            ร้านใหม่ใช้ช่องเดียวกันนี้ได้เลย
          </p>
          <div className="mt-5">
            {/* useSearchParams needs a Suspense boundary on a statically built page */}
            <Suspense>
              <LoginForm />
            </Suspense>
          </div>
        </section>
      </div>
    </main>
  );
}
