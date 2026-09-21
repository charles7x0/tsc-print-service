import { useState } from 'react';
import { api } from '../api';
import type { Settings, StatusKind } from '../types';
import { errorMessage } from '../errors';
import { Card } from './Card';
import { Fieldset, NumberField, SelectField, TextField } from './Field';

interface SettingsPanelProps {
  settings: Settings;
  onSaved: (s: Settings) => void;
  onStatus: (text: string, kind: StatusKind) => void;
}

type ConnState = { text: string; kind: StatusKind };

export function SettingsPanel({ settings, onSaved, onStatus }: SettingsPanelProps) {
  const [printer, setPrinter] = useState(settings.printer);
  const [label, setLabel] = useState(settings.label);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [conn, setConn] = useState<ConnState>({ text: '', kind: '' });

  const isReal = !printer.dryRun;

  const patchPrinter = (p: Partial<typeof printer>) => setPrinter((prev) => ({ ...prev, ...p }));
  const patchLabel = (l: Partial<typeof label>) => setLabel((prev) => ({ ...prev, ...l }));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { settings: saved } = await api.updateSettings({ printer, label });
      onSaved(saved);
      const mode = saved.printer.dryRun
        ? 'DRY RUN'
        : `${saved.printer.ip}:${saved.printer.port}`;
      onStatus('Settings saved · ' + mode, 'ok');
    } catch (err) {
      onStatus(errorMessage(err), 'err');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setConn({ text: `Testing ${printer.ip}:${printer.port} …`, kind: '' });
    try {
      const result = await api.testConnection({
        ip: printer.ip,
        port: printer.port,
        timeoutMs: printer.timeoutMs,
      });
      if (result.reachable) {
        setConn({
          text: `Reachable · ${result.target.ip}:${result.target.port} (${result.latencyMs} ms)`,
          kind: 'ok',
        });
      } else {
        setConn({ text: `Unreachable · ${result.error}`, kind: 'err' });
      }
    } catch (err) {
      setConn({ text: 'Error: ' + errorMessage(err), kind: 'err' });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card
      title="Printer settings"
      description="Choose dry-run (no hardware) or a real device, and set the connection. Saved to the database."
    >
      <form onSubmit={handleSave}>
        <Fieldset legend="Mode">
          <div className="field-inline">
            <input
              type="radio"
              name="mode"
              id="mode-dry"
              checked={printer.dryRun}
              onChange={() => patchPrinter({ dryRun: true })}
            />
            <label htmlFor="mode-dry">Dry run — write TSPL to a file (no printer)</label>
          </div>
          <div className="field-inline">
            <input
              type="radio"
              name="mode"
              id="mode-real"
              checked={isReal}
              onChange={() => patchPrinter({ dryRun: false })}
            />
            <label htmlFor="mode-real">Real device — send over the network</label>
          </div>
        </Fieldset>

        {isReal ? (
          <Fieldset legend="Connection">
            <div className="grid">
              <TextField label="Printer IP" value={printer.ip} onChange={(v) => patchPrinter({ ip: v })} placeholder="192.168.0.50" />
              <NumberField label="Port" value={printer.port} onChange={(v) => patchPrinter({ port: v })} min={1} max={65535} />
              <NumberField label="Timeout (ms)" value={printer.timeoutMs} onChange={(v) => patchPrinter({ timeoutMs: v })} min={100} step={100} />
            </div>
          </Fieldset>
        ) : (
          <Fieldset legend="Dry-run output">
            <p className="muted">
              The generated TSPL is downloaded to your browser as a .prn file. Nothing is sent to a printer.
            </p>
          </Fieldset>
        )}

        <Fieldset legend="Label defaults">
          <div className="grid">
            <NumberField label="Width (mm)" value={label.widthMm} onChange={(v) => patchLabel({ widthMm: v })} min={1} step={0.1} />
            <NumberField label="Height (mm)" value={label.heightMm} onChange={(v) => patchLabel({ heightMm: v })} min={1} step={0.1} />
            <NumberField label="Gap (mm)" value={label.gapMm} onChange={(v) => patchLabel({ gapMm: v })} min={0} step={0.1} />
            <SelectField
              label="DPMM"
              value={label.dpmm}
              onChange={(v) => patchLabel({ dpmm: Number(v) })}
              options={[
                { value: 8, label: '8 — 203 dpi' },
                { value: 11.8, label: '11.8 — 300 dpi' },
                { value: 24, label: '24 — 600 dpi' },
              ]}
            />
            <SelectField
              label="Direction"
              value={label.direction}
              onChange={(v) => patchLabel({ direction: Number(v) as 0 | 1 })}
              options={[
                { value: 0, label: '0 — normal' },
                { value: 1, label: '1 — flipped 180°' },
              ]}
            />
            <SelectField
              label="Mirror"
              value={label.mirror}
              onChange={(v) => patchLabel({ mirror: Number(v) as 0 | 1 })}
              options={[
                { value: 0, label: '0 — normal' },
                { value: 1, label: '1 — mirrored' },
              ]}
            />
          </div>
        </Fieldset>

        <div className="button-row">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          <button type="button" className="secondary" onClick={handleTest} disabled={testing}>
            {testing ? 'Testing…' : 'Test connection'}
          </button>
        </div>
        {conn.text ? (
          <p className={`conn-result ${conn.kind}`} role="status" aria-live="polite">
            {conn.text}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
