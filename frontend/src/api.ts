import type {
  PrintLabelBody,
  PrintResponse,
  ProbeResult,
  Settings,
} from './types';

/** Error carrying the server's structured message when a request fails. */
export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      (data.message as string) || (data.error as string) || `HTTP ${res.status}`;
    throw new ApiError(message);
  }
  return data as T;
}

export const api = {
  getSettings(): Promise<Settings> {
    return request<Settings>('/api/settings');
  },

  updateSettings(update: {
    printer?: Partial<Settings['printer']>;
    label?: Partial<Settings['label']>;
  }): Promise<{ ok: true; settings: Settings }> {
    return request('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(update),
    });
  },

  testConnection(target: {
    ip?: string;
    port?: number;
    timeoutMs?: number;
  }): Promise<ProbeResult> {
    return request<ProbeResult>('/api/test-connection', {
      method: 'POST',
      body: JSON.stringify(target),
    });
  },

  printTest(landscape: boolean): Promise<PrintResponse> {
    return request<PrintResponse>('/api/print/test', {
      method: 'POST',
      body: JSON.stringify({ landscape }),
    });
  },

  printLabel(body: PrintLabelBody): Promise<PrintResponse> {
    return request<PrintResponse>('/api/print/label', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  printRaw(commands: string[]): Promise<PrintResponse> {
    return request<PrintResponse>('/api/print/raw', {
      method: 'POST',
      body: JSON.stringify({ commands }),
    });
  },
};
