import { Socket } from 'node:net';

export interface PrinterTarget {
  ip: string;
  port: number;
  timeoutMs: number;
}

export interface SendResult {
  mode: 'network' | 'dry-run';
  /**
   * Number of payload bytes handed to the OS socket buffer. This is what was
   * queued for delivery over TCP — NOT an acknowledgement that the printer
   * received or committed the job (TCP cannot provide that at this layer).
   */
  bytesSent: number;
  /** Present in network mode. */
  target?: { ip: string; port: number };
}

/**
 * Abstraction over "how a TSPL program reaches the printer". Implementations
 * either open a TCP socket to the printer or return the program without
 * sending (dry-run), which makes the whole stack testable without hardware.
 */
export interface PrinterTransport {
  send(tspl: string): Promise<SendResult>;
}

/** Coarse classification of a connection failure, for UI-friendly messages. */
export type FailureReason = 'timeout' | 'refused' | 'error';

/**
 * Raised when a label cannot be delivered to the printer (connection refused,
 * timeout, socket error, or the connection dropping before the job is flushed).
 * Distinct from programming/validation errors so the HTTP layer can map only
 * genuine printer failures to 502.
 */
export class PrinterError extends Error {
  constructor(
    message: string,
    public readonly target?: { ip: string; port: number },
    public readonly reason: FailureReason = 'error',
  ) {
    super(message);
    this.name = 'PrinterError';
  }
}

export interface ProbeResult {
  reachable: boolean;
  target: { ip: string; port: number };
  /** Round-trip time to establish the TCP connection, in ms (when reachable). */
  latencyMs?: number;
  /** Failure reason (when not reachable). */
  error?: string;
  /** Coarse failure classification (when not reachable). */
  reason?: FailureReason;
}

/** Classify a socket error into a coarse, UI-friendly reason. */
function classifyError(err: NodeJS.ErrnoException): FailureReason {
  if (err.code === 'ECONNREFUSED') return 'refused';
  if (err.code === 'ETIMEDOUT') return 'timeout';
  return 'error';
}

/**
 * Open a TCP connection to the target, resolving with a connected socket or
 * rejecting with a PrinterError. Centralises the timeout/error/connect wiring
 * and the single-settle guard shared by probing and sending.
 *
 * The returned socket still has its connect-timeout armed; callers should clear
 * or re-arm `setTimeout` as needed and are responsible for closing it.
 */
function connectSocket(target: PrinterTarget): Promise<Socket> {
  const { ip, port, timeoutMs } = target;

  return new Promise<Socket>((resolvePromise, reject) => {
    const socket = new Socket();
    let settled = false;

    const fail = (message: string, reason: FailureReason): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new PrinterError(message, { ip, port }, reason));
    };

    socket.setTimeout(timeoutMs);
    socket.once('timeout', () =>
      fail(`Timeout after ${timeoutMs}ms connecting to ${ip}:${port}`, 'timeout'),
    );
    socket.once('error', (err: NodeJS.ErrnoException) => fail(err.message, classifyError(err)));
    socket.connect(port, ip, () => {
      if (settled) return;
      settled = true;
      resolvePromise(socket);
    });
  });
}

/**
 * Test whether a TSC printer is reachable by opening a TCP connection and
 * immediately closing it — no data is sent, so it is safe to run any time.
 * Never rejects; it always resolves with a ProbeResult describing the outcome.
 */
export async function probeConnection(target: PrinterTarget): Promise<ProbeResult> {
  const { ip, port } = target;
  const startedAt = Date.now();

  try {
    const socket = await connectSocket(target);
    const latencyMs = Date.now() - startedAt;
    socket.destroy();
    return { reachable: true, target: { ip, port }, latencyMs };
  } catch (err) {
    if (err instanceof PrinterError) {
      return { reachable: false, target: { ip, port }, error: err.message, reason: err.reason };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { reachable: false, target: { ip, port }, error: message, reason: 'error' };
  }
}

/**
 * Sends TSPL to a network TSC printer over a raw TCP socket (port 9100).
 * No native dependencies, so it runs on Linux, Windows and ARM alike.
 *
 * A failed send throws PrinterError and does NOT retry — retrying a print is
 * unsafe without idempotency (it can produce duplicate labels). The caller
 * (HTTP layer → 502) decides what to do.
 */
export class NetworkTransport implements PrinterTransport {
  /**
   * Milliseconds to keep the socket open AFTER the write is flushed, before
   * closing. TSC printers process the job as it is received; closing the
   * connection too quickly can tear it down before the printer has committed
   * the buffer, which manifests as "bytes sent but nothing prints". The TSC
   * reference SDK does the same (openport delay + closeport linger).
   */
  private readonly lingerMs: number;

  constructor(
    private readonly target: PrinterTarget,
    lingerMs = 500,
  ) {
    this.lingerMs = lingerMs;
  }

  async send(tspl: string): Promise<SendResult> {
    const payload = Buffer.from(tspl, 'utf8');
    const { ip, port } = this.target;
    const lingerMs = this.lingerMs;

    const socket = await connectSocket(this.target);

    return new Promise<SendResult>((resolvePromise, reject) => {
      let settled = false;
      // Set once the write is flushed and we deliberately close the socket.
      let finished = false;
      let lingerTimer: NodeJS.Timeout | undefined;

      const fail = (message: string, reason: FailureReason): void => {
        if (settled) return;
        settled = true;
        if (lingerTimer) clearTimeout(lingerTimer);
        socket.destroy();
        reject(new PrinterError(message, { ip, port }, reason));
      };

      const succeed = (): void => {
        if (settled) return;
        settled = true;
        resolvePromise({ mode: 'network', bytesSent: payload.length, target: { ip, port } });
      };

      // Nagle off: send the job immediately in one go.
      socket.setNoDelay(true);
      socket.once('timeout', () =>
        fail(`Timeout after ${this.target.timeoutMs}ms writing to ${ip}:${port}`, 'timeout'),
      );
      socket.once('error', (err: NodeJS.ErrnoException) => fail(err.message, classifyError(err)));

      // Only a close AFTER we deliberately finished counts as success. An
      // unexpected close before the job is flushed is a delivery failure.
      socket.once('close', () => {
        if (lingerTimer) clearTimeout(lingerTimer);
        if (finished) {
          succeed();
        } else {
          fail(`Connection to ${ip}:${port} closed before the job was delivered`, 'error');
        }
      });

      socket.write(payload, (writeErr) => {
        if (writeErr) {
          fail(writeErr.message, classifyError(writeErr as NodeJS.ErrnoException));
          return;
        }
        // Hold the connection open briefly so the printer can consume and
        // commit the full job, then close gracefully. Mark finished BEFORE
        // ending so the 'close' handler resolves as success.
        lingerTimer = setTimeout(() => {
          finished = true;
          socket.end();
          succeed();
        }, lingerMs);
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
