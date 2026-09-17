import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrinterService } from '../printer/service.js';
import type { SettingsRepository } from '../db/settingsRepository.js';
import type { TemplatesRepository } from '../db/templatesRepository.js';
import { createRoutes } from './routes.js';
import { mapError } from './errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PUBLIC_DIR = join(__dirname, '..', '..', 'public');

export interface AppDeps {
  settings: SettingsRepository;
  templates: TemplatesRepository;
  service?: PrinterService;
}

/**
 * Build the Express application. PrinterService can be injected for testing;
 * otherwise it is created from defaults. The settings and templates
 * repositories are required (they own the DB connection).
 */
export function createApp({ settings, templates, service }: AppDeps): Express {
  const app = express();
  const printerService = service ?? new PrinterService(settings);

  app.use(express.json({ limit: '256kb' }));

  app.use('/api', createRoutes(printerService, settings, templates));

  app.use(express.static(PUBLIC_DIR));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'NotFound' });
  });

  // Central error handler: known domain errors map to their proper status via
  // mapError; anything unrecognised is a 500 (logged server-side, no internal
  // detail leaked to the client).
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const mapped = mapError(err);
    if (mapped) {
      res.status(mapped.status).json(mapped.body);
      return;
    }
    // eslint-disable-next-line no-console
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'InternalError' });
  });

  return app;
}
