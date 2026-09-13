import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';
import type { Settings, ViewId } from './types';
import { SettingsPanel } from './components/SettingsPanel';
import { CustomLabelPanel } from './components/CustomLabelPanel';
import { RawTsplPanel } from './components/RawTsplPanel';
import { TemplatesPanel } from './components/TemplatesPanel';
import { PrintPanel } from './components/PrintPanel';
import { NavBar } from './components/NavBar';
import { TsplVisualizer } from './components/TsplVisualizer';
import { StatusPill, type ConnectionState } from './components/StatusPill';
import { usePrinterStatus } from './hooks/usePrinterStatus';

type StatusKind = 'ok' | 'err' | '';

/** Shared preview payload lifted to the app so it can render in the right rail. */
export interface PreviewState {
  source: string;
  dpmm: number;
}

export function App(): JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [connState, setConnState] = useState<ConnectionState>('connecting');
  const [statusMessage, setStatusMessage] = useState<string>('Reaching the server…');
  const [view, setView] = useState<ViewId>('print');
  const [preview, setPreview] = useState<PreviewState>({ source: '', dpmm: 8 });

  // Live reachability (polled) — distinct from the dry-run/live mode.
  const printerStatus = usePrinterStatus(settings);

  const onPreview = useCallback((source: string, dpmm: number) => {
    setPreview({ source, dpmm });
  }, []);

  const onStatus = useCallback((text: string, kind: StatusKind) => {
    setStatusMessage(text);
    if (kind === 'err') setConnState('error');
  }, []);

  // The raw response is no longer surfaced in the UI; status messages convey
  // success/errors. Kept as a no-op so panels can call it without changes.
  const onOutput = useCallback((_data: unknown) => {
    /* intentionally not displayed */
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
          <div>
            <h1 className="app-header__title">TSC Printer Console</h1>
            <p className="app-header__subtitle">TSPL label control</p>
          </div>
        </div>
        <StatusPill
          state={connState}
          settings={settings}
          message={statusMessage}
          reachability={printerStatus.reachability}
          latencyMs={printerStatus.latencyMs}
          reachError={printerStatus.error}
          checkedAt={printerStatus.checkedAt}
          onRefresh={printerStatus.refresh}
        />
      </header>

      {settings ? (
        <>
          <NavBar active={view} onSelect={setView} />

          <div className={`app-body${view === 'settings' ? ' app-body--full' : ''}`}>
            {/* One task per view. The result rail is shared context that stays
                relevant regardless of which action produced the last response. */}
            <main
              className="app-view"
              id={`view-${view}`}
              role="tabpanel"
              aria-labelledby={`nav-tab-${view}`}
              tabIndex={-1}
            >
              {view === 'print' ? (
                <PrintPanel
                  settings={settings}
                  onOutput={onOutput}
                  onStatus={onStatus}
                  onPreview={onPreview}
                />
              ) : null}

              {view === 'templates' ? (
                <TemplatesPanel
                  settings={settings}
                  onOutput={onOutput}
                  onStatus={onStatus}
                  onPreview={onPreview}
                />
              ) : null}

              {view === 'custom' ? (
                <div className="view-stack">
                  <CustomLabelPanel
                    settings={settings}
                    onOutput={onOutput}
                    onStatus={onStatus}
                    onPreview={onPreview}
                  />
                  <RawTsplPanel
                    settings={settings}
                    onOutput={onOutput}
                    onStatus={onStatus}
                    onPreview={onPreview}
                  />
                </div>
              ) : null}

              {view === 'settings' ? (
                <SettingsPanel
                  settings={settings}
                  onSaved={handleSaved}
                  onOutput={onOutput}
                  onStatus={onStatus}
                />
              ) : null}
            </main>

            {/* The preview rail is irrelevant on the Settings view, so hide it there. */}
            {view !== 'settings' ? (
              <aside className="results-rail" aria-label="Label preview">
                <div className="card">
                  <h2>Preview</h2>
                  {preview.source ? (
                    <TsplVisualizer source={preview.source} dpmm={preview.dpmm} />
                  ) : (
                    <p className="muted empty-state">
                      A label preview appears here as you edit or fill in a template.
                    </p>
                  )}
                </div>
              </aside>
            ) : null}
          </div>
        </>
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
