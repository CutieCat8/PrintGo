"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { getBrowserClient } from "@/lib/db/browser";

type State = "idle" | "sending" | "sent" | "failed";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  // /auth/callback sends people back here with ?error=link when the link was used up or expired
  const linkFailed = useSearchParams().get("error") === "link";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("sending");
    const { error } = await getBrowserClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setState(error ? "failed" : "sent");
  }

  if (state === "sent") {
    return (
      <p role="status" className="rounded-control bg-success-50 p-3 text-success-ink">
        ส่งลิงก์ไปที่ {email} แล้ว กรุณาเปิดอีเมลและกดลิงก์ในเบราว์เซอร์เดียวกับที่ใช้ขอลิงก์นี้
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {linkFailed && (
        <p role="alert" className="rounded-control bg-danger-50 p-2 text-sm text-danger">
          ลิงก์หมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่
        </p>
      )}
      <label className="flex flex-col gap-1.5 font-medium">
        อีเมล
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-11 rounded-control border border-line bg-surface px-3 py-2 text-base font-normal focus:border-brand focus:ring-2 focus:ring-accent-ink/50 focus:outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={state === "sending"}
        className="min-h-12 rounded-control bg-accent-ink px-4 py-2 text-lg font-semibold text-white shadow-sm hover:bg-accent-ink-hover disabled:opacity-50"
      >
        {state === "sending" ? "กำลังส่ง..." : "ส่งลิงก์เข้าสู่ระบบ"}
      </button>
      {state === "failed" && (
        <p role="alert" className="rounded-control bg-danger-50 p-2 text-sm text-danger">
          ส่งลิงก์ไม่สำเร็จ กรุณาตรวจอีเมลแล้วลองใหม่ (ถ้าขอบ่อยเกินไปอาจต้องรอสักครู่)
        </p>
      )}
    </form>
  );
}
