"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, Icon, Input, PageShell, Segmented, Skeleton, cx } from "@/components/ui";
import { updateFile, type DraftFile } from "@/lib/client/draft";
import { formatRanges, parsePageRange } from "@/lib/pages";
import { FlowFooter, useFlowGuard } from "../../_components/OrderFlow";

/** Showing a tile per page stays smooth up to here; bigger files use the text box and the quick buttons. */
const MAX_TILES = 300;

type Mode = "all" | "some";

/** C3 · เลือกหน้า: which pages of one file to print (all, or e.g. "1-3, 5, 8-10"). */
export default function PagesPage() {
  return (
    <Suspense fallback={<Skeleton className="m-4 h-96" />}>
      <PagesScreen />
    </Suspense>
  );
}

function PagesScreen() {
  const key = useSearchParams().get("file");
  const { draft, hydrated } = useFlowGuard("files");
  const file = draft.files.find((f) => f.key === key);

  if (file && file.pageCount !== null) {
    return <Picker key={file.key} file={file} total={file.pageCount} />;
  }
  return (
    <PageShell title="เลือกหน้า" backHref="/liff/new">
      {!hydrated ? (
        <Skeleton className="h-96" />
      ) : (
        <p className="rounded-card bg-surface p-4 text-sm text-ink-muted ring-1 ring-line">
          ไม่พบไฟล์นี้ กรุณากลับไปเลือกไฟล์อีกครั้ง
        </p>
      )}
    </PageShell>
  );
}

function initialPages(file: DraftFile, total: number): number[] {
  if (!file.pageRange) return [];
  const r = parsePageRange(file.pageRange, total);
  return r.ok ? r.pages : [];
}

function Picker({ file, total }: { file: DraftFile; total: number }) {
  const router = useRouter();
  const start = initialPages(file, total);
  const [mode, setMode] = useState<Mode>(start.length > 0 ? "some" : "all");
  const [pages, setPages] = useState<Set<number>>(new Set(start));
  const [text, setText] = useState(start.length > 0 ? formatRanges(start) : "");

  const parsed = text.trim() === "" ? null : parsePageRange(text, total);
  const error = parsed && !parsed.ok ? parsed.message : null;
  const count = mode === "all" ? total : pages.size;
  const canConfirm = mode === "all" || (error === null && pages.size > 0);

  function choose(next: Iterable<number>) {
    const set = new Set(next);
    setPages(set);
    setText(formatRanges([...set]));
  }

  function onText(value: string) {
    setText(value);
    const r = parsePageRange(value, total);
    if (r.ok) setPages(new Set(r.pages));
    else if (value.trim() === "") setPages(new Set());
  }

  function toggle(page: number) {
    const set = new Set(pages);
    if (set.has(page)) set.delete(page);
    else set.add(page);
    choose(set);
  }

  const all = Array.from({ length: total }, (_, i) => i + 1);

  function confirm() {
    const r = mode === "all" ? null : parsePageRange(formatRanges([...pages]), total);
    // selecting every page is stored as "all pages" (null)
    const pageRange = r && r.ok ? r.canonical : null;
    updateFile(file.key, { pageRange });
    router.push("/liff/new");
  }

  return (
    <PageShell
      title="เลือกหน้า"
      backHref="/liff/new"
      footer={
        <FlowFooter>
          <Button fullWidth size="lg" arrow disabled={!canConfirm} onClick={confirm}>
            {mode === "all" || count === total
              ? `ยืนยัน · พิมพ์ทุกหน้า (${total} หน้า)`
              : `ยืนยัน · พิมพ์ ${count} หน้า`}
          </Button>
        </FlowFooter>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">
          <span className="font-semibold text-ink">{file.name}</span> · {total} หน้า
        </p>

        <Segmented<Mode>
          label="หน้าที่ต้องการพิมพ์"
          value={mode}
          options={[
            { value: "all", label: "ทุกหน้า" },
            { value: "some", label: "เลือกบางหน้า" },
          ]}
          onChange={setMode}
        />

        {mode === "some" && (
          <>
            <Input
              label="ช่วงหน้า"
              value={text}
              inputMode="text"
              placeholder="1-3, 5, 8-10"
              error={error ?? undefined}
              hint="ระบุช่วงหน้า เช่น 1-3, 5, 8-10 · ระบบตรวจให้อัตโนมัติ"
              onChange={(e) => onText(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <QuickButton onPress={() => choose(all)}>เลือกทั้งหมด</QuickButton>
              <QuickButton onPress={() => choose([])}>ล้าง</QuickButton>
              <QuickButton onPress={() => choose(all.filter((p) => p % 2 === 1))}>
                หน้าคี่
              </QuickButton>
              <QuickButton onPress={() => choose(all.filter((p) => p % 2 === 0))}>
                หน้าคู่
              </QuickButton>
            </div>

            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg font-bold italic">
                เลือก {pages.size} จาก {total} หน้า
              </h2>
              <span className="text-sm text-ink-muted">แตะหน้าเพื่อเลือก</span>
            </div>

            {total <= MAX_TILES ? (
              <ul className="grid grid-cols-3 gap-3" aria-label="หน้าของไฟล์">
                {all.map((p) => {
                  const on = pages.has(p);
                  return (
                    <li key={p}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        aria-label={`หน้า ${p}`}
                        onClick={() => toggle(p)}
                        className="flex w-full flex-col items-center gap-1.5"
                      >
                        <span
                          className={cx(
                            "flex aspect-[3/4] w-full flex-col gap-1.5 rounded-lg bg-surface p-3 transition",
                            on ? "ring-2 ring-ink" : "ring-1 ring-line",
                          )}
                        >
                          {[0, 1, 2, 3, 4].map((i) => (
                            <span key={i} className="h-1 rounded bg-line-strong/60" />
                          ))}
                        </span>
                        <span
                          className={cx(
                            "flex items-center gap-1.5 text-sm",
                            on ? "font-semibold text-ink" : "text-ink-muted",
                          )}
                        >
                          <span
                            className={cx(
                              "flex size-5 items-center justify-center rounded",
                              on ? "bg-ink text-white" : "ring-1 ring-line-strong",
                            )}
                          >
                            {on && <Icon name="check" className="size-3.5" strokeWidth={3} />}
                          </span>
                          {p}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-card bg-surface p-3 text-sm text-ink-muted ring-1 ring-line">
                ไฟล์นี้มีหน้าเยอะมาก ใช้ช่องช่วงหน้าหรือปุ่มลัดด้านบนได้เลย
              </p>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}

function QuickButton({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="inline-flex min-h-10 items-center rounded-full bg-surface px-3.5 text-sm font-medium text-ink ring-1 ring-line-strong transition hover:bg-canvas"
    >
      {children}
    </button>
  );
}
