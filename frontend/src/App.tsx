import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';
import type { Settings, StatusKind, ViewId } from './types';
import { SettingsPanel } from './components/SettingsPanel';
import { CustomLabelPanel } from './components/CustomLabelPanel';
import { RawTsplPanel } from './components/RawTsplPanel';
import { TemplatesPanel } from './components/TemplatesPanel';
import { PrintPanel } from './components/PrintPanel';
import { NavBar } from './components/NavBar';
import { TsplVisualizer } from './components/TsplVisualizer';
import { StatusPill, type ConnectionState } from './components/StatusPill';
import { usePrinterStatus } from './hooks/usePrinterStatus';

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
            {/* All panels stay mounted (hidden when inactive) so their form
                state — selected template, entered values, edited source — is
                preserved when switching views. Each panel only drives the shared
                preview when it is the active view. */}
            <main className="app-view" tabIndex={-1}>
              <div id="view-print" role="tabpanel" aria-labelledby="nav-tab-print" hidden={view !== 'print'}>
                <PrintPanel
                  settings={settings}
                  active={view === 'print'}
                  onStatus={onStatus}
                  onPreview={onPreview}
                />
              </div>

              <div id="view-templates" role="tabpanel" aria-labelledby="nav-tab-templates" hidden={view !== 'templates'}>
                <TemplatesPanel
                  settings={settings}
                  active={view === 'templates'}
                  onStatus={onStatus}
                  onPreview={onPreview}
                />
              </div>

              <div id="view-custom" role="tabpanel" aria-labelledby="nav-tab-custom" hidden={view !== 'custom'}>
                <div className="view-stack">
                  <CustomLabelPanel
                    settings={settings}
                    active={view === 'custom'}
                    onStatus={onStatus}
                    onPreview={onPreview}
                  />
                  <RawTsplPanel
                    settings={settings}
                    active={view === 'custom'}
                    onStatus={onStatus}
                    onPreview={onPreview}
                  />
                </div>
              </div>

              <div id="view-settings" role="tabpanel" aria-labelledby="nav-tab-settings" hidden={view !== 'settings'}>
                <SettingsPanel
                  settings={settings}
                  onSaved={handleSaved}
                  onStatus={onStatus}
                />
              </div>
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
