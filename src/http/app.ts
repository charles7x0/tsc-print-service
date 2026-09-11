import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrinterService } from '../printer/service.js';
import type { SettingsRepository } from '../db/settingsRepository.js';
import { createRoutes } from './routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Static frontend lives at <project>/public. From dist/http this resolves to
// dist/../../public; from src/http (tsx) it resolves to src/../../public.
const PUBLIC_DIR = join(__dirname, '..', '..', 'public');

export interface AppDeps {
  /** Settings repository (backed by SQLite, or an in-memory DB in tests). */
  settings: SettingsRepository;
  /** Optional pre-built PrinterService (e.g. with a fake transport in tests). */
  service?: PrinterService;
}

/**
 * Build the Express application. The PrinterService can be injected (for tests
 * with a fake transport); otherwise it is created from the settings repository.
 */
export function createApp({ settings, service }: AppDeps): Express {
  const app = express();
  const printerService = service ?? new PrinterService(settings);

  app.use(express.json({ limit: '256kb' }));

  // API routes.
  app.use('/api', createRoutes(printerService, settings));

  // Static frontend.
  app.use(express.static(PUBLIC_DIR));

  // 404 for unmatched API routes.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'NotFound' });
  });

  // Centralised error handler.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Unknown error';
    // Printer connection failures are the common case; surface as 502.
    res.status(502).json({ error: 'PrinterError', message });
  });

  return app;
}
