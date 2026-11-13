"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button, Icon, Input, PageShell, Steps, cx, useToast } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import { updateDraft, updateFile, useDraft, type DraftFile } from "@/lib/client/draft";
import {
  FILE_RULES,
  countPages,
  fileProblem,
  formatBytes,
  uploadToSignedUrl,
} from "@/lib/client/files";
import { FlowFooter, filesUploaded } from "../_components/OrderFlow";
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

/** C2 · step 1: pick and upload files (PDF/JPG/PNG, ≤ 20 MB, ≤ 10 files). */
export default function UploadPage() {
  const router = useRouter();
  const toast = useToast();
  const { draft, hydrated } = useDraft();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const ready = filesUploaded(draft);
  const full = draft.files.length >= FILE_RULES.maxFiles;
  const totalPages = draft.files.reduce((n, f) => n + (f.pageCount ?? 0), 0);

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const room = FILE_RULES.maxFiles - draft.files.length;
    const files = Array.from(list);
    if (files.length > room) toast(`เลือกได้สูงสุด ${FILE_RULES.maxFiles} ไฟล์ต่อออเดอร์`, "error");
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

    // Services were picked for the old file list: pick again after choosing a shop
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

  const busy = draft.files.some((f) => f.upload !== "done" || f.counting);
  const reason = !hydrated
    ? null
    : draft.files.length === 0
      ? "เลือกไฟล์อย่างน้อย 1 ไฟล์"
      : draft.files.some((f) => f.upload === "failed")
        ? "มีไฟล์ที่อัปโหลดไม่สำเร็จ กดลองใหม่หรือลบออก"
        : busy
          ? "กำลังอัปโหลดและนับหน้า…"
          : !ready
            ? "กรอกจำนวนหน้าให้ครบ"
            : null;

  return (
    <PageShell
      title="สั่งปริ้นใหม่"
      backHref="/liff"
      footer={
        <FlowFooter
          summary={
            draft.files.length > 0 ? `รวม ${draft.files.length} ไฟล์ · ${totalPages} หน้า` : reason
          }
        >
          <Button
            fullWidth
            size="lg"
            arrow
            disabled={!ready}
            onClick={() => router.push("/liff/new/settings")}
          >
            ต่อไป: ตั้งค่าการพิมพ์
          </Button>
          {reason && draft.files.length > 0 && (
            <p className="text-center text-xs text-ink-muted">{reason}</p>
          )}
        </FlowFooter>
      }
    >
      <Steps steps={ORDER_STEPS} current={0} className="mb-5" />

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

      <button
        type="button"
        disabled={full}
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
          "group flex w-full flex-col items-center gap-2 rounded-card border-2 border-dashed bg-surface text-center transition disabled:opacity-50",
          draft.files.length === 0 ? "px-6 py-10" : "px-4 py-5",
          dragging
            ? "border-accent-ink bg-accent-50"
            : "border-line-strong hover:border-accent-ink hover:bg-accent-50/40",
        )}
      >
        <span className="flex items-center gap-2 font-display text-lg font-bold text-ink italic">
          <span className="flex size-9 items-center justify-center rounded-full bg-zoom text-white shadow-glow transition-transform group-hover:scale-110">
            <Icon name="plus" className="size-5" strokeWidth={2.5} />
          </span>
          แตะเพื่อเลือกไฟล์ / ถ่ายภาพ
        </span>
        <span className="text-sm text-ink-muted">
          PDF, JPG, PNG · ไม่เกิน 20 MB · สูงสุด {FILE_RULES.maxFiles} ไฟล์
        </span>
      </button>

      {draft.files.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3" aria-label="ไฟล์ที่เลือก">
          {draft.files.map((f) => (
            <FileRow
              key={f.key}
              file={f}
              onRemove={() => removeFile(f.key)}
              onRetry={() => retry(f)}
            />
          ))}
        </ul>
      )}

      <p className="mt-4 flex gap-2 rounded-card bg-surface px-4 py-3 text-sm text-ink-muted ring-1 ring-line">
        <Icon name="lock" className="mt-0.5 size-4 shrink-0 text-ink" />
        <span>
          ร้านปริ้นสามารถเปิดและดาวน์โหลดไฟล์ของคุณได้{" "}
          <b className="text-ink">ไม่ควรส่งเอกสารลับ</b> ระบบลบไฟล์ของเราหลังออเดอร์จบ 7 วัน
          (สำเนาที่ร้านดาวน์โหลดไปอยู่ในความดูแลของร้าน)
        </span>
      </p>
    </PageShell>
  );
}

function FileRow({
  file: f,
  onRemove,
  onRetry,
}: {
  file: DraftFile;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const isPdf = f.mime === "application/pdf";
  const needPages = !f.counting && f.pageWarning !== null && isPdf;
  const pct = Math.round(f.progress * 100);

  return (
    <li className="animate-rise rounded-card bg-surface p-3.5 ring-1 ring-line">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cx(
            "flex h-14 w-11 shrink-0 flex-col items-center justify-center rounded-lg text-[0.6rem] font-bold tracking-wide",
            isPdf ? "bg-danger-50 text-danger" : "bg-info-50 text-info-ink",
          )}
        >
          <Icon name={isPdf ? "file" : "image"} className="mb-0.5 size-5" />
          {isPdf ? "PDF" : "IMG"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{f.name}</p>
          <p className="text-sm text-ink-muted">
            {f.counting
              ? "กำลังนับหน้า…"
              : f.pageCount
                ? `${f.pageCount} หน้า`
                : "ไม่ทราบจำนวนหน้า"}{" "}
            · {formatBytes(f.sizeBytes)}
          </p>
          {f.upload === "done" ? (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-success-ink">
              <Icon name="check" className="size-3.5" strokeWidth={2.5} />
              อัปโหลดแล้ว
            </p>
          ) : f.upload === "failed" ? (
            <p className="mt-0.5 flex items-center gap-2 text-xs text-danger" role="alert">
              อัปโหลดไม่สำเร็จ
              <button type="button" onClick={onRetry} className="font-semibold underline">
                ลองใหม่
              </button>
            </p>
          ) : (
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line"
              role="progressbar"
              aria-label={`อัปโหลด ${f.name}`}
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full bg-zoom transition-[width]" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`ลบไฟล์ ${f.name}`}
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-canvas hover:text-danger"
        >
          <Icon name="x" className="size-5" />
        </button>
      </div>
      {needPages && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-2 flex gap-1.5 text-sm text-warning-ink" role="note">
            <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
            {WARNING_TEXT}
          </p>
          <Input
            label="จำนวนหน้า"
            type="number"
            inputMode="numeric"
            min={1}
            max={10000}
            required
            value={f.pageCount ?? ""}
            hint="นับหน้าอัตโนมัติไม่ได้ กรอกเองได้ ร้านจะตรวจอีกครั้ง"
            onChange={(e) =>
              updateFile(f.key, {
                pageCount: e.target.value === "" ? null : Math.trunc(Number(e.target.value)),
              })
            }
          />
        </div>
      )}
    </li>
  );
}
