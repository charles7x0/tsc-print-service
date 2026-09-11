import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';
import type { Settings } from './types';
import { SettingsPanel } from './components/SettingsPanel';
import { TestLabelPanel } from './components/TestLabelPanel';
import { CustomLabelPanel } from './components/CustomLabelPanel';
import { RawTsplPanel } from './components/RawTsplPanel';

type StatusKind = 'ok' | 'err' | '';

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<{ text: string; kind: StatusKind }>({
    text: 'Connecting…',
    kind: '',
  });
  const [output, setOutput] = useState<string>('No requests yet.');

  const onStatus = useCallback((text: string, kind: StatusKind) => {
    setStatus({ text, kind });
  }, []);

  const onOutput = useCallback((data: unknown) => {
    setOutput(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  }, []);

  const reflectStatus = useCallback(
    (s: Settings) => {
      const mode = s.printer.dryRun
        ? 'DRY RUN (no hardware)'
        : `${s.printer.ip}:${s.printer.port}`;
      onStatus(`Connected · printer: ${mode}`, 'ok');
    },
    [onStatus],
  );

  useEffect(() => {
    let cancelled = false;
    api
      .getSettings()
      .then((s) => {
        if (cancelled) return;
        setSettings(s);
        reflectStatus(s);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : String(err);
        onStatus('Could not reach server: ' + message, 'err');
      });
    return () => {
      cancelled = true;
    };
  }, [onStatus, reflectStatus]);

  const handleSaved = useCallback(
    (s: Settings) => {
      setSettings(s);
    },
    [],
  );

  return (
    <>
      <header className="app-header">
        <h1>TSC Printer Console</h1>
        <p className={`status ${status.kind}`} role="status" aria-live="polite">
          {status.text}
        </p>
      </header>

      <main className="layout">
        {settings ? (
          <>
            <SettingsPanel
              settings={settings}
              onSaved={handleSaved}
              onOutput={onOutput}
              onStatus={onStatus}
            />
            <TestLabelPanel onOutput={onOutput} onStatus={onStatus} />
            <CustomLabelPanel settings={settings} onOutput={onOutput} onStatus={onStatus} />
            <RawTsplPanel onOutput={onOutput} onStatus={onStatus} />
          </>
        ) : (
          <section className="card">
            <p className="muted">Loading settings…</p>
          </section>
        )}

        <section className="card output" aria-labelledby="output-heading">
          <h2 id="output-heading">Last response</h2>
          <pre aria-live="polite">{output}</pre>
        </section>
      </main>
    </>
  );
}
