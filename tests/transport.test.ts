import { describe, expect, it } from 'vitest';
import { createServer, type AddressInfo, type Server } from 'node:net';
import { DryRunTransport, NetworkTransport } from '../src/printer/transport.js';

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

describe('NetworkTransport', () => {
  /** Start a throwaway TCP server that captures whatever is written to it. */
  function startCaptureServer(): Promise<{ server: Server; port: number; received: () => string }> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      const server = createServer((socket) => {
        socket.on('data', (d) => chunks.push(d));
      });
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as AddressInfo;
        resolve({
          server,
          port,
          received: () => Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
  }

  it('delivers the full TSPL payload to the printer and reports network mode', async () => {
    const { server, port, received } = await startCaptureServer();
    try {
      // Small linger so the test is fast but still exercises the delayed close.
      const transport = new NetworkTransport(
        { ip: '127.0.0.1', port, timeoutMs: 2000 },
        20,
      );
      const tspl = 'SIZE 45 mm,75 mm\r\nPRINT 1,1\r\n';
      const result = await transport.send(tspl);

      expect(result.mode).toBe('network');
      expect(result.bytesSent).toBe(Buffer.byteLength(tspl, 'utf8'));
      expect(result.target).toEqual({ ip: '127.0.0.1', port });
      // The whole job must have arrived before the socket closed.
      expect(received()).toBe(tspl);
    } finally {
      server.close();
    }
  });

  it('rejects when the printer is unreachable', async () => {
    // Port 1 is not listening; connection is refused quickly.
    const transport = new NetworkTransport(
      { ip: '127.0.0.1', port: 1, timeoutMs: 1000 },
      20,
    );
    await expect(transport.send('SIZE 45 mm,75 mm\r\nPRINT 1,1\r\n')).rejects.toThrow();
  });
});
