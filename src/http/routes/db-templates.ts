import { Router } from 'express';
import type { PrinterService } from '../../printer/service.js';
import type { TemplatesRepository } from '../../db/templatesRepository.js';
import {
  renderTemplate,
  createTemplateSchema,
  updateTemplateSchema,
} from '../../templates/string-template.js';
import { templateDataSchema } from '../schemas.js';
import { asyncHandler, parse, printResponse } from '../helpers.js';

/**
 * CRUD + preview/print for user-authored, DB-stored TSPL templates. Handlers
 * throw domain errors (TemplateNotFoundError, TemplateExistsError,
 * StringTemplateValidationError, MissingVariablesError); the central error
 * middleware maps them to HTTP responses.
 */
export function dbTemplateRoutes(
  service: PrinterService,
  templates: TemplatesRepository,
): Router {
  const router = Router();

  router.get('/db-templates', (_req, res) => {
    res.json(templates.list());
  });

  router.get('/db-templates/:name', (req, res) => {
    res.json(templates.get(req.params.name));
  });

  router.post('/db-templates', (req, res) => {
    const body = parse(createTemplateSchema, req);
    res.status(201).json(templates.create(body));
  });

  router.put('/db-templates/:name', (req, res) => {
    const body = parse(updateTemplateSchema, req);
    res.json(templates.update(req.params.name, body));
  });

  router.delete('/db-templates/:name', (req, res) => {
    templates.delete(req.params.name);
    res.json({ ok: true });
  });

  /** Render to TSPL without printing — powers the UI live preview. */
  router.post('/db-templates/:name/preview', (req, res) => {
    const body = parse(templateDataSchema, req);
    const template = templates.get(req.params.name);
    const tspl = renderTemplate(template, body.data);
    res.json({ ok: true, name: template.name, tspl });
  });

  /** Render a DB template and send it to the printer. */
  router.post(
    '/db-templates/:name/print',
    asyncHandler(async (req, res) => {
      const body = parse(templateDataSchema, req);
      const template = templates.get(req.params.name);
      const tspl = renderTemplate(template, body.data);
      const result = await service.sendTspl(tspl);
      res.json(printResponse(result, tspl, { template: template.name, copies: body.copies }));
    }),
  );

  return router;
}
