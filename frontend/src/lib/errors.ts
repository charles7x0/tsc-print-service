import { ApiError } from './api';

/** Extract a human-readable message from any thrown value. */
export function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : String(err);
}

/**
 * Format a print failure for the operator. When the server reports a
 * PrinterError (the printer could not be reached), append a concrete hint —
 * branching on the structured error CODE rather than string-sniffing the
 * message. Used by every print path so the UX is identical.
 */
export function formatPrintError(err: unknown): string {
  const message = errorMessage(err);
  const isPrinterError = err instanceof ApiError && err.code === 'PrinterError';
  const hint = isPrinterError
    ? ' — printer unreachable. Check the IP/port in Settings, or enable Dry run to download the .prn.'
    : '';
  return 'Print failed: ' + message + hint;
}
