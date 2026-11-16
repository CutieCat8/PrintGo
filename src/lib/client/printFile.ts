/**
 * Opens the browser's print dialog for a file behind a (signed) URL.
 * The file is fetched into memory and shown in a hidden same-origin iframe, because a page may only
 * call print() on a frame it can reach, and a cross-origin file tab cannot be scripted.
 * Returns false when it could not start printing (blocked download, no CORS, unsupported viewer):
 * the caller should then tell the user to open the file and press Ctrl+P.
 * Which printer, paper and page range is chosen in the browser's own print dialog.
 */
export async function printFromUrl(url: string): Promise<boolean> {
  let blobUrl: string;
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    blobUrl = URL.createObjectURL(await res.blob());
  } catch {
    return false;
  }

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  const cleanup = () => {
    frame.remove();
    URL.revokeObjectURL(blobUrl);
  };
  try {
    await new Promise<void>((resolve, reject) => {
      frame.onload = () => resolve();
      frame.onerror = () => reject(new Error("frame"));
      frame.src = blobUrl;
      document.body.appendChild(frame);
    });
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  } catch {
    cleanup();
    return false;
  }
  // keep the file alive while the dialog is open
  setTimeout(cleanup, 120_000);
  return true;
}
