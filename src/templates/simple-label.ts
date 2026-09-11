import { z } from 'zod';
import type { LabelElement, LabelSpec } from '../tspl/types.js';
import type { RenderContext, TemplateDefinition } from './types.js';

/**
 * Business data for a simple text + optional barcode label. Positions are NOT
 * in the payload — the template computes them from the label geometry so the
 * caller only supplies content.
 */
export const simpleLabelDataSchema = z.object({
  /** Lines of text, printed top-to-bottom. */
  lines: z.array(z.string().min(1)).min(1).max(6),
  /** Optional barcode printed below the text. */
  barcode: z
    .object({
      data: z.string().min(1),
      type: z.string().min(1).default('128'),
      /** Human-readable text: 0 none, 1 below, 2 above. */
      readable: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(1),
    })
    .optional(),
  copies: z.number().int().positive().max(999).default(1),
});

export type SimpleLabelData = z.infer<typeof simpleLabelDataSchema>;

export const simpleLabelTemplate: TemplateDefinition<SimpleLabelData> = {
  name: 'simple-label',
  description:
    'Basic label: one or more text lines with an optional barcode below. ' +
    'Positions are computed from label size.',
  dataSchema: simpleLabelDataSchema,
  render(data: SimpleLabelData, context: RenderContext): LabelSpec {
    const { geometry, dpmm } = context;
    const W = Math.round(geometry.widthMm * dpmm);
    const H = Math.round(geometry.heightMm * dpmm);
    const margin = Math.round(Math.min(W, H) * 0.06);

    const elements: LabelElement[] = [];

    // Text lines stacked from the top margin. Line height scales with the label.
    const lineHeight = Math.max(28, Math.round(H * 0.09));
    let y = margin;
    for (const line of data.lines) {
      elements.push({
        kind: 'text',
        x: margin,
        y,
        font: '3',
        rotation: 0,
        xMultiplier: 1,
        yMultiplier: 1,
        content: line,
      });
      y += lineHeight;
    }

    // Optional barcode below the text, sized to fit the remaining height.
    if (data.barcode) {
      const barcodeHeight = Math.max(40, Math.round(H * 0.22));
      const barcodeY = Math.min(y + margin, H - barcodeHeight - margin);
      elements.push({
        kind: 'barcode',
        x: margin,
        y: barcodeY,
        type: data.barcode.type,
        height: barcodeHeight,
        readable: data.barcode.readable,
        rotation: 0,
        narrow: 2,
        wide: 4,
        content: data.barcode.data,
      });
    }

    return {
      geometry,
      elements,
      quantity: 1,
      copies: data.copies,
    };
  },
};
