/**
 * pdf.js, loaded on demand. The legacy build is used because the modern one needs very recent
 * browser features (Float16Array, Promise.try, ...) that older iPhone/LINE webviews lack: it could
 * count pages there but failed to draw them.
 */
export async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }
  return pdfjs;
}
