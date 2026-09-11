import type { z } from 'zod';
import type { LabelGeometry, LabelSpec } from '../tspl/types.js';

/**
 * The rendering context passed to a template: the physical label geometry and
 * the printhead resolution. These come from printer/label configuration, NOT
 * from the request payload — so the same template prints correctly on a 203 or
 * 300 dpi printer without the caller changing anything.
 */
export interface RenderContext {
  geometry: LabelGeometry;
  /** Dots per mm (8 = 203 dpi, 11.8 = 300 dpi, 24 = 600 dpi). */
  dpmm: number;
}

/**
 * A print template: business data in, a LabelSpec out. The template owns all
 * layout/coordinate maths, computed from the RenderContext so it fits any label
 * size. Data is validated against `dataSchema` before `render` is called.
 *
 * TData is the OUTPUT (parsed) shape of the template's `data` payload.
 * The schema's input type may differ (e.g. optional fields with defaults).
 */
export interface TemplateDefinition<TData = unknown> {
  /** Stable identifier used in the print payload, e.g. "defect-tag". */
  readonly name: string;
  /** Human-readable description for the templates listing. */
  readonly description: string;
  /**
   * Zod schema the request `data` is validated against. The output type must
   * be assignable to TData. Using `z.ZodType<TData, z.ZodTypeDef, unknown>`
   * so schemas with `.default()` (where input allows undefined) are accepted.
   */
  readonly dataSchema: z.ZodType<TData, z.ZodTypeDef, unknown>;
  /** Render validated data into a LabelSpec for the given context. */
  render(data: TData, context: RenderContext): LabelSpec;
}

/**
 * A JSON-serialisable summary of a template, returned by the templates API so
 * the frontend can discover available templates and their expected fields.
 */
export interface TemplateSummary {
  name: string;
  description: string;
  /** JSON Schema derived from the template's zod dataSchema (best-effort). */
  dataSchema: unknown;
}
