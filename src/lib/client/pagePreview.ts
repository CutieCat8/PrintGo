import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import { loadPdfjs } from "./pdfjs";

/** The render in flight on each canvas: pdf.js refuses a second render() on a busy canvas. */
const running = new WeakMap<HTMLCanvasElement, RenderTask>();
/** The newest draw request per canvas; older ones that are still loading give up. */
const latest = new WeakMap<HTMLCanvasElement, object>();

/** Opened PDFs by draft file key, so each tile does not re-parse the whole file. */
const docs = new Map<string, Promise<PDFDocumentProxy>>();

async function openPdf(key: string, file: File): Promise<PDFDocumentProxy> {
  let doc = docs.get(key);
  if (!doc) {
    doc = (async () => {
      const pdfjs = await loadPdfjs();
      return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    })();
    docs.set(key, doc);
    doc.catch(() => docs.delete(key));
  }
  return doc;
}

/** Draws one PDF page (1-based) onto the canvas at the given CSS width. Returns null when drawn, else the reason it failed. */
export async function drawPdfPage(
  key: string,
  file: File,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  cssWidth: number,
): Promise<string | null> {
  const token = {};
  latest.set(canvas, token);
  try {
    const page = await (await openPdf(key, file)).getPage(pageNumber);
    if (latest.get(canvas) !== token) return null;
    const previous = running.get(canvas);
    if (previous) {
      previous.cancel();
      await previous.promise.catch(() => {});
      if (latest.get(canvas) !== token) return null;
    }
    const base = page.getViewport({ scale: 1 });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const task = page.render({ canvas, viewport });
    running.set(canvas, task);
    await task.promise;
    if (running.get(canvas) === task) running.delete(canvas);
    page.cleanup();
    return null;
  } catch (e) {
    // a newer draw on the same canvas cancelled this one: not a failure, the newer one shows
    if (e instanceof Error && e.name === "RenderingCancelledException") return null;
    console.error("page preview failed", e);
    return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }
}

/** Free the parsed PDF when the picker closes. */
export function closePdf(key: string) {
  const doc = docs.get(key);
  docs.delete(key);
  void doc?.then((d) => d.loadingTask.destroy()).catch(() => {});
}
