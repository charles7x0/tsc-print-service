import { describe, expect, it, afterEach } from 'vitest';
import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DryRunTransport } from '../src/printer/transport.js';

const OUT = resolve('./output/test-transport.prn');

describe('DryRunTransport', () => {
  afterEach(async () => {
    await rm(OUT, { force: true });
  });

  it('writes TSPL to the target file and reports bytes', async () => {
    const transport = new DryRunTransport(OUT);
    const tspl = 'SIZE 45 mm,75 mm\r\nPRINT 1,1\r\n';

    const result = await transport.send(tspl);

    expect(result.mode).toBe('dry-run');
    expect(result.bytesSent).toBe(Buffer.byteLength(tspl));
    expect(result.file).toBe(OUT);

    const written = await readFile(OUT, 'utf8');
    expect(written).toBe(tspl);
  });

  it('creates the output directory if missing', async () => {
    const nested = resolve('./output/nested/deep/label.prn');
    const transport = new DryRunTransport(nested);
    const result = await transport.send('CLS\r\n');
    expect(result.file).toBe(nested);
    await rm(resolve('./output/nested'), { recursive: true, force: true });
  });
});
