import { Router } from 'express';
import type { PrinterService } from '../../printer/service.js';
import { printLabelSchema, printRawSchema, printTestSchema } from '../schemas.js';
import { asyncHandler, parse, printResponse } from '../helpers.js';

/**
 * Low-level print endpoints. Templated printing is handled by the DB template
 * routes (`/api/db-templates/:name/print`); these cover the built-in test
 * label, a fully specified label, and raw TSPL command lines.
 */
export function printRoutes(service: PrinterService): Router {
  const router = Router();

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
    '/print/raw',
    asyncHandler(async (req, res) => {
      const body = parse(printRawSchema, req);
      const { result, tspl } = await service.printRaw(body.commands);
      res.json(printResponse(result, tspl));
    }),
  );

  return router;
}
