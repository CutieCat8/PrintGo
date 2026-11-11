"use client";

import { useEffect, useState, type ReactNode } from "react";
import { EmptyState, ErrorState, Spinner } from "@/components/ui";
import { startCustomerSession, type LiffState } from "@/lib/client/liff";

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md items-center justify-center p-6">
      {children}
    </div>
  );
}

/** Shows the page only once the customer is signed in (LIFF), or explains why not. */
export function LiffGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LiffState | null>(null);

  useEffect(() => {
    let alive = true;
    startCustomerSession().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);

  if (!state || state.kind === "redirecting") {
    return (
      <Centered>
        <div className="flex flex-col items-center gap-3 text-ink-muted" role="status">
          <Spinner className="size-8 text-brand" />
          {state ? "กำลังพาไปเข้าสู่ระบบ LINE…" : "กำลังเปิด PrintGo…"}
        </div>
      </Centered>
    );
  }

  if (state.kind === "outside_line") {
    return (
      <Centered>
        <EmptyState
          icon="💬"
          title="กรุณาเปิดจากแอป LINE"
          description="หน้านี้ใช้งานผ่าน LINE OA ของ PrintGo เท่านั้น เปิด LINE แล้วกดเมนู สั่งปริ้น"
        />
      </Centered>
    );
  }

  if (state.kind === "not_configured") {
    return (
      <Centered>
        <ErrorState
          title="ระบบยังไม่พร้อมใช้งาน"
          description="ยังไม่ได้ตั้งค่า LINE (LIFF) กรุณาติดต่อผู้ดูแล"
        />
      </Centered>
    );
  }

  if (state.kind === "error") {
    return (
      <Centered>
        <ErrorState
          title="เปิดไม่สำเร็จ"
          description={state.message}
          onRetry={() => window.location.reload()}
        />
      </Centered>
    );
  }

  return <>{children}</>;
}
