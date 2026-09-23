/**
 * Trigger a browser download of text content as a file.
 * Used in dry-run mode to hand the generated TSPL to the user instead of
 * writing it to a folder on the server.
 */
export function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Release the object URL on the next tick so the download can start.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Build a timestamped .prn filename, e.g. "label-20260911-143022.prn".
 */
export function makePrnFilename(prefix = 'label'): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  const stamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${prefix}-${stamp}.prn`;
}
