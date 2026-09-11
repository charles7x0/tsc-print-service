import { useState } from 'react';
import { api, ApiError } from '../api';
import type { Settings } from '../types';
import { Card } from './Card';
import { TsplVisualizer } from './TsplVisualizer';

interface Props {
  settings: Settings;
  onOutput: (data: unknown) => void;
  onStatus: (text: string, kind: 'ok' | 'err' | '') => void;
}

const DEFAULT_TSPL = `SIZE 45 mm,75 mm
GAP 3 mm,0 mm
DIRECTION 0,0
CLS
TEXT 60,30,"3",90,1,1,"Raw Test"
BARCODE 180,30,"128",70,0,90,3,1,"123456"
PRINT 1,1`;

export function RawTsplPanel({ settings, onOutput, onStatus }: Props) {
  const [commands, setCommands] = useState(DEFAULT_TSPL);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const lines = commands
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const data = await api.printRaw(lines);
      onOutput(data);
      onStatus('Raw TSPL sent.', 'ok');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : String(err);
      onOutput('Error: ' + message);
      onStatus(message, 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Raw TSPL" description="One command per line. Sent verbatim to the printer.">
      <form onSubmit={handleSubmit}>
        <label htmlFor="raw-commands" className="sr-only">
          TSPL commands
        </label>
        <textarea
          id="raw-commands"
          rows={8}
          spellCheck={false}
          value={commands}
          onChange={(e) => setCommands(e.target.value)}
        />
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Sending…' : 'Send raw TSPL'}
        </button>
      </form>

      <h3 className="visualizer-heading">Preview</h3>
      <TsplVisualizer source={commands} dpmm={settings.label.dpmm} />
    </Card>
  );
}
