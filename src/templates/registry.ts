import { z } from 'zod';
import type { LabelSpec } from '../tspl/types.js';
import type {
  RenderContext,
  TemplateDefinition,
  TemplateSummary,
} from './types.js';

/** Thrown when a requested template name is not registered. */
export class UnknownTemplateError extends Error {
  constructor(
    public readonly templateName: string,
    /** Names of the templates that ARE registered, for a helpful 404 body. */
    public readonly available: string[] = [],
  ) {
    super(`Unknown template: "${templateName}"`);
    this.name = 'UnknownTemplateError';
  }
}

/** Thrown when the request `data` fails the template's schema validation. */
export class TemplateValidationError extends Error {
  constructor(
    public readonly templateName: string,
    public readonly issues: z.ZodIssue[],
  ) {
    super(`Invalid data for template "${templateName}"`);
    this.name = 'TemplateValidationError';
  }
}

/**
 * Holds the available print templates and provides lookup, validation and
 * rendering. Templates are keyed by their `name`.
 */
export class TemplateRegistry {
  private readonly templates = new Map<string, TemplateDefinition<unknown>>();

  /** Register a template. Throws if the name is already taken. */
  register<TData>(template: TemplateDefinition<TData>): this {
    if (this.templates.has(template.name)) {
      throw new Error(`Template already registered: "${template.name}"`);
    }
    this.templates.set(template.name, template as TemplateDefinition<unknown>);
    return this;
  }

  /** Return true if a template with the given name exists. */
  has(name: string): boolean {
    return this.templates.has(name);
  }

  /** Look up a template or throw UnknownTemplateError. */
  get(name: string): TemplateDefinition<unknown> {
    const template = this.templates.get(name);
    if (!template) throw new UnknownTemplateError(name, [...this.templates.keys()]);
    return template;
  }

  /** List all templates as JSON-serialisable summaries (for the API/UI). */
  list(): TemplateSummary[] {
    return [...this.templates.values()].map((t) => ({
      name: t.name,
      description: t.description,
      dataSchema: describeSchema(t.dataSchema),
    }));
  }

  /**
   * Validate `data` against the named template and render it to a LabelSpec.
   * Throws UnknownTemplateError or TemplateValidationError on failure.
   */
  render(name: string, data: unknown, context: RenderContext): LabelSpec {
    const template = this.get(name);
    const parsed = template.dataSchema.safeParse(data);
    if (!parsed.success) {
      throw new TemplateValidationError(name, parsed.error.issues);
    }
    return template.render(parsed.data, context);
  }
}

/**
 * Best-effort description of a zod schema for the templates listing. This is
 * not a full JSON Schema conversion (that would need an extra dependency); it
 * exposes enough structure for a UI to render a form: field names, kinds, and
 * whether they are optional.
 */
function describeSchema(schema: z.ZodTypeAny): unknown {
  const def = schema._def as { typeName?: string };

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(shape)) {
      fields[key] = describeSchema(value);
    }
    return { type: 'object', fields };
  }
  if (schema instanceof z.ZodArray) {
    return { type: 'array', items: describeSchema(schema.element) };
  }
  if (schema instanceof z.ZodOptional) {
    return { ...(describeSchema(schema.unwrap()) as object), optional: true };
  }
  if (schema instanceof z.ZodDefault) {
    return { ...(describeSchema(schema._def.innerType) as object), optional: true };
  }
  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };

  // Fallback: expose the zod type name.
  return { type: def.typeName ?? 'unknown' };
}
