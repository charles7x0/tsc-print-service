import { z } from 'zod';

const rotationSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
]);

const geometrySchema = z.object({
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  gapMm: z.number().nonnegative(),
  direction: z.union([z.literal(0), z.literal(1)]),
  mirror: z.union([z.literal(0), z.literal(1)]),
});

const textElementSchema = z.object({
  kind: z.literal('text'),
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  font: z.string().min(1),
  rotation: rotationSchema,
  xMultiplier: z.number().int().min(1).max(10),
  yMultiplier: z.number().int().min(1).max(10),
  content: z.string(),
});

const barcodeElementSchema = z.object({
  kind: z.literal('barcode'),
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  type: z.string().min(1),
  height: z.number().int().positive(),
  readable: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  rotation: rotationSchema,
  narrow: z.number().int().positive(),
  wide: z.number().int().positive(),
  content: z.string().min(1),
});

const rawElementSchema = z.object({
  kind: z.literal('raw'),
  command: z.string().min(1),
});

const elementSchema = z.discriminatedUnion('kind', [
  textElementSchema,
  barcodeElementSchema,
  rawElementSchema,
]);

/** POST /api/print/label — a fully specified label. */
export const printLabelSchema = z.object({
  geometry: geometrySchema,
  elements: z.array(elementSchema).min(1),
  quantity: z.number().int().positive().default(1),
  copies: z.number().int().positive().default(1),
});

/** POST /api/print/raw — a list of raw TSPL command lines. */
export const printRawSchema = z.object({
  commands: z.array(z.string().min(1)).min(1),
});

/** POST /api/print/test — the built-in demo label. */
export const printTestSchema = z.object({
  landscape: z.boolean().default(true),
});

const gaugeSchema = z.object({
  label: z.string().min(1),
  value: z.number().finite(),
  max: z.number().positive().optional(),
});

/** POST /api/print/defect-tag — the parameterized Defect Analysis Tag. */
export const printDefectTagSchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().min(1),
  gauges: z.array(gaugeSchema).min(1).max(12),
  qrData: z.string().min(1).optional(),
  footer: z.string().optional(),
  direction: z.union([z.literal(0), z.literal(1)]).optional(),
});

/**
 * POST /api/print — the unified template-driven print endpoint.
 * `template` selects the layout, `data` is validated against the template's
 * own schema. Copies default to 1.
 */
export const printSchema = z.object({
  template: z.string().min(1),
  copies: z.number().int().positive().max(999).default(1),
  data: z.record(z.unknown()),
});

/**
 * POST /api/test-connection — optional target override. When fields are
 * omitted, the saved settings are used. Lets the UI test before saving.
 */
export const testConnectionSchema = z
  .object({
    ip: z.string().min(1).optional(),
    port: z.number().int().positive().optional(),
    timeoutMs: z.number().int().positive().optional(),
  })
  .default({});

export type PrintLabelBody = z.infer<typeof printLabelSchema>;
export type PrintRawBody = z.infer<typeof printRawSchema>;
export type PrintTestBody = z.infer<typeof printTestSchema>;
export type PrintDefectTagBody = z.infer<typeof printDefectTagSchema>;
export type PrintBody = z.infer<typeof printSchema>;
export type TestConnectionBody = z.infer<typeof testConnectionSchema>;
