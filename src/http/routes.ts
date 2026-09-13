import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { PrinterService } from '../printer/service.js';
import type { SettingsRepository } from '../db/settingsRepository.js';
import {
  TemplateRegistry,
  UnknownTemplateError,
  TemplateValidationError,
  type RenderContext,
} from '../templates/index.js';
import {
  TemplatesRepository,
  TemplateNotFoundError,
  TemplateExistsError,
} from '../db/templatesRepository.js';
import {
  renderTemplate,
  StringTemplateValidationError,
  MissingVariablesError,
  createTemplateSchema,
  updateTemplateSchema,
} from '../templates/string-template.js';
import { buildLabel } from '../tspl/builder.js';
import { settingsUpdateSchema } from '../db/settings.js';
import {
  printDefectTagSchema,
  printLabelSchema,
  printRawSchema,
  printSchema,
  printTestSchema,
  templateDataSchema,
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
function parseBody<S extends z.ZodTypeAny>(
  schema: S,
  req: Request,
  res: Response,
): z.output<S> | undefined {
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
  registry: TemplateRegistry,
  templates: TemplatesRepository,
): Router {
  const router = Router();

  // ---- Utility / settings endpoints ----------------------------------------

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
    const body = parseBody(settingsUpdateSchema, req, res);
    if (!body) return;
    const updated = settings.updateSettings(body);
    res.json({ ok: true, settings: updated });
  });

  router.post(
    '/test-connection',
    asyncHandler(async (req, res) => {
      const body = parseBody(testConnectionSchema, req, res);
      if (!body) return;
      const result = await service.testConnection(body);
      res.json(result);
    }),
  );

  // ---- Template discovery ---------------------------------------------------

  /** List all available (built-in, code) print templates and their data schemas. */
  router.get('/templates', (_req, res) => {
    res.json(registry.list());
  });

  // ---- DB-stored, user-editable TSPL templates ------------------------------

  /**
   * Map template repository/validation errors to HTTP responses. Returns true
   * if the error was handled (response sent), false to rethrow.
   */
  function handleTemplateError(err: unknown, res: Response): boolean {
    if (err instanceof TemplateNotFoundError) {
      res.status(404).json({ error: 'TemplateNotFound', name: err.name });
      return true;
    }
    if (err instanceof TemplateExistsError) {
      res.status(409).json({ error: 'TemplateExists', name: err.name });
      return true;
    }
    if (err instanceof StringTemplateValidationError) {
      res.status(400).json({ error: 'TemplateValidationError', issues: err.issues });
      return true;
    }
    if (err instanceof MissingVariablesError) {
      res.status(400).json({ error: 'MissingVariables', missing: err.missing });
      return true;
    }
    return false;
  }

  /** List all DB templates. */
  router.get('/db-templates', (_req, res) => {
    res.json(templates.list());
  });

  /** Get one DB template (full source + variables). */
  router.get('/db-templates/:name', (req, res) => {
    try {
      res.json(templates.get(req.params.name));
    } catch (err) {
      if (!handleTemplateError(err, res)) throw err;
    }
  });

  /** Create a DB template. */
  router.post('/db-templates', (req, res) => {
    const body = parseBody(createTemplateSchema, req, res);
    if (!body) return;
    try {
      res.status(201).json(templates.create(body));
    } catch (err) {
      if (!handleTemplateError(err, res)) throw err;
    }
  });

  /** Update a DB template. */
  router.put('/db-templates/:name', (req, res) => {
    const body = parseBody(updateTemplateSchema, req, res);
    if (!body) return;
    try {
      res.json(templates.update(req.params.name, body));
    } catch (err) {
      if (!handleTemplateError(err, res)) throw err;
    }
  });

  /** Delete a DB template. */
  router.delete('/db-templates/:name', (req, res) => {
    try {
      templates.delete(req.params.name);
      res.json({ ok: true });
    } catch (err) {
      if (!handleTemplateError(err, res)) throw err;
    }
  });

  /**
   * Preview a DB template: substitute `data` into the source and return the
   * rendered TSPL without printing. Powers the UI live preview.
   */
  router.post('/db-templates/:name/preview', (req, res) => {
    const body = parseBody(templateDataSchema, req, res);
    if (!body) return;
    try {
      const template = templates.get(req.params.name);
      const tspl = renderTemplate(template, body.data);
      res.json({ ok: true, name: template.name, tspl });
    } catch (err) {
      if (!handleTemplateError(err, res)) throw err;
    }
  });

  /** Render a DB template and send it to the printer. */
  router.post(
    '/db-templates/:name/print',
    asyncHandler(async (req, res) => {
      const body = parseBody(templateDataSchema, req, res);
      if (!body) return;
      let tspl: string;
      let name: string;
      try {
        const template = templates.get(req.params.name);
        name = template.name;
        tspl = renderTemplate(template, body.data);
      } catch (err) {
        if (handleTemplateError(err, res)) return;
        throw err;
      }
      const result = await service.sendTspl(tspl);
      res.json({ ok: true, template: name, copies: body.copies, result, tspl });
    }),
  );

  // ---- Unified template-driven print endpoint -------------------------------

  /**
   * POST /api/print — the canonical way to print.
   *
   * Flow:
   *   1. Look up template by name                     → 404 if unknown
   *   2. Validate `data` against the template's schema → 400 with field errors
   *   3. Resolve geometry + dpmm from settings
   *   4. template.render(data, context) → LabelSpec
   *   5. buildLabel(spec)               → TSPL string
   *   6. Send to printer or return for download (dry-run)
   */
  router.post(
    '/print',
    asyncHandler(async (req, res) => {
      const body = parseBody(printSchema, req, res);
      if (!body) return;

      const s = settings.getSettings();

      // 1. Resolve the render context from saved printer/label settings.
      const context: RenderContext = {
        geometry: {
          widthMm: s.label.widthMm,
          heightMm: s.label.heightMm,
          gapMm: s.label.gapMm,
          direction: s.label.direction,
          mirror: s.label.mirror,
        },
        dpmm: s.label.dpmm,
      };

      // 2–4. Look up, validate, render.
      let tspl: string;
      try {
        const spec = registry.render(body.template, body.data, context);
        spec.copies = body.copies ?? 1;
        tspl = buildLabel(spec);
      } catch (err) {
        if (err instanceof UnknownTemplateError) {
          res.status(404).json({
            error: 'UnknownTemplate',
            template: err.templateName,
            available: registry.list().map((t) => t.name),
          });
          return;
        }
        if (err instanceof TemplateValidationError) {
          res.status(400).json({
            error: 'TemplateValidationError',
            template: err.templateName,
            issues: err.issues,
          });
          return;
        }
        throw err;
      }

      // 5–6. Send.
      const result = await service.sendTspl(tspl);
      res.json({ ok: true, template: body.template, result, tspl });
    }),
  );

  // ---- Legacy endpoints (backward compatibility) ----------------------------

  router.post(
    '/print/test',
    asyncHandler(async (req, res) => {
      const body = parseBody(printTestSchema, req, res);
      if (!body) return;
      const { result, tspl } = await service.printTestLabel(body.landscape ?? true);
      res.json({ ok: true, result, tspl });
    }),
  );

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

  router.post(
    '/print/defect-tag',
    asyncHandler(async (req, res) => {
      const body = parseBody(printDefectTagSchema, req, res);
      if (!body) return;
      const { result, tspl } = await service.printDefectTag(body);
      res.json({ ok: true, result, tspl });
    }),
  );

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
