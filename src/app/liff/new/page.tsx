"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { Button, Card, Input, PageShell, Select, Textarea, cx, useToast } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import { filesReady, updateDraft, updateFile, useDraft, type DraftFile } from "@/lib/client/draft";
import {
  FILE_RULES,
  countPages,
  fileProblem,
  formatBytes,
  uploadToSignedUrl,
} from "@/lib/client/files";
import type { ColorMode, Paper, Sides } from "@/lib/db/types";
import { LiffBottomNav } from "../_components/LiffBottomNav";

/** File contents live here only while the page is open (needed to retry an upload). */
const picked = new Map<string, File>();
const uploads = new Map<string, AbortController>();

const COLOR_OPTIONS = [
  { value: "bw", label: "ขาวดำ" },
  { value: "color", label: "สี" },
];
const PAPER_OPTIONS = [
  { value: "A4", label: "A4" },
  { value: "A3", label: "A3" },
];
const SIDES_OPTIONS = [
  { value: "single", label: "ด้านเดียว" },
  { value: "double", label: "สองด้าน" },
];

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

  const ready = filesReady(draft);
  const uploading = draft.files.some((f) => f.upload === "uploading");

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
      };
      picked.set(item.key, file);
      accepted.push(item);
    }
    if (accepted.length === 0) return;

    // A new file invalidates the shop choice's price, but not the shop itself
    updateDraft((d) => ({ ...d, files: [...d.files, ...accepted] }));

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
      })),
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
            ถัดไป: เลือกร้าน
          </Button>
          {reason && <p className="text-center text-sm text-ink-muted">{reason}</p>}
        </div>
      }
      bottomNav={<LiffBottomNav />}
    >
      <div className="flex flex-col gap-4">
        <Card>
          <h2 className="text-lg font-semibold text-brand">1. เลือกไฟล์</h2>
          <p className="mt-1 text-sm text-ink-muted">
            PDF, JPG, PNG · ไฟล์ละไม่เกิน 20 MB · สูงสุด {FILE_RULES.maxFiles} ไฟล์
          </p>
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
          <Button
            variant="secondary"
            fullWidth
            className="mt-3"
            disabled={draft.files.length >= FILE_RULES.maxFiles}
            onClick={() => inputRef.current?.click()}
          >
            + เลือกไฟล์
          </Button>
          <p className="mt-3 rounded-control bg-info-50 p-3 text-sm text-info-ink">
            ร้านที่คุณเลือกจะเปิดและดาวน์โหลดไฟล์เพื่อปริ้นได้ ไฟล์บนระบบเราจะถูกลบภายใน 7
            วันหลังจบออเดอร์ แต่สำเนาที่ร้านดาวน์โหลดไปอยู่ในความดูแลของร้าน
            หากเป็นเอกสารลับไม่ควรส่งผ่านบริการนี้
          </p>
        </Card>

        {draft.files.length > 0 && (
          <section aria-label="ตั้งค่าแต่ละไฟล์" className="flex flex-col gap-3">
            <h2 className="px-1 text-lg font-semibold text-brand">2. ตั้งค่าการปริ้น</h2>
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

        <Card>
          <h2 className="text-lg font-semibold text-brand">3. หมายเหตุถึงร้าน</h2>
          <Textarea
            label="หมายเหตุ (ไม่บังคับ)"
            className="mt-2"
            rows={3}
            maxLength={500}
            value={draft.note}
            placeholder="เช่น ปริ้นเฉพาะหน้า 1-5, เย็บมุมซ้าย"
            onChange={(e) => updateDraft((d) => ({ ...d, note: e.target.value }))}
          />
        </Card>
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
  const copiesInvalid = !Number.isInteger(f.copies) || f.copies < 1 || f.copies > 99;
  const pagesInvalid =
    !f.counting && (f.pageCount === null || f.pageCount < 1 || f.pageCount > 10000);

  return (
    <Card as="article" aria-label={`ไฟล์ที่ ${index + 1}: ${f.name}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="text-2xl">
          {f.mime === "application/pdf" ? "📄" : "🖼️"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{f.name}</p>
          <p className="text-sm text-ink-muted">{formatBytes(f.sizeBytes)}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onRemove} aria-label={`ลบไฟล์ ${f.name}`}>
          ลบ
        </Button>
      </div>

      <UploadBar file={f} onRetry={onRetry} />

      {f.pageWarning && f.pageWarning !== "unknown" && (
        <p className="mt-2 rounded-control bg-warning-50 p-2 text-sm text-warning-ink" role="note">
          ⚠️ {WARNING_TEXT}
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        {f.counting ? (
          <p className="col-span-2 text-sm text-ink-muted">กำลังนับจำนวนหน้า…</p>
        ) : f.pageWarning === null && f.mime === "application/pdf" ? (
          <p className="col-span-2 text-sm">
            <span className="font-semibold">{f.pageCount} หน้า</span>
            <span className="text-ink-muted"> (นับอัตโนมัติ)</span>
          </p>
        ) : f.mime !== "application/pdf" ? (
          <p className="col-span-2 text-sm">
            <span className="font-semibold">1 หน้า</span>
            <span className="text-ink-muted"> (รูปภาพ)</span>
          </p>
        ) : (
          <Input
            className="col-span-2"
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
              set({ pageCount: e.target.value === "" ? null : Math.trunc(Number(e.target.value)) })
            }
          />
        )}
        <Select
          label="สี"
          options={COLOR_OPTIONS}
          value={f.color}
          onChange={(e) => set({ color: e.target.value as ColorMode })}
        />
        <Select
          label="ขนาดกระดาษ"
          options={PAPER_OPTIONS}
          value={f.paper}
          onChange={(e) => set({ paper: e.target.value as Paper })}
        />
        <Select
          label="หน้า/หลัง"
          options={SIDES_OPTIONS}
          value={f.sides}
          onChange={(e) => set({ sides: e.target.value as Sides })}
        />
        <Input
          label="จำนวนชุด"
          type="number"
          inputMode="numeric"
          min={1}
          max={99}
          value={Number.isNaN(f.copies) ? "" : f.copies}
          error={copiesInvalid ? "1–99 ชุด" : undefined}
          onChange={(e) =>
            set({ copies: e.target.value === "" ? NaN : Math.trunc(Number(e.target.value)) })
          }
        />
      </div>
      {many && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={onApplyAll}>
          ใช้ค่านี้กับทุกไฟล์
        </Button>
      )}
    </Card>
  );
}

function UploadBar({ file: f, onRetry }: { file: DraftFile; onRetry: () => void }) {
  if (f.upload === "done") {
    return <p className="mt-2 text-sm text-success-ink">✓ อัปโหลดแล้ว</p>;
  }
  if (f.upload === "failed") {
    return (
      <div className="mt-2 flex items-center justify-between gap-2 rounded-control bg-danger-50 p-2">
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
        className="h-2 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-label={`อัปโหลด ${f.name}`}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cx("h-full bg-accent-ink transition-[width]")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        {f.upload === "waiting" ? "รออัปโหลด…" : `กำลังอัปโหลด ${pct}%`}
      </p>
    </div>
  );
}
