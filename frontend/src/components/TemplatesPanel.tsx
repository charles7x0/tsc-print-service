import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { PanelProps, StringTemplate, TemplateVariable } from '../lib/types';
import { downloadText, makePrnFilename } from '../lib/download';
import {
  extractPlaceholders,
  sampleData,
  substitutePlaceholders,
} from '../tspl/placeholders';
import { errorMessage, formatPrintError } from '../lib/errors';
import { useTemplates } from '../hooks/useTemplates';
import { Card } from './Card';

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
 * The live right-rail preview substitutes sample values locally using the same
 * escaping as the server, so it matches what will print. Preview updates are
 * debounced while editing. The template list is shared via useTemplates so the
 * Print panel sees create/delete changes immediately.
 */
export function TemplatesPanel({ settings, active, onStatus, onPreview }: PanelProps) {
  const { templates, refresh } = useTemplates();
  const [selected, setSelected] = useState<string>('');
  const [draft, setDraft] = useState<StringTemplate>(emptyTemplate());
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  // Tracks whether the user has made an explicit selection, so the auto-select
  // effect only seeds the initial draft once.
  const seededRef = useRef(false);

  const dryRun = settings.printer.dryRun;

  // Seed the draft with the first template once the list first loads.
  useEffect(() => {
    if (seededRef.current || templates.length === 0) return;
    seededRef.current = true;
    setSelected(templates[0].name);
    setDraft(templates[0]);
    setIsNew(false);
  }, [templates]);

  // Debounced live preview whenever the source/variables/geometry change.
  const previewTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!active) return;
    window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(() => {
      const local = substitutePlaceholders(draft.source, sampleData(draft.variables));
      onPreview(local, draft.geometry.dpmm);
    }, 300);
    return () => window.clearTimeout(previewTimer.current);
  }, [active, draft.source, draft.variables, draft.geometry.dpmm, onPreview]);

  // Auto-sync the Variables table to the {{placeholders}} used in the source.
  // - New placeholders appear as rows automatically (required, no sample yet).
  // - Placeholders removed from the source drop their row.
  // - Existing rows keep their required/sample/description (edits are preserved).
  useEffect(() => {
    const used = extractPlaceholders(draft.source);
    setDraft((d) => {
      const byName = new Map(d.variables.map((v) => [v.name, v]));
      const next: TemplateVariable[] = used.map(
        (name) => byName.get(name) ?? { name, required: true },
      );
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
      onStatus(isNew ? 'Template created.' : 'Template saved.', 'ok');
      const list = await refresh();
      const still = list.find((t) => t.name === saved.name);
      if (still) {
        setSelected(saved.name);
        setDraft(still);
        setIsNew(false);
      }
    } catch (err) {
      onStatus(errorMessage(err), 'err');
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
      const list = await refresh();
      if (list.length > 0) {
        selectTemplate(list[0].name);
      } else {
        selectTemplate('__new__');
      }
    } catch (err) {
      onStatus(errorMessage(err), 'err');
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
      await refresh();

      const res = await api.printTemplate(draft.name, sampleData(draft.variables));
      if (res.result.mode === 'dry-run') {
        downloadText(makePrnFilename(draft.name || 'template'), res.tspl);
        onStatus('Dry run — TSPL downloaded.', 'ok');
      } else {
        onStatus('Template sent to printer.', 'ok');
      }
    } catch (err) {
      onStatus(formatPrintError(err), 'err');
    } finally {
      setBusy(false);
    }
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
