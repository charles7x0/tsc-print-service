import { Socket } from 'node:net';

export interface PrinterTarget {
  ip: string;
  port: number;
  timeoutMs: number;
}

export interface SendResult {
  mode: 'network' | 'dry-run';
  bytesSent: number;
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
 * Dry-run transport: does NOT send to a printer and does NOT write to disk.
 * The generated TSPL is returned to the caller (the HTTP response includes it),
 * so the web UI can offer it to the user as a download instead of the server
 * persisting a file. Used when the printer's dryRun setting is enabled.
 */
export class DryRunTransport implements PrinterTransport {
  async send(tspl: string): Promise<SendResult> {
    return {
      mode: 'dry-run',
      bytesSent: Buffer.byteLength(tspl, 'utf8'),
    };
  }
}
