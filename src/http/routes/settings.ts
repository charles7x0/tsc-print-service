import { Router } from 'express';
import type { PrinterService } from '../../printer/service.js';
import type { SettingsRepository } from '../../db/settingsRepository.js';
import { settingsUpdateSchema } from '../../db/settings.js';
import { testConnectionSchema } from '../schemas.js';
import { asyncHandler, parse } from '../helpers.js';

/** Utility + settings endpoints: health, config, settings, test-connection. */
export function settingsRoutes(
  service: PrinterService,
  settings: SettingsRepository,
): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', dryRun: settings.getSettings().printer.dryRun });
  });

  router.get('/config', (_req, res) => {
    const s = settings.getSettings();
    res.json({
      printer: { ip: s.printer.ip, port: s.printer.port, dryRun: s.printer.dryRun },
      label: s.label,
    });
  });

  router.get('/settings', (_req, res) => {
    res.json(settings.getSettings());
  });

  router.put('/settings', (req, res) => {
    const body = parse(settingsUpdateSchema, req);
    res.json({ ok: true, settings: settings.updateSettings(body) });
  });

  router.post(
    '/test-connection',
    asyncHandler(async (req, res) => {
      const body = parse(testConnectionSchema, req);
      res.json(await service.testConnection(body));
    }),
  );

  return router;
}
