import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrinterService } from '../printer/service.js';
import type { SettingsRepository } from '../db/settingsRepository.js';
import type { TemplatesRepository } from '../db/templatesRepository.js';
import { createDefaultRegistry, type TemplateRegistry } from '../templates/index.js';
import { createRoutes } from './routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PUBLIC_DIR = join(__dirname, '..', '..', 'public');

export interface AppDeps {
  settings: SettingsRepository;
  templates: TemplatesRepository;
  service?: PrinterService;
  registry?: TemplateRegistry;
}

/**
 * Build the Express application. PrinterService and TemplateRegistry can be
 * injected for testing; otherwise they are created from defaults. The settings
 * and templates repositories are required (they own the DB connection).
 */
export function createApp({ settings, templates, service, registry }: AppDeps): Express {
  const app = express();
  const printerService = service ?? new PrinterService(settings);
  const templateRegistry = registry ?? createDefaultRegistry();

  app.use(express.json({ limit: '256kb' }));

  app.use('/api', createRoutes(printerService, settings, templateRegistry, templates));

  app.use(express.static(PUBLIC_DIR));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'NotFound' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(502).json({ error: 'PrinterError', message });
  });

  return app;
}
