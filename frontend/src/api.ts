import type {
  CreateTemplateBody,
  PrintLabelBody,
  PrintResponse,
  ProbeResult,
  Settings,
  StringTemplate,
  TemplateData,
  TemplatePreviewResponse,
  UpdateTemplateBody,
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

  // ---- DB-stored TSPL templates ------------------------------------------

  listTemplates(): Promise<StringTemplate[]> {
    return request<StringTemplate[]>('/api/db-templates');
  },

  getTemplate(name: string): Promise<StringTemplate> {
    return request<StringTemplate>(`/api/db-templates/${encodeURIComponent(name)}`);
  },

  createTemplate(body: CreateTemplateBody): Promise<StringTemplate> {
    return request<StringTemplate>('/api/db-templates', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  updateTemplate(name: string, body: UpdateTemplateBody): Promise<StringTemplate> {
    return request<StringTemplate>(`/api/db-templates/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  deleteTemplate(name: string): Promise<{ ok: true }> {
    return request(`/api/db-templates/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
  },

  previewTemplate(name: string, data: TemplateData): Promise<TemplatePreviewResponse> {
    return request<TemplatePreviewResponse>(
      `/api/db-templates/${encodeURIComponent(name)}/preview`,
      {
        method: 'POST',
        body: JSON.stringify({ data }),
      },
    );
  },

  printTemplate(
    name: string,
    data: TemplateData,
    copies = 1,
  ): Promise<PrintResponse & { template: string }> {
    return request(`/api/db-templates/${encodeURIComponent(name)}/print`, {
      method: 'POST',
      body: JSON.stringify({ data, copies }),
    });
  },
};
