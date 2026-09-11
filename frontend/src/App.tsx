import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';
import type { Settings } from './types';
import { SettingsPanel } from './components/SettingsPanel';
import { TestLabelPanel } from './components/TestLabelPanel';
import { CustomLabelPanel } from './components/CustomLabelPanel';
import { RawTsplPanel } from './components/RawTsplPanel';
import { StatusPill, type ConnectionState } from './components/StatusPill';

type StatusKind = 'ok' | 'err' | '';

export function App(): JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [connState, setConnState] = useState<ConnectionState>('connecting');
  const [statusMessage, setStatusMessage] = useState<string>('Reaching the server…');
  const [output, setOutput] = useState<string>('');

  const onStatus = useCallback((text: string, kind: StatusKind) => {
    setStatusMessage(text);
    if (kind === 'err') setConnState('error');
  }, []);

  const onOutput = useCallback((data: unknown) => {
    setOutput(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  }, []);

  const reflectSettings = useCallback((s: Settings) => {
    setConnState(s.printer.dryRun ? 'dry-run' : 'live');
    setStatusMessage('');
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .getSettings()
      .then((s) => {
        if (cancelled) return;
        setSettings(s);
        reflectSettings(s);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : String(err);
        setConnState('error');
        setStatusMessage('Could not reach server: ' + message);
      });
    return () => {
      cancelled = true;
    };
  }, [reflectSettings]);

  const handleSaved = useCallback(
    (s: Settings) => {
      setSettings(s);
      reflectSettings(s);
    },
    [reflectSettings],
  );

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__mark" aria-hidden="true">▤</span>
          <div>
            <h1 className="app-header__title">TSC Printer Console</h1>
            <p className="app-header__subtitle">TSPL label control</p>
          </div>
        </div>
        <StatusPill state={connState} settings={settings} message={statusMessage} />
      </header>

      {settings ? (
        <div className="app-body">
          {/* Configuration lives in a distinct sidebar column. */}
          <aside className="app-sidebar" aria-label="Configuration">
            <SettingsPanel
              settings={settings}
              onSaved={handleSaved}
              onOutput={onOutput}
              onStatus={onStatus}
            />
          </aside>

          {/* Operator actions grouped together, with a sticky results rail. */}
          <main className="app-main">
            <div className="action-grid">
              <TestLabelPanel onOutput={onOutput} onStatus={onStatus} />
              <CustomLabelPanel settings={settings} onOutput={onOutput} onStatus={onStatus} />
              <RawTsplPanel settings={settings} onOutput={onOutput} onStatus={onStatus} />
            </div>

            <aside className="results-rail" aria-label="Last response">
              <div className="card output">
                <h2>Last response</h2>
                {output ? (
                  <pre aria-live="polite">{output}</pre>
                ) : (
                  <p className="muted empty-state">
                    Responses from print and settings actions appear here.
                  </p>
                )}
              </div>
            </aside>
          </main>
        </div>
      ) : (
        <div className="app-loading">
          <div className="card">
            <p className="muted">{statusMessage || 'Loading settings…'}</p>
          </div>
        </div>
      )}
    </div>
  );
}
