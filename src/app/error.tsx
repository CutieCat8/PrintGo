"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-canvas p-6 text-center">
      <p className="text-5xl" aria-hidden="true">
        ⚠️
      </p>
      <h1 className="text-xl font-semibold text-brand">เกิดข้อผิดพลาด</h1>
      <p className="text-ink-muted">ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง</p>
      <Button onClick={reset}>ลองใหม่</Button>
    </main>
  );
}
