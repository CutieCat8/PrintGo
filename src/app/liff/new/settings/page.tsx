"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Button,
  Checkbox,
  Icon,
  NumberStepper,
  PageShell,
  Segmented,
  Skeleton,
  Steps,
  cx,
} from "@/components/ui";
import { filesReady, updateDraft, type DraftFile } from "@/lib/client/draft";
import { COLOR_LABEL, PAPER_LABEL, SIDES_LABEL } from "@/lib/client/format";
import type { ColorMode, Paper, Sides } from "@/lib/db/types";
import { FlowFooter, printedPages, useFlowGuard } from "../../_components/OrderFlow";
import { ORDER_STEPS } from "../../_components/steps";

type Setting = Pick<DraftFile, "color" | "paper" | "sides" | "copies">;

/** C4 · step 2: print settings per file (tabs), with "ใช้ค่านี้กับทุกไฟล์". No prices yet. */
export default function SettingsPage() {
  const router = useRouter();
  const { draft, hydrated } = useFlowGuard("files");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [allFiles, setAllFiles] = useState(false);

  const files = draft.files;
  const current = files.find((f) => f.key === activeKey) ?? files[0];
  const totalPrinted = files.reduce((n, f) => n + printedPages(f), 0);

  function set(patch: Partial<Setting>) {
    if (!current) return;
    updateDraft((d) => ({
      ...d,
      files: d.files.map((f) => (allFiles || f.key === current.key ? { ...f, ...patch } : f)),
    }));
  }

  function toggleAll(on: boolean) {
    setAllFiles(on);
    if (on && current) {
      const { color, paper, sides, copies } = current;
      updateDraft((d) => ({
        ...d,
        files: d.files.map((f) => ({ ...f, color, paper, sides, copies })),
      }));
    }
  }

  return (
    <PageShell
      title="ตั้งค่าการพิมพ์"
      backHref="/liff/new"
      footer={
        <FlowFooter summary={`รวมทุกไฟล์ · ${totalPrinted} หน้าพิมพ์`}>
          <Button
            fullWidth
            size="lg"
            arrow
            disabled={!filesReady(draft)}
            onClick={() => router.push("/liff/new/shop")}
          >
            ต่อไป: เลือกร้าน
          </Button>
        </FlowFooter>
      }
    >
      <Steps steps={ORDER_STEPS} current={1} className="mb-5" />

      {!hydrated || !current ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="flex flex-col gap-5">
          {files.length > 1 && (
            <div
              role="tablist"
              aria-label="ไฟล์"
              className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {files.map((f) => {
                const on = f.key === current.key;
                return (
                  <button
                    key={f.key}
                    role="tab"
                    type="button"
                    aria-selected={on}
                    onClick={() => setActiveKey(f.key)}
                    className={cx(
                      "max-w-40 shrink-0 truncate rounded-full px-4 py-2 text-sm font-semibold transition",
                      on
                        ? "bg-ink text-white"
                        : "bg-surface text-ink ring-1 ring-line hover:ring-ink/40",
                    )}
                  >
                    {f.name.replace(/\.[^.]+$/, "")}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-3 rounded-card bg-surface p-3.5 ring-1 ring-line">
            <span
              aria-hidden="true"
              className="flex h-12 w-10 shrink-0 items-center justify-center rounded-lg bg-canvas text-ink-muted"
            >
              <Icon
                name={current.mime === "application/pdf" ? "file" : "image"}
                className="size-5"
              />
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold">{current.name}</p>
              <p className="text-sm text-ink-muted">พิมพ์ทั้งหมด {current.pageCount} หน้า</p>
            </div>
          </div>

          <Segmented<ColorMode>
            label="สี"
            value={current.color}
            options={[
              { value: "bw", label: COLOR_LABEL.bw },
              { value: "color", label: COLOR_LABEL.color },
            ]}
            onChange={(color) => set({ color })}
          />
          <Segmented<Paper>
            label="ขนาดกระดาษ"
            value={current.paper}
            options={[
              { value: "A4", label: PAPER_LABEL.A4 },
              { value: "A3", label: PAPER_LABEL.A3 },
            ]}
            onChange={(paper) => set({ paper })}
          />
          <Segmented<Sides>
            label="การพิมพ์"
            value={current.sides}
            options={[
              { value: "single", label: SIDES_LABEL.single },
              { value: "double", label: SIDES_LABEL.double },
            ]}
            onChange={(sides) => set({ sides })}
          />
          <NumberStepper
            label="จำนวนชุด"
            unit="ชุด"
            value={current.copies}
            onChange={(copies) => set({ copies })}
          />

          {files.length > 1 && (
            <Checkbox
              checked={allFiles}
              onChange={(e) => toggleAll(e.target.checked)}
              label="ใช้ค่านี้กับทุกไฟล์"
              description="เปลี่ยนค่าตอนนี้จะเปลี่ยนให้ทุกไฟล์พร้อมกัน"
            />
          )}

          <p className="flex items-center gap-2 rounded-card bg-brand-50 px-4 py-3 text-sm font-medium text-brand">
            <Icon name="printer" className="size-4 shrink-0" />
            {current.pageCount} หน้า × {current.copies || 0} ชุด ={" "}
            <b className="font-display text-base italic">{printedPages(current)} หน้าพิมพ์</b>
            {current.sides === "double" && (
              <span className="text-brand/70">
                (สองด้าน ≈ {Math.ceil(printedPages(current) / 2)} แผ่น)
              </span>
            )}
          </p>
        </div>
      )}
    </PageShell>
  );
}
