import { describe, expect, it } from 'vitest';
import { DryRunTransport } from '../src/printer/transport.js';

describe('DryRunTransport', () => {
  it('returns dry-run mode with the byte count and does not write a file', async () => {
    const transport = new DryRunTransport();
    const tspl = 'SIZE 45 mm,75 mm\r\nPRINT 1,1\r\n';

    const result = await transport.send(tspl);

    expect(result.mode).toBe('dry-run');
    expect(result.bytesSent).toBe(Buffer.byteLength(tspl));
    // No file is produced in dry-run mode any more; the TSPL is returned to the
    // caller (HTTP response) so the client can download it.
    expect(result).not.toHaveProperty('file');
  });

  it('counts UTF-8 bytes, not characters', async () => {
    const transport = new DryRunTransport();
    const tspl = 'TEXT 0,0,"0",0,1,1,"café"\r\n';
    const result = await transport.send(tspl);
    expect(result.bytesSent).toBe(Buffer.byteLength(tspl, 'utf8'));
  });
});
