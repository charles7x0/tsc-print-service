import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { PrinterService } from '../printer/service.js';
import type { SettingsRepository } from '../db/settingsRepository.js';
import { settingsUpdateSchema } from '../db/settings.js';
import {
  printDefectTagSchema,
  printLabelSchema,
  printRawSchema,
  printTestSchema,
  testConnectionSchema,
} from './schemas.js';

/**
 * Wrap an async route handler so rejected promises are forwarded to Express's
 * error handler instead of crashing the process.
 */
function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: (err?: unknown) => void) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

/**
 * Validate a request body with a zod schema, returning a 400 with details on
 * failure. Returns the parsed value or undefined (response already sent).
 */
function parseBody<T>(
  schema: z.ZodType<T>,
  req: Request,
  res: Response,
): T | undefined {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: 'ValidationError',
      issues: result.error.issues,
    });
    return undefined;
  }
  return result.data;
}

export function createRoutes(
  service: PrinterService,
  settings: SettingsRepository,
): Router {
  const router = Router();

  // Health check — useful for container orchestration and the frontend.
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', dryRun: settings.getSettings().printer.dryRun });
  });

  // Expose current settings so the frontend can show defaults.
  // The printer IP is included; there are no secrets in this config.
  router.get('/config', (_req, res) => {
    const s = settings.getSettings();
    res.json({
      printer: {
        ip: s.printer.ip,
        port: s.printer.port,
        dryRun: s.printer.dryRun,
      },
      label: s.label,
    });
  });

  // Read the full settings object.
  router.get('/settings', (_req, res) => {
    res.json(settings.getSettings());
  });

  // Update settings (partial patch). Returns the new full settings.
  router.put(
    '/settings',
    (req, res) => {
      const body = parseBody(settingsUpdateSchema, req, res);
      if (!body) return;
      const updated = settings.updateSettings(body);
      res.json({ ok: true, settings: updated });
    },
  );

  // Test whether the printer is reachable (TCP probe, no data sent).
  // Accepts an optional { ip, port, timeoutMs } override to test before saving.
  router.post(
    '/test-connection',
    asyncHandler(async (req, res) => {
      const body = parseBody(testConnectionSchema, req, res);
      if (!body) return;
      const result = await service.testConnection(body);
      // Always 200: the probe result itself reports reachable true/false.
      res.json(result);
    }),
  );

  // Print the built-in demo/test label.
  router.post(
    '/print/test',
    asyncHandler(async (req, res) => {
      const body = parseBody(printTestSchema, req, res);
      if (!body) return;
      const { result, tspl } = await service.printTestLabel(body.landscape ?? true);
      res.json({ ok: true, result, tspl });
    }),
  );

  // Print a fully specified label.
  router.post(
    '/print/label',
    asyncHandler(async (req, res) => {
      const body = parseBody(printLabelSchema, req, res);
      if (!body) return;
      const { result, tspl } = await service.printLabel({
        geometry: body.geometry,
        elements: body.elements,
        quantity: body.quantity ?? 1,
        copies: body.copies ?? 1,
      });
      res.json({ ok: true, result, tspl });
    }),
  );

  // Print the parameterized Defect Analysis Tag.
  router.post(
    '/print/defect-tag',
    asyncHandler(async (req, res) => {
      const body = parseBody(printDefectTagSchema, req, res);
      if (!body) return;
      const { result, tspl } = await service.printDefectTag(body);
      res.json({ ok: true, result, tspl });
    }),
  );

  // Print raw TSPL command lines.
  router.post(
    '/print/raw',
    asyncHandler(async (req, res) => {
      const body = parseBody(printRawSchema, req, res);
      if (!body) return;
      const { result, tspl } = await service.printRaw(body.commands);
      res.json({ ok: true, result, tspl });
    }),
  );

  return router;
}
