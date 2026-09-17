import { Router } from 'express';
import type { PrinterService } from '../printer/service.js';
import type { SettingsRepository } from '../db/settingsRepository.js';
import type { TemplateRegistry } from '../templates/index.js';
import type { TemplatesRepository } from '../db/templatesRepository.js';
import { settingsRoutes } from './routes/settings.js';
import { dbTemplateRoutes } from './routes/db-templates.js';
import { printRoutes } from './routes/print.js';

/**
 * Compose the API router from focused, per-resource route modules. Each module
 * owns one concern (settings, DB templates, printing) and mounts under `/api`.
 * Handlers throw domain errors; the central error middleware in `app.ts` maps
 * them to HTTP responses.
 */
export function createRoutes(
  service: PrinterService,
  settings: SettingsRepository,
  registry: TemplateRegistry,
  templates: TemplatesRepository,
): Router {
  const router = Router();

  router.use(settingsRoutes(service, settings));
  router.use(dbTemplateRoutes(service, templates));
  router.use(printRoutes(service, settings, registry));

  return router;
}
