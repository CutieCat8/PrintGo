import type { Metadata } from "next";
import { ToastProvider } from "@/components/ui";
import { displayFont } from "@/components/ui/fonts";
import { LiffGate } from "./_components/LiffGate";

export const metadata: Metadata = { title: "PrintGo · สั่งปริ้น" };

/** Pages wait for the LINE sign-in (LiffGate) before showing anything, so they cannot be instant. */
export const instant = false;

/** Every customer page runs inside LINE (LIFF) and waits for sign-in before calling the API. */
export default function LiffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={displayFont.variable}>
      <ToastProvider>
        <LiffGate>{children}</LiffGate>
      </ToastProvider>
    </div>
  );
}
