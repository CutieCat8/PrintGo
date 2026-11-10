import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">เข้าสู่ระบบ / สมัครร้านค้า</h1>
        <p className="mt-2 text-sm text-gray-600">
          กรอกอีเมล เราจะส่งลิงก์เข้าสู่ระบบให้ ไม่ต้องใช้รหัสผ่าน ร้านใหม่ใช้ช่องเดียวกันนี้ได้เลย
        </p>
      </div>
      {/* useSearchParams needs a Suspense boundary on a statically built page */}
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
