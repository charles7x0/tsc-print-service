import { z } from 'zod';
import { buildDefectTagSpec } from '../tspl/layouts.js';
import type { LabelSpec } from '../tspl/types.js';
import type { RenderContext, TemplateDefinition } from './types.js';

const gaugeSchema = z.object({
  label: z.string().min(1),
  value: z.number().finite(),
  max: z.number().positive().optional(),
});

/**
 * Business data for the Defect Analysis Tag. Geometry and DPI are intentionally
 * absent — they come from printer/label configuration via the RenderContext.
 */
export const defectTagDataSchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().min(1),
  gauges: z.array(gaugeSchema).min(1).max(12),
  qrData: z.string().min(1).optional(),
  footer: z.string().optional(),
  /** Optional per-print orientation override (0 = normal, 1 = flipped 180°). */
  direction: z.union([z.literal(0), z.literal(1)]).optional(),
});

export type DefectTagData = z.infer<typeof defectTagDataSchema>;

export const defectTagTemplate: TemplateDefinition<DefectTagData> = {
  name: 'defect-tag',
  description:
    'Defect analysis tag: QR + id + timestamp header, proportional gauges, footer. ' +
    'Coordinates auto-computed from label size and DPI.',
  dataSchema: defectTagDataSchema,
  render(data: DefectTagData, context: RenderContext): LabelSpec {
    const geometry = { ...context.geometry };
    if (data.direction !== undefined) geometry.direction = data.direction;

    return buildDefectTagSpec({
      geometry,
      dpmm: context.dpmm,
      id: data.id,
      timestamp: data.timestamp,
      gauges: data.gauges,
      qrData: data.qrData,
      footer: data.footer,
    });
  },
};
