import { USE_MOCK } from "./api";
import { ApiClientError } from "./http";

/** Client-side checks for the order form (the API checks again; DECISIONS O6 default). */
export const FILE_RULES = {
  maxFiles: 10,
  maxBytes: 20 * 1024 * 1024,
  mimes: ["application/pdf", "image/jpeg", "image/png"] as const,
};

export type AllowedMime = (typeof FILE_RULES.mimes)[number];

/** Thai reason a file cannot be used, or null if it is fine. */
export function fileProblem(file: File): string | null {
  if (!(FILE_RULES.mimes as readonly string[]).includes(file.type)) {
    return "รองรับเฉพาะไฟล์ PDF, JPG และ PNG";
  }
  if (file.size === 0) return "ไฟล์ว่างเปล่า";
  if (file.size > FILE_RULES.maxBytes) return "ไฟล์ใหญ่เกิน 20 MB";
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type PageCountResult =
  { ok: true; pages: number } | { ok: false; reason: "password" | "broken" | "unknown" };

/**
 * Pages in a file, counted in the browser. Images are 1 page. pdf.js (and its worker) is loaded
 * only when the first PDF is picked.
 */
export async function countPages(file: File): Promise<PageCountResult> {
  if (file.type !== "application/pdf") return { ok: true, pages: 1 };
  try {
    const pdfjs = await import("pdfjs-dist");
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
    }
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    try {
      const doc = await task.promise;
      const pages = doc.numPages;
      await task.destroy();
      return pages > 0 ? { ok: true, pages } : { ok: false, reason: "unknown" };
    } catch (e) {
      await task.destroy().catch(() => {});
      if (e instanceof pdfjs.PasswordException) return { ok: false, reason: "password" };
      if (e instanceof pdfjs.InvalidPDFException) return { ok: false, reason: "broken" };
      return { ok: false, reason: "unknown" };
    }
  } catch (e) {
    console.error("pdf.js failed to load", e);
    return { ok: false, reason: "unknown" };
  }
}

/**
 * Uploads one file straight to Supabase Storage with the signed URL from POST /uploads/sign
 * (the file never goes through our API). XHR instead of fetch because fetch has no upload progress.
 * In mock mode nothing is sent; progress is simulated.
 */
export function uploadToSignedUrl(
  uploadUrl: string,
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (USE_MOCK) return fakeUpload(onProgress, signal);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("content-type", file.type);
    xhr.setRequestHeader("x-upsert", "false");
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (anon) xhr.setRequestHeader("apikey", anon);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(new ApiClientError("UNKNOWN", xhr.status, "อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่"));
      }
    };
    xhr.onerror = () => reject(new ApiClientError("NETWORK", 0));
    xhr.onabort = () => reject(new DOMException("aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

function fakeUpload(onProgress: (f: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = 0;
    const timer = setInterval(() => {
      done = Math.min(1, done + 0.25);
      onProgress(done);
      if (done >= 1) {
        clearInterval(timer);
        resolve();
      }
    }, 150);
    signal?.addEventListener(
      "abort",
      () => {
        clearInterval(timer);
        reject(new DOMException("aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
