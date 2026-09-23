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

// ---- DB-stored, user-editable TSPL templates -----------------------------

export interface TemplateVariable {
  name: string;
  required: boolean;
  description?: string;
  sample?: string | number | boolean;
}

export interface TemplateGeometry {
  widthMm: number;
  heightMm: number;
  dpmm: number;
}

export interface StringTemplate {
  name: string;
  description: string;
  source: string;
  variables: TemplateVariable[];
  geometry: TemplateGeometry;
  updatedAt: string;
}

/** Body for creating a template. */
export interface CreateTemplateBody {
  name: string;
  description: string;
  source: string;
  variables: TemplateVariable[];
  geometry: TemplateGeometry;
}

/** Body for updating a template (name comes from the URL). */
export type UpdateTemplateBody = Omit<CreateTemplateBody, 'name'>;

/** Values supplied for a template's placeholders. */
export type TemplateData = Record<string, string | number | boolean>;

export interface TemplatePreviewResponse {
  ok: true;
  name: string;
  tspl: string;
}

// ---- UI navigation -------------------------------------------------------

/** Primary views the single-page app switches between. */
export type ViewId = 'print' | 'templates' | 'custom' | 'settings';

// ---- Shared panel contract -----------------------------------------------

/** Status banner severity used across panels. */
export type StatusKind = 'ok' | 'err' | '';

/** Props every feature panel receives from the app shell. */
export interface PanelProps {
  settings: Settings;
  /** True when this panel is the visible view (drives the shared preview). */
  active: boolean;
  /** Report a status message + severity to the app shell. */
  onStatus: (text: string, kind: StatusKind) => void;
  /** Push a TSPL preview to the shared right-rail visualizer. */
  onPreview: (source: string, dpmm: number) => void;
}
