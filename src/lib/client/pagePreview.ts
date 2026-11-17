import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { loadPdfjs } from "./pdfjs";

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
  try {
    const page = await (await openPdf(key, file)).getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, viewport }).promise;
    page.cleanup();
    return null;
  } catch (e) {
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
