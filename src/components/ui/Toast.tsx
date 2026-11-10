"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cx } from "./cx";

export type ToastTone = "success" | "error" | "info";
type ToastItem = { id: number; tone: ToastTone; message: string };
type ToastFn = (message: string, tone?: ToastTone) => void;

const ToastContext = createContext<ToastFn | null>(null);

const TONE: Record<ToastTone, string> = {
  success: "bg-success-50 text-success-ink ring-green-300",
  error: "bg-danger-50 text-danger-hover ring-red-300",
  info: "bg-surface text-brand ring-line",
};
const ICON: Record<ToastTone, string> = { success: "✓", error: "!", info: "i" };
const DURATION_MS = 4000;

/** Put once around a page tree (LIFF layout / shop layout). Then call useToast() anywhere inside. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const toast = useCallback<ToastFn>(
    (message, tone = "info") => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-2), { id, tone, message }]); // keep at most 3
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach(clearTimeout);
  }, []);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cx(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card px-4 py-3 shadow-pop ring-1",
              TONE[t.tone],
            )}
          >
            <span
              aria-hidden="true"
              className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-current/15 text-sm font-bold"
            >
              {ICON[t.tone]}
            </span>
            <p className="flex-1 font-medium">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="ปิดข้อความ"
              className="-my-1 -mr-2 flex size-8 items-center justify-center rounded-full opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** const toast = useToast(); toast("บันทึกแล้ว", "success") */
export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
