import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import type {
  Settings,
  StringTemplate,
  TemplateData,
  TemplateVariable,
} from '../types';
import { downloadText, makePrnFilename } from '../download';
import { Card } from './Card';

interface Props {
  settings: Settings;
  onOutput: (data: unknown) => void;
  onStatus: (text: string, kind: 'ok' | 'err' | '') => void;
  /** Push a TSPL preview to the shared right-rail visualizer. */
  onPreview: (source: string, dpmm: number) => void;
}

/** A blank template used when creating a new one. */
function emptyTemplate(): StringTemplate {
  return {
    name: '',
    description: '',
    source: 'SIZE 45 mm,75 mm\nGAP 3 mm,0 mm\nDIRECTION 0,0\nCLS\nCODEPAGE UTF-8\nTEXT 20,20,"3",0,1,1,"{{title}}"\nPRINT 1,1',
    variables: [{ name: 'title', required: true, sample: 'Hello' }],
    geometry: { widthMm: 45, heightMm: 75, dpmm: 8 },
    updatedAt: '',
  };
}

/** Build a data object from the variables' sample values (for preview/print). */
function sampleData(variables: TemplateVariable[]): TemplateData {
  const data: TemplateData = {};
  for (const v of variables) {
    data[v.name] = v.sample ?? `{${v.name}}`;
  }
  return data;
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

/** Distinct `{{placeholder}}` names in the source, in first-seen order. */
function extractPlaceholders(source: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const m of source.matchAll(PLACEHOLDER_RE)) {
    const name = m[1];
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

/** Shallow equality of two variable lists (name + required + sample + order). */
function sameVariables(a: TemplateVariable[], b: TemplateVariable[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => {
    const w = b[i];
    return v.name === w.name && v.required === w.required && v.sample === w.sample;
  });
}

/**
 * Load, edit, preview, save and print DB-stored TSPL templates.
 *
 * The live preview is produced by the server's /preview endpoint (so escaping
 * and substitution match exactly what will print), then rendered by the shared
 * TsplVisualizer. Preview calls are debounced while editing.
 */
export function TemplatesPanel({ settings, onOutput, onStatus, onPreview }: Props) {
  const [templates, setTemplates] = useState<StringTemplate[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [draft, setDraft] = useState<StringTemplate>(emptyTemplate());
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);

  const dryRun = settings.printer.dryRun;

  const refreshList = useCallback(async (): Promise<StringTemplate[]> => {
    const list = await api.listTemplates();
    setTemplates(list);
    return list;
  }, []);

  // Initial load: fetch the list and select the first template.
  useEffect(() => {
    let cancelled = false;
    refreshList()
      .then((list) => {
        if (cancelled || list.length === 0) return;
        setSelected(list[0].name);
        setDraft(list[0]);
        setIsNew(false);
      })
      .catch((err: unknown) => {
        onStatus(err instanceof ApiError ? err.message : String(err), 'err');
      });
    return () => {
      cancelled = true;
    };
  }, [refreshList, onStatus]);

  // Debounced live preview whenever the source/variables/geometry change.
  // Substitutes sample values locally so the shared right-rail preview updates
  // without a server round-trip on every keystroke.
  const previewTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(() => {
      const data = sampleData(draft.variables);
      const local = draft.source.replace(
        /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
        (_m, name: string) => {
          const v = data[name.trim()];
          return v === undefined ? '' : String(v);
        },
      );
      onPreview(local, draft.geometry.dpmm);
    }, 300);
    return () => window.clearTimeout(previewTimer.current);
  }, [draft.source, draft.variables, draft.geometry.dpmm, onPreview]);

  // Auto-sync the Variables table to the {{placeholders}} used in the source.
  // - New placeholders appear as rows automatically (required, no sample yet).
  // - Placeholders removed from the source drop their row.
  // - Existing rows keep their required/sample/description (edits are preserved).
  // - A blank in-progress row (empty name) the user is typing is left alone.
  useEffect(() => {
    const used = extractPlaceholders(draft.source);
    setDraft((d) => {
      const byName = new Map(d.variables.map((v) => [v.name, v]));
      // One row per used placeholder, preserving any existing settings.
      const next: TemplateVariable[] = used.map(
        (name) => byName.get(name) ?? { name, required: true },
      );
      // Skip the update if nothing actually changed (avoids a render loop).
      if (sameVariables(d.variables, next)) return d;
      return { ...d, variables: next };
    });
  }, [draft.source]);

  function selectTemplate(name: string) {
    if (name === '__new__') {
      setSelected('__new__');
      setDraft(emptyTemplate());
      setIsNew(true);
      return;
    }
    const found = templates.find((t) => t.name === name);
    if (found) {
      setSelected(name);
      setDraft(found);
      setIsNew(false);
    }
  }

  // --- Variable table editing ------------------------------------------------

  function updateVariable(index: number, patch: Partial<TemplateVariable>) {
    setDraft((d) => ({
      ...d,
      variables: d.variables.map((v, i) => (i === index ? { ...v, ...patch } : v)),
    }));
  }

  // --- Actions ---------------------------------------------------------------

  async function handleSave() {
    setBusy(true);
    try {
      const body = {
        description: draft.description,
        source: draft.source,
        variables: draft.variables,
        geometry: draft.geometry,
      };
      const saved = isNew
        ? await api.createTemplate({ name: draft.name, ...body })
        : await api.updateTemplate(draft.name, body);
      onOutput(saved);
      onStatus(isNew ? 'Template created.' : 'Template saved.', 'ok');
      const list = await refreshList();
      const still = list.find((t) => t.name === saved.name);
      if (still) {
        setSelected(saved.name);
        setDraft(still);
        setIsNew(false);
      }
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (isNew) return;
    if (!window.confirm(`Delete template "${draft.name}"?`)) return;
    setBusy(true);
    try {
      await api.deleteTemplate(draft.name);
      onStatus('Template deleted.', 'ok');
      const list = await refreshList();
      if (list.length > 0) {
        selectTemplate(list[0].name);
      } else {
        selectTemplate('__new__');
      }
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handlePrint() {
    if (isNew || !draft.name) {
      onStatus('Save the template before printing.', 'err');
      return;
    }
    setBusy(true);
    try {
      // Persist the current draft first so Test print always reflects what is
      // on screen (the server renders the SAVED template by name).
      await api.updateTemplate(draft.name, {
        description: draft.description,
        source: draft.source,
        variables: draft.variables,
        geometry: draft.geometry,
      });

      const data = sampleData(draft.variables);
      const res = await api.printTemplate(draft.name, data);
      onOutput(res);
      if (res.result.mode === 'dry-run') {
        downloadText(makePrnFilename(draft.name || 'template'), res.tspl);
        onStatus('Dry run — TSPL downloaded.', 'ok');
      } else {
        onStatus('Template sent to printer.', 'ok');
      }
    } catch (err) {
      handlePrintError(err);
    } finally {
      setBusy(false);
    }
  }

  function handleError(err: unknown) {
    const message = err instanceof ApiError ? err.message : String(err);
    onOutput('Error: ' + message);
    onStatus(message, 'err');
  }

  /**
   * Print errors are usually a printer-connection failure (the server returns
   * 502 PrinterError with the socket message). Surface that clearly so it is
   * not mistaken for the button "doing nothing".
   */
  function handlePrintError(err: unknown) {
    const message = err instanceof ApiError ? err.message : String(err);
    const looksLikeConnection =
      /timeout|econnrefused|ehostunreach|enetunreach|connect/i.test(message);
    const hint = looksLikeConnection
      ? ' — printer unreachable. Check the IP/port in Settings, or enable Dry run to download the .prn.'
      : '';
    onOutput('Print failed: ' + message + hint);
    onStatus('Print failed: ' + message + hint, 'err');
  }

  const options = useMemo(
    () => [
      ...templates.map((t) => ({ value: t.name, label: t.name })),
      { value: '__new__', label: '+ New template…' },
    ],
    [templates],
  );

  return (
    <Card
      title="Templates"
      description="Edit raw TSPL with {{placeholders}}. Preview updates live; sample values drive the preview and test print."
    >
      <div className="grid">
        <label>
          Template
          <select
            value={selected}
            onChange={(e) => selectTemplate(e.target.value)}
            disabled={busy}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {isNew ? (
          <label>
            Name
            <input
              type="text"
              value={draft.name}
              placeholder="my-label"
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </label>
        ) : null}

        <label>
          Description
          <input
            type="text"
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          />
        </label>
      </div>

      <label htmlFor="template-source" className="sr-only">
        TSPL source
      </label>
      <textarea
        id="template-source"
        rows={12}
        spellCheck={false}
        value={draft.source}
        onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))}
      />

      <h3 className="visualizer-heading">Variables</h3>
      <p className="muted">
        Detected from <code>{'{{placeholders}}'}</code> in the source. Add or
        remove a variable by editing the TSPL above; set whether it is required
        and a sample value used for the preview and test print.
      </p>
      {draft.variables.length === 0 ? (
        <p className="muted empty-state">
          No variables yet — type a <code>{'{{placeholder}}'}</code> in the source.
        </p>
      ) : (
        <table className="variables-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Required</th>
              <th scope="col">Sample</th>
            </tr>
          </thead>
          <tbody>
            {draft.variables.map((v, i) => (
              <tr key={v.name || `row-${i}`}>
                <th scope="row" className="variables-table__name">
                  <code>{v.name}</code>
                </th>
                <td>
                  <input
                    type="checkbox"
                    checked={v.required}
                    aria-label={`${v.name} required`}
                    onChange={(e) => updateVariable(i, { required: e.target.checked })}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={v.sample === undefined ? '' : String(v.sample)}
                    aria-label={`${v.name} sample value`}
                    onChange={(e) => updateVariable(i, { sample: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="button-row">
        <button type="button" className="primary" onClick={handleSave} disabled={busy || !draft.name}>
          {busy ? 'Saving…' : isNew ? 'Create' : 'Save'}
        </button>
        <button type="button" className="secondary" onClick={handlePrint} disabled={busy || isNew}>
          {dryRun ? 'Test (download)' : 'Test print'}
        </button>
        {!isNew ? (
          <button type="button" className="secondary danger" onClick={handleDelete} disabled={busy}>
            Delete
          </button>
        ) : null}
      </div>
    </Card>
  );
}
