import { useState } from 'react';
import { api, ApiError } from '../api';
import { Card } from './Card';

interface Props {
  onOutput: (data: unknown) => void;
  onStatus: (text: string, kind: 'ok' | 'err' | '') => void;
}

export function TestLabelPanel({ onOutput, onStatus }: Props) {
  const [landscape, setLandscape] = useState(true);
  const [busy, setBusy] = useState(false);

  async function handlePrint() {
    setBusy(true);
    try {
      const data = await api.printTest(landscape);
      onOutput(data);
      onStatus('Test label sent.', 'ok');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : String(err);
      onOutput('Error: ' + message);
      onStatus(message, 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Test label" description="Print the built-in demo label using the server's configured geometry.">
      <div className="field-inline">
        <input
          type="checkbox"
          id="test-landscape"
          checked={landscape}
          onChange={(e) => setLandscape(e.target.checked)}
        />
        <label htmlFor="test-landscape">Landscape (rotate content 90°)</label>
      </div>
      <button type="button" className="primary" onClick={handlePrint} disabled={busy}>
        {busy ? 'Printing…' : 'Print test label'}
      </button>
    </Card>
  );
}
