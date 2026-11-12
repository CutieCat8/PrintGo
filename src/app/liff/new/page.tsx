"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  Button,
  Card,
  Input,
  NumberStepper,
  PageShell,
  Segmented,
  Steps,
  Textarea,
  ToggleChip,
  cx,
  useToast,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import { filesReady, updateDraft, updateFile, useDraft, type DraftFile } from "@/lib/client/draft";
import { EXTRAS, type ExtraKey } from "@/lib/client/extras";
import {
  FILE_RULES,
  countPages,
  fileProblem,
  formatBytes,
  uploadToSignedUrl,
} from "@/lib/client/files";
import { fileSettingsText } from "@/lib/client/format";
import type { ColorMode, Paper, Sides } from "@/lib/db/types";
import { LiffBottomNav } from "../_components/LiffBottomNav";
import { ORDER_STEPS } from "../_components/steps";

/** File contents live here only while the page is open (needed to retry an upload). */
const picked = new Map<string, File>();
const uploads = new Map<string, AbortController>();

const WARNING_TEXT = "ไฟล์นี้อาจมีรหัสผ่านหรือเปิดไม่ได้ ร้านอาจปริ้นให้ไม่ได้";

let nextKey = 0;
const newKey = () => `${Date.now().toString(36)}-${(nextKey++).toString(36)}`;

async function startUploads(items: DraftFile[]) {
  if (items.length === 0) return;
  items.forEach((f) => updateFile(f.key, { upload: "uploading", progress: 0 }));
  let signed;
  try {
    signed = await api.signUploads({
      files: items.map((f) => ({ name: f.name, mime: f.mime, sizeBytes: f.sizeBytes })),
    });
  } catch (e) {
    items.forEach((f) => updateFile(f.key, { upload: "failed" }));
    throw e;
  }
  await Promise.all(
    items.map(async (f, i) => {
      const file = picked.get(f.key);
      const target = signed[i];
      if (!file || !target) {
        updateFile(f.key, { upload: "failed" });
        return;
      }
      const ctrl = new AbortController();
      uploads.set(f.key, ctrl);
      try {
        await uploadToSignedUrl(
          target.uploadUrl,
          file,
          (p) => updateFile(f.key, { progress: p }),
          ctrl.signal,
        );
        updateFile(f.key, { upload: "done", progress: 1, path: target.path });
      } catch (e) {
        if ((e as Error).name !== "AbortError") updateFile(f.key, { upload: "failed" });
      } finally {
        uploads.delete(f.key);
      }
    }),
  );
}

export default function NewOrderPage() {
  const router = useRouter();
  const toast = useToast();
  const { draft, hydrated } = useDraft();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const ready = filesReady(draft);
  const uploading = draft.files.some((f) => f.upload === "uploading");
  const full = draft.files.length >= FILE_RULES.maxFiles;

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const room = FILE_RULES.maxFiles - draft.files.length;
    const files = Array.from(list);
    if (files.length > room) {
      toast(`เลือกได้สูงสุด ${FILE_RULES.maxFiles} ไฟล์ต่อออเดอร์`, "error");
    }
    const accepted: DraftFile[] = [];
    for (const file of files.slice(0, Math.max(0, room))) {
      const problem = fileProblem(file);
      if (problem) {
        toast(`${file.name}: ${problem}`, "error");
        continue;
      }
      // A new file starts with the settings of the first one (usually what people want)
      const first = draft.files[0] ?? accepted[0];
      const item: DraftFile = {
        key: newKey(),
        name: file.name,
        mime: file.type,
        sizeBytes: file.size,
        path: null,
        upload: "waiting",
        progress: 0,
        pageCount: null,
        pageWarning: null,
        counting: true,
        color: first?.color ?? "bw",
        paper: first?.paper ?? "A4",
        sides: first?.sides ?? "single",
        copies: 1,
        extras: first?.extras ?? [],
      };
      picked.set(item.key, file);
      accepted.push(item);
    }
    if (accepted.length === 0) return;

    // Shop services were picked for the old file list: pick again after choosing a shop
    updateDraft((d) => ({ ...d, files: [...d.files, ...accepted], services: [] }));

    for (const item of accepted) {
      countPages(picked.get(item.key)!).then((r) =>
        updateFile(
          item.key,
          r.ok
            ? { pageCount: r.pages, counting: false }
            : { pageCount: null, pageWarning: r.reason, counting: false },
        ),
      );
    }
    startUploads(accepted).catch((e) => toast(errorMessage(e), "error"));
  }

  function removeFile(key: string) {
    uploads.get(key)?.abort();
    picked.delete(key);
    updateDraft((d) => ({ ...d, files: d.files.filter((f) => f.key !== key), services: [] }));
  }

  function retry(f: DraftFile) {
    if (!picked.has(f.key)) {
      toast("ไฟล์นี้ต้องเลือกใหม่อีกครั้ง", "error");
      removeFile(f.key);
      return;
    }
    startUploads([f]).catch((e) => toast(errorMessage(e), "error"));
  }

  function applyToAll(f: DraftFile) {
    updateDraft((d) => ({
      ...d,
      files: d.files.map((x) => ({
        ...x,
        color: f.color,
        paper: f.paper,
        sides: f.sides,
        copies: f.copies,
        extras: f.extras,
      })),
      services: [],
    }));
    toast("ใช้ค่านี้กับทุกไฟล์แล้ว", "success");
  }

  const reason = !hydrated
    ? null
    : draft.files.length === 0
      ? "เลือกไฟล์อย่างน้อย 1 ไฟล์"
      : uploading || draft.files.some((f) => f.upload === "waiting")
        ? "รออัปโหลดไฟล์ให้เสร็จก่อน"
        : draft.files.some((f) => f.upload === "failed")
          ? "มีไฟล์ที่อัปโหลดไม่สำเร็จ กดลองใหม่หรือลบออก"
          : draft.files.some((f) => f.counting)
            ? "กำลังนับจำนวนหน้า…"
            : !ready
              ? "กรอกจำนวนหน้าและจำนวนชุดให้ครบ"
              : null;

  return (
    <PageShell
      title="สั่งปริ้น"
      footer={
        <div className="flex flex-col gap-1">
          <Button
            fullWidth
            size="lg"
            disabled={!ready}
            onClick={() => router.push("/liff/new/shop")}
          >
            ถัดไป: เลือกร้าน →
          </Button>
          {reason && <p className="text-center text-sm text-ink-muted">{reason}</p>}
        </div>
      }
      bottomNav={<LiffBottomNav />}
    >
      <div className="flex flex-col gap-4">
        <Steps steps={ORDER_STEPS} current={0} />

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={FILE_RULES.mimes.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {draft.files.length === 0 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            className={cx(
              "flex flex-col items-center gap-2 rounded-card border-2 border-dashed bg-surface px-6 py-10 text-center transition",
              dragging
                ? "border-accent-ink bg-accent-50"
                : "border-brand/25 hover:border-accent-ink",
            )}
          >
            <span
              aria-hidden="true"
              className="flex size-16 items-center justify-center rounded-full bg-accent-50 text-3xl"
            >
              📄
            </span>
            <span className="text-lg font-semibold text-brand">แตะเพื่อเลือกไฟล์ที่จะปริ้น</span>
            <span className="text-sm text-ink-muted">
              PDF, JPG, PNG · ไฟล์ละไม่เกิน 20 MB · สูงสุด {FILE_RULES.maxFiles} ไฟล์
            </span>
          </button>
        ) : (
          <section aria-label="ไฟล์ที่เลือก" className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-lg font-semibold text-brand">
                ไฟล์ของคุณ{" "}
                <span className="text-base font-normal text-ink-muted">
                  ({draft.files.length}/{FILE_RULES.maxFiles})
                </span>
              </h2>
              <Button
                variant="secondary"
                size="sm"
                disabled={full}
                onClick={() => inputRef.current?.click()}
              >
                + เพิ่มไฟล์
              </Button>
            </div>
            {draft.files.map((f, i) => (
              <FileCard
                key={f.key}
                file={f}
                index={i}
                many={draft.files.length > 1}
                onRemove={() => removeFile(f.key)}
                onRetry={() => retry(f)}
                onApplyAll={() => applyToAll(f)}
              />
            ))}
          </section>
        )}

        <details className="group rounded-card bg-info-50 px-4 py-3 text-sm text-info-ink">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
            <span aria-hidden="true">🔒</span>
            <span>
              ร้านจะเปิดและดาวน์โหลดไฟล์ของคุณเพื่อปริ้น{" "}
              <b>หากเป็นเอกสารลับไม่ควรส่งผ่านบริการนี้</b>
            </span>
            <span className="ml-auto text-xs underline group-open:hidden">อ่านเพิ่ม</span>
          </summary>
          <p className="mt-2">
            ร้านที่คุณเลือกจะเปิดและดาวน์โหลดไฟล์เพื่อปริ้นได้ ไฟล์บนระบบเราจะถูกลบภายใน 7
            วันหลังจบออเดอร์ แต่สำเนาที่ร้านดาวน์โหลดไปอยู่ในความดูแลของร้าน
            หากเป็นเอกสารลับไม่ควรส่งผ่านบริการนี้
          </p>
        </details>

        {draft.files.length > 0 && (
          <Card>
            <Textarea
              label="หมายเหตุถึงร้าน (ไม่บังคับ)"
              rows={3}
              maxLength={500}
              value={draft.note}
              placeholder="เช่น ปริ้นเฉพาะหน้า 1-5, เข้าเล่มด้านซ้าย"
              onChange={(e) => updateDraft((d) => ({ ...d, note: e.target.value }))}
            />
          </Card>
        )}
      </div>
    </PageShell>
  );
}

function FileCard({
  file: f,
  index,
  many,
  onRemove,
  onRetry,
  onApplyAll,
}: {
  file: DraftFile;
  index: number;
  many: boolean;
  onRemove: () => void;
  onRetry: () => void;
  onApplyAll: () => void;
}) {
  const set = (patch: Partial<DraftFile>) => updateFile(f.key, patch);
  const pagesInvalid =
    !f.counting && (f.pageCount === null || f.pageCount < 1 || f.pageCount > 10000);
  const isPdf = f.mime === "application/pdf";
  const extras = f.extras ?? [];
  // Only the first file starts open, so a long list stays short; a file that needs input opens too
  const copiesInvalid = !Number.isInteger(f.copies) || f.copies < 1 || f.copies > 99;
  const needsInput = !f.counting && (pagesInvalid || copiesInvalid);
  const [open, setOpen] = useState(index === 0);
  const expanded = open || needsInput;

  function toggleExtra(k: ExtraKey) {
    const next = extras.includes(k) ? extras.filter((x) => x !== k) : [...extras, k];
    // Shop services were ticked from the old wishes: they are picked again after choosing a shop
    updateDraft((d) => ({
      ...d,
      services: [],
      files: d.files.map((x) => (x.key === f.key ? { ...x, extras: next } : x)),
    }));
  }

  return (
    <Card as="article" padding="none" aria-label={`ไฟล์ที่ ${index + 1}: ${f.name}`}>
      <div className="flex items-start gap-3 p-4 pb-3">
        <span
          aria-hidden="true"
          className={cx(
            "flex size-11 shrink-0 items-center justify-center rounded-control text-xs font-bold",
            isPdf ? "bg-danger-50 text-danger" : "bg-info-50 text-info-ink",
          )}
        >
          {isPdf ? "PDF" : "IMG"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{f.name}</p>
          <p className="text-sm text-ink-muted">
            {formatBytes(f.sizeBytes)}
            {f.counting ? " · กำลังนับหน้า…" : f.pageCount ? ` · ${f.pageCount} หน้า` : ""}
          </p>
          <UploadBar file={f} onRetry={onRetry} />
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`ลบไฟล์ ${f.name}`}
          className="-mt-1 -mr-1 flex size-10 items-center justify-center rounded-full text-lg text-ink-muted hover:bg-canvas hover:text-danger"
        >
          ✕
        </button>
      </div>

      {f.pageWarning && f.pageWarning !== "unknown" && (
        <p
          className="mx-4 mb-3 rounded-control bg-warning-50 p-2 text-sm text-warning-ink"
          role="note"
        >
          ⚠️ {WARNING_TEXT}
        </p>
      )}

      {!expanded && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className="flex w-full items-center gap-2 border-t border-line bg-canvas/50 px-4 py-3 text-left text-sm"
        >
          <span className="min-w-0 flex-1 truncate text-ink-muted">
            {fileSettingsText(f)}
            {extras.length > 0 &&
              ` · ${extras.map((k) => EXTRAS.find((e) => e.key === k)?.label).join(", ")}`}
          </span>
          <span className="shrink-0 font-semibold text-brand">แก้ไข ▾</span>
        </button>
      )}
      {expanded && (
        <div className="flex flex-col gap-4 border-t border-line bg-canvas/50 p-4">
          {isPdf && !f.counting && f.pageWarning !== null && (
            <Input
              label="จำนวนหน้า"
              type="number"
              inputMode="numeric"
              min={1}
              max={10000}
              required
              value={f.pageCount ?? ""}
              hint="นับหน้าอัตโนมัติไม่ได้ กรอกเองได้ ร้านจะตรวจอีกครั้ง"
              error={pagesInvalid && f.pageCount !== null ? "1–10,000 หน้า" : undefined}
              onChange={(e) =>
                set({
                  pageCount: e.target.value === "" ? null : Math.trunc(Number(e.target.value)),
                })
              }
            />
          )}
          <Segmented<ColorMode>
            label="สี"
            value={f.color}
            options={[
              { value: "bw", label: "⚫ ขาวดำ" },
              { value: "color", label: "🎨 สี" },
            ]}
            onChange={(color) => set({ color })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Segmented<Paper>
              label="ขนาดกระดาษ"
              value={f.paper}
              options={[
                { value: "A4", label: "A4" },
                { value: "A3", label: "A3" },
              ]}
              onChange={(paper) => set({ paper })}
            />
            <Segmented<Sides>
              label="หน้า/หลัง"
              value={f.sides}
              options={[
                { value: "single", label: "หน้าเดียว" },
                { value: "double", label: "สองหน้า" },
              ]}
              onChange={(sides) => set({ sides })}
            />
          </div>
          <NumberStepper
            label="จำนวนชุด"
            unit="ชุด"
            value={f.copies}
            onChange={(copies) => set({ copies })}
          />

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink-muted">
              งานเพิ่มเติม (ไม่บังคับ)
            </legend>
            <div className="flex flex-wrap gap-2">
              {EXTRAS.map((e) => (
                <ToggleChip
                  key={e.key}
                  icon={e.icon}
                  pressed={extras.includes(e.key)}
                  onToggle={() => toggleExtra(e.key)}
                >
                  {e.label}
                </ToggleChip>
              ))}
            </div>
            {extras.length > 0 && (
              <p className="mt-2 text-xs text-ink-muted">
                ราคางานเพิ่มเติมเป็นของแต่ละร้าน ดูได้ตอนเลือกร้าน
              </p>
            )}
          </fieldset>

          <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
            <p className="min-w-0 truncate text-sm text-ink-muted">{fileSettingsText(f)}</p>
            <div className="flex shrink-0 gap-1">
              {many && (
                <Button variant="ghost" size="sm" onClick={onApplyAll}>
                  ใช้กับทุกไฟล์
                </Button>
              )}
              {!needsInput && (
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-expanded>
                  ย่อ ▴
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function UploadBar({ file: f, onRetry }: { file: DraftFile; onRetry: () => void }) {
  if (f.upload === "done") {
    return <p className="mt-1 text-sm font-medium text-success-ink">✓ อัปโหลดแล้ว</p>;
  }
  if (f.upload === "failed") {
    return (
      <div className="mt-1 flex items-center gap-2">
        <p className="text-sm text-danger" role="alert">
          อัปโหลดไม่สำเร็จ
        </p>
        <Button size="sm" variant="secondary" onClick={onRetry}>
          ลองใหม่
        </Button>
      </div>
    );
  }
  const pct = Math.round(f.progress * 100);
  return (
    <div className="mt-2">
      <div
        className="h-1.5 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-label={`อัปโหลด ${f.name}`}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full bg-accent-ink transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        {f.upload === "waiting" ? "รออัปโหลด…" : `กำลังอัปโหลด ${pct}%`}
      </p>
    </div>
  );
}
