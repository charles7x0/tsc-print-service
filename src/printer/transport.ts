import { Socket } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export interface PrinterTarget {
  ip: string;
  port: number;
  timeoutMs: number;
}

export interface SendResult {
  mode: 'network' | 'dry-run';
  bytesSent: number;
  /** Present in dry-run mode: the file the TSPL was written to. */
  file?: string;
  /** Present in network mode. */
  target?: { ip: string; port: number };
}

/**
 * Abstraction over "how a TSPL program reaches the printer". Implementations
 * either open a TCP socket to the printer or write the program to a file
 * (dry-run), which makes the whole stack testable without hardware.
 */
export interface PrinterTransport {
  send(tspl: string): Promise<SendResult>;
}

export interface ProbeResult {
  reachable: boolean;
  target: { ip: string; port: number };
  /** Round-trip time to establish the TCP connection, in ms (when reachable). */
  latencyMs?: number;
  /** Failure reason (when not reachable). */
  error?: string;
}

/**
 * Test whether a TSC printer is reachable by opening a TCP connection and
 * immediately closing it — no data is sent, so it is safe to run any time.
 * Never rejects; it always resolves with a ProbeResult describing the outcome.
 */
export function probeConnection(target: PrinterTarget): Promise<ProbeResult> {
  const { ip, port, timeoutMs } = target;
  const startedAt = Date.now();

  return new Promise<ProbeResult>((resolvePromise) => {
    const socket = new Socket();
    let settled = false;

    const done = (result: ProbeResult): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolvePromise(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('timeout', () =>
      done({
        reachable: false,
        target: { ip, port },
        error: `Timeout after ${timeoutMs}ms connecting to ${ip}:${port}`,
      }),
    );
    socket.once('error', (err) =>
      done({ reachable: false, target: { ip, port }, error: err.message }),
    );
    socket.connect(port, ip, () =>
      done({
        reachable: true,
        target: { ip, port },
        latencyMs: Date.now() - startedAt,
      }),
    );
  });
}

/**
 * Sends TSPL to a network TSC printer over a raw TCP socket (port 9100).
 * No native dependencies, so it runs on Linux, Windows and ARM alike.
 */
export class NetworkTransport implements PrinterTransport {
  constructor(private readonly target: PrinterTarget) {}

  send(tspl: string): Promise<SendResult> {
    const payload = Buffer.from(tspl, 'utf8');
    const { ip, port, timeoutMs } = this.target;

    return new Promise<SendResult>((resolvePromise, reject) => {
      const socket = new Socket();
      let settled = false;

      const fail = (err: Error): void => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(err);
      };

      socket.setTimeout(timeoutMs);
      socket.once('timeout', () =>
        fail(new Error(`Timeout after ${timeoutMs}ms connecting to ${ip}:${port}`)),
      );
      socket.once('error', (err) => fail(err));

      socket.connect(port, ip, () => {
        socket.write(payload, (writeErr) => {
          if (writeErr) {
            fail(writeErr);
            return;
          }
          socket.end();
        });
      });

      socket.once('close', () => {
        if (settled) return;
        settled = true;
        resolvePromise({
          mode: 'network',
          bytesSent: payload.length,
          target: { ip, port },
        });
      });
    });
  }
}

/**
 * Writes TSPL to a file instead of sending it to a printer. Used when
 * DRY_RUN=true so the layout can be tested with no hardware.
 */
export class DryRunTransport implements PrinterTransport {
  constructor(private readonly filePath: string) {}

  async send(tspl: string): Promise<SendResult> {
    const abs = resolve(this.filePath);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, tspl, 'utf8');
    return {
      mode: 'dry-run',
      bytesSent: Buffer.byteLength(tspl, 'utf8'),
      file: abs,
    };
  }
}
