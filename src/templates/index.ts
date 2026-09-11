import { TemplateRegistry } from './registry.js';
import { defectTagTemplate } from './defect-tag.js';
import { simpleLabelTemplate } from './simple-label.js';

export {
  TemplateRegistry,
  UnknownTemplateError,
  TemplateValidationError,
} from './registry.js';
export type {
  TemplateDefinition,
  TemplateSummary,
  RenderContext,
} from './types.js';

/**
 * Build the default registry with all built-in templates registered.
 * Add new templates here (or call `.register()` on the returned instance).
 */
export function createDefaultRegistry(): TemplateRegistry {
  const registry = new TemplateRegistry();
  registry.register(defectTagTemplate);
  registry.register(simpleLabelTemplate);
  return registry;
}
