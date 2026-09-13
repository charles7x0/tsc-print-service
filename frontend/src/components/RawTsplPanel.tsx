import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import type { Settings } from '../types';
import { downloadText, makePrnFilename } from '../download';
import { Card } from './Card';

interface Props {
  settings: Settings;
  /** True when this panel is the visible view (drives the shared preview). */
  active: boolean;
  onOutput: (data: unknown) => void;
  onStatus: (text: string, kind: 'ok' | 'err' | '') => void;
  /** Push a TSPL preview to the shared right-rail visualizer. */
  onPreview: (source: string, dpmm: number) => void;
}

const DEFAULT_TSPL = `SIZE 45 mm,75 mm
GAP 3 mm,0 mm
DIRECTION 0,0
CLS
TEXT 60,30,"3",90,1,1,"Raw Test"
BARCODE 180,30,"128",70,0,90,3,1,"123456"
PRINT 1,1`;

export function RawTsplPanel({ settings, active, onOutput, onStatus, onPreview }: Props) {
  const [commands, setCommands] = useState(DEFAULT_TSPL);
  const [busy, setBusy] = useState(false);

  const dryRun = settings.printer.dryRun;

  // Push the current commands to the shared right-rail preview as they change,
  // but only while this view is active (so panels don't fight over the preview).
  useEffect(() => {
    if (!active) return;
    onPreview(commands, settings.label.dpmm);
  }, [active, commands, settings.label.dpmm, onPreview]);

  /** Send the TSPL to the server (prints in live mode, downloads in dry-run). */
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
      // In dry-run mode, download the generated TSPL rather than saving it
      // to a folder on the server.
      if (data.result.mode === 'dry-run') {
        downloadText(makePrnFilename('raw-label'), data.tspl);
        onStatus('Dry run — TSPL downloaded.', 'ok');
      } else {
        onStatus('Raw TSPL sent to printer.', 'ok');
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : String(err);
      onOutput('Error: ' + message);
      onStatus(message, 'err');
    } finally {
      setBusy(false);
    }
  }

  /** Download the current TSPL as a .prn file without contacting the server. */
  function handleDownload() {
    const content = commands.replace(/\r?\n/g, '\r\n').trimEnd() + '\r\n';
    downloadText(makePrnFilename('raw-label'), content);
    onStatus('TSPL downloaded.', 'ok');
  }

  const primaryLabel = busy
    ? dryRun
      ? 'Downloading…'
      : 'Printing…'
    : dryRun
      ? 'Download .prn'
      : 'Print';

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
        <div className="button-row">
          <button type="submit" className="primary" disabled={busy}>
            {primaryLabel}
          </button>
          {/* Always-available direct download, independent of dry-run/live mode. */}
          <button type="button" className="secondary" onClick={handleDownload} disabled={busy}>
            Download .prn
          </button>
        </div>
      </form>
    </Card>
  );
}
