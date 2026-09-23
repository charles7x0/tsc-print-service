import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { PanelProps, TemplateData } from '../lib/types';
import { downloadText, makePrnFilename } from '../lib/download';
import { substitutePlaceholders } from '../tspl/placeholders';
import { formatPrintError } from '../lib/errors';
import { useTemplates } from '../hooks/useTemplates';
import { Card } from './Card';

/**
 * The operator flow: choose an existing template, fill in its variables, see a
 * live preview, and print. This is the 90% daily case, so it stays intentionally
 * calm — no TSPL editor, no geometry dot-coordinates. Authoring lives elsewhere.
 */
export function PrintPanel({ settings, active, onStatus, onPreview }: PanelProps): JSX.Element {
  const { templates, loading, error } = useTemplates();
  const [selected, setSelected] = useState<string>('');
  const [values, setValues] = useState<TemplateData>({});
  const [busy, setBusy] = useState<boolean>(false);

  const dryRun = settings.printer.dryRun;

  const current = useMemo(
    () => templates.find((t) => t.name === selected),
    [templates, selected],
  );

  // Surface a load error from the shared hook.
  useEffect(() => {
    if (error) onStatus(error, 'err');
  }, [error, onStatus]);

  // Default the selection to the first template once the list loads (or when the
  // current selection disappears after a delete elsewhere).
  useEffect(() => {
    if (templates.length === 0) {
      setSelected('');
      return;
    }
    if (!templates.some((t) => t.name === selected)) {
      setSelected(templates[0].name);
    }
  }, [templates, selected]);

  // Seed the form values from each variable's sample when the selection changes.
  useEffect(() => {
    if (!current) {
      setValues({});
      return;
    }
    const seeded: TemplateData = {};
    for (const v of current.variables) {
      seeded[v.name] = v.sample ?? '';
    }
    setValues(seeded);
  }, [current]);

  // Local preview substitution pushed to the shared right-rail visualizer;
  // uses the same escaping as the server so it matches what will print. Only the
  // active view drives the shared preview.
  useEffect(() => {
    if (!active) return;
    if (!current) {
      onPreview('', settings.label.dpmm);
      return;
    }
    onPreview(substitutePlaceholders(current.source, values), current.geometry.dpmm);
  }, [active, current, values, onPreview, settings.label.dpmm]);

  const setValue = useCallback((name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const missingRequired = useMemo(() => {
    if (!current) return [];
    return current.variables
      .filter((v) => v.required)
      .filter((v) => String(values[v.name] ?? '').trim() === '')
      .map((v) => v.name);
  }, [current, values]);

  async function handlePrint() {
    if (!current) return;
    if (!dryRun) {
      const ok = window.confirm(
        `Print "${current.name}" to ${settings.printer.ip}:${settings.printer.port}?`,
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await api.printTemplate(current.name, values);
      if (res.result.mode === 'dry-run') {
        downloadText(makePrnFilename(current.name), res.tspl);
        onStatus('Dry run — TSPL downloaded.', 'ok');
      } else {
        onStatus('Sent to printer.', 'ok');
      }
    } catch (err) {
      onStatus(formatPrintError(err), 'err');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Card title="Print">
        <p className="muted">Loading templates…</p>
      </Card>
    );
  }

  if (templates.length === 0) {
    return (
      <Card title="Print" description="Pick a template, fill it in, and print.">
        <p className="muted empty-state">
          No templates yet. Create one in the Templates view first.
        </p>
      </Card>
    );
  }

  return (
    <Card
      title="Print"
      description="Pick a template, fill in the fields, and print. The preview updates as you type."
    >
      <label>
        Template
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={busy}
        >
          {templates.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      {current?.description ? (
        <p className="muted">{current.description}</p>
      ) : null}

      {current && current.variables.length > 0 ? (
        <div className="grid">
          {current.variables.map((v) => (
            <label key={v.name}>
              {v.name}
              {v.required ? ' *' : ''}
              <input
                type="text"
                value={String(values[v.name] ?? '')}
                placeholder={v.sample !== undefined ? String(v.sample) : ''}
                onChange={(e) => setValue(v.name, e.target.value)}
              />
            </label>
          ))}
        </div>
      ) : (
        <p className="muted">This template has no variables.</p>
      )}

      <div className="button-row">
        <button
          type="button"
          className="primary"
          onClick={handlePrint}
          disabled={busy || !current || missingRequired.length > 0}
        >
          {busy
            ? dryRun
              ? 'Downloading…'
              : 'Printing…'
            : dryRun
              ? 'Download .prn'
              : 'Print'}
        </button>
        {missingRequired.length > 0 ? (
          <span className="muted" role="status" aria-live="polite">
            Fill required: {missingRequired.join(', ')}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
