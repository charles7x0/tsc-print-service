import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import type { Rotation, Settings } from '../types';
import { Card } from './Card';
import { Fieldset, NumberField, SelectField, TextField } from './Field';

interface Props {
  settings: Settings;
  onOutput: (data: unknown) => void;
  onStatus: (text: string, kind: 'ok' | 'err' | '') => void;
}

const rotationOptions: { value: Rotation; label: string }[] = [
  { value: 0, label: '0' },
  { value: 90, label: '90' },
  { value: 180, label: '180' },
  { value: 270, label: '270' },
];

export function CustomLabelPanel({ settings, onOutput, onStatus }: Props) {
  // Geometry seeded from settings; kept in sync when settings change.
  const [width, setWidth] = useState(settings.label.widthMm);
  const [height, setHeight] = useState(settings.label.heightMm);
  const [gap, setGap] = useState(settings.label.gapMm);
  const [direction, setDirection] = useState<0 | 1>(settings.label.direction);

  const [text, setText] = useState('Hello');
  const [tx, setTx] = useState(60);
  const [ty, setTy] = useState(30);
  const [tRot, setTRot] = useState<Rotation>(90);

  const [bData, setBData] = useState('123456');
  const [bType, setBType] = useState('128');
  const [bx, setBx] = useState(180);
  const [by, setBy] = useState(30);
  const [bHeight, setBHeight] = useState(70);
  const [bRot, setBRot] = useState<Rotation>(90);

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setWidth(settings.label.widthMm);
    setHeight(settings.label.heightMm);
    setGap(settings.label.gapMm);
    setDirection(settings.label.direction);
  }, [settings]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await api.printLabel({
        geometry: { widthMm: width, heightMm: height, gapMm: gap, direction, mirror: 0 },
        elements: [
          { kind: 'text', x: tx, y: ty, font: '3', rotation: tRot, xMultiplier: 1, yMultiplier: 1, content: text },
          { kind: 'barcode', x: bx, y: by, type: bType, height: bHeight, readable: 0, rotation: bRot, narrow: 3, wide: 1, content: bData },
        ],
        quantity: 1,
        copies: 1,
      });
      onOutput(data);
      onStatus('Custom label sent.', 'ok');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : String(err);
      onOutput('Error: ' + message);
      onStatus(message, 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Custom label">
      <form onSubmit={handleSubmit}>
        <Fieldset legend="Geometry">
          <div className="grid">
            <NumberField label="Width (mm)" value={width} onChange={setWidth} min={1} step={0.1} />
            <NumberField label="Height (mm)" value={height} onChange={setHeight} min={1} step={0.1} />
            <NumberField label="Gap (mm)" value={gap} onChange={setGap} min={0} step={0.1} />
            <SelectField
              label="Direction"
              value={direction}
              onChange={(v) => setDirection(Number(v) as 0 | 1)}
              options={[
                { value: 0, label: '0 — normal' },
                { value: 1, label: '1 — flipped 180°' },
              ]}
            />
          </div>
        </Fieldset>

        <Fieldset legend="Text">
          <div className="grid">
            <TextField label="Content" value={text} onChange={setText} />
            <NumberField label="X (dots)" value={tx} onChange={setTx} min={0} />
            <NumberField label="Y (dots)" value={ty} onChange={setTy} min={0} />
            <SelectField label="Rotation" value={tRot} onChange={(v) => setTRot(Number(v) as Rotation)} options={rotationOptions} />
          </div>
        </Fieldset>

        <Fieldset legend="Barcode">
          <div className="grid">
            <TextField label="Data" value={bData} onChange={setBData} />
            <TextField label="Type" value={bType} onChange={setBType} />
            <NumberField label="X (dots)" value={bx} onChange={setBx} min={0} />
            <NumberField label="Y (dots)" value={by} onChange={setBy} min={0} />
            <NumberField label="Height (dots)" value={bHeight} onChange={setBHeight} min={1} />
            <SelectField label="Rotation" value={bRot} onChange={(v) => setBRot(Number(v) as Rotation)} options={rotationOptions} />
          </div>
        </Fieldset>

        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Printing…' : 'Print custom label'}
        </button>
      </form>
    </Card>
  );
}
