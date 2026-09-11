export type Rotation = 0 | 90 | 180 | 270;
export type ZeroOne = 0 | 1;

export interface PrinterSettings {
  ip: string;
  port: number;
  timeoutMs: number;
  dryRun: boolean;
}

export interface LabelSettings {
  widthMm: number;
  heightMm: number;
  gapMm: number;
  direction: ZeroOne;
  mirror: ZeroOne;
  dpmm: number;
}

export interface Settings {
  printer: PrinterSettings;
  label: LabelSettings;
}

export interface SendResult {
  mode: 'network' | 'dry-run';
  bytesSent: number;
  target?: { ip: string; port: number };
}

export interface PrintResponse {
  ok: true;
  result: SendResult;
  tspl: string;
}

export interface ProbeResult {
  reachable: boolean;
  target: { ip: string; port: number };
  latencyMs?: number;
  error?: string;
}

export interface TextElementInput {
  kind: 'text';
  x: number;
  y: number;
  font: string;
  rotation: Rotation;
  xMultiplier: number;
  yMultiplier: number;
  content: string;
}

export interface BarcodeElementInput {
  kind: 'barcode';
  x: number;
  y: number;
  type: string;
  height: number;
  readable: 0 | 1 | 2;
  rotation: Rotation;
  narrow: number;
  wide: number;
  content: string;
}

export type LabelElementInput = TextElementInput | BarcodeElementInput;

export interface PrintLabelBody {
  geometry: {
    widthMm: number;
    heightMm: number;
    gapMm: number;
    direction: ZeroOne;
    mirror: ZeroOne;
  };
  elements: LabelElementInput[];
  quantity: number;
  copies: number;
}
