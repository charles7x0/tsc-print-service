import { Router } from 'express';
import type { PrinterService } from '../../printer/service.js';
import type { SettingsRepository } from '../../db/settingsRepository.js';
import type { TemplateRegistry, RenderContext } from '../../templates/index.js';
import { buildLabel } from '../../tspl/builder.js';
import {
  printDefectTagSchema,
  printLabelSchema,
  printRawSchema,
  printSchema,
  printTestSchema,
} from '../schemas.js';
import { asyncHandler, parse, printResponse } from '../helpers.js';

/**
 * Print endpoints: the unified template-driven `/print`, the code-template
 * listing, and the legacy endpoints kept for backward compatibility.
 */
export function printRoutes(
  service: PrinterService,
  settings: SettingsRepository,
  registry: TemplateRegistry,
): Router {
  const router = Router();

  /** List code templates and their data schemas (for building a UI form). */
  router.get('/templates', (_req, res) => {
    res.json(registry.list());
  });

  /**
   * POST /api/print — the canonical way to print. Looks up a code template,
   * validates `data` against its schema, resolves geometry/DPI from settings,
   * renders a LabelSpec, builds TSPL, and sends. Errors (UnknownTemplateError,
   * TemplateValidationError, PrinterError) are thrown and mapped centrally.
   */
  router.post(
    '/print',
    asyncHandler(async (req, res) => {
      const body = parse(printSchema, req);
      const s = settings.getSettings();

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

      const spec = registry.render(body.template, body.data, context);
      // copies is an explicit build override, not a mutation of the spec.
      const tspl = buildLabel(spec, { copies: body.copies });
      const result = await service.sendTspl(tspl);
      res.json(printResponse(result, tspl, { template: body.template, copies: body.copies }));
    }),
  );

  // ---- Legacy endpoints (backward compatibility) --------------------------

  router.post(
    '/print/test',
    asyncHandler(async (req, res) => {
      const body = parse(printTestSchema, req);
      const { result, tspl } = await service.printTestLabel(body.landscape ?? true);
      res.json(printResponse(result, tspl));
    }),
  );

  router.post(
    '/print/label',
    asyncHandler(async (req, res) => {
      const body = parse(printLabelSchema, req);
      const { result, tspl } = await service.printLabel({
        geometry: body.geometry,
        elements: body.elements,
        quantity: body.quantity ?? 1,
        copies: body.copies ?? 1,
      });
      res.json(printResponse(result, tspl));
    }),
  );

  router.post(
    '/print/defect-tag',
    asyncHandler(async (req, res) => {
      const body = parse(printDefectTagSchema, req);
      const { result, tspl } = await service.printDefectTag(body);
      res.json(printResponse(result, tspl));
    }),
  );

  router.post(
    '/print/raw',
    asyncHandler(async (req, res) => {
      const body = parse(printRawSchema, req);
      const { result, tspl } = await service.printRaw(body.commands);
      res.json(printResponse(result, tspl));
    }),
  );

  return router;
}
