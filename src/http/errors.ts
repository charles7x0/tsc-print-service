import type { z } from 'zod';
import { PrinterError } from '../printer/transport.js';
import {
  UnknownTemplateError,
  TemplateValidationError,
} from '../templates/index.js';
import {
  StringTemplateValidationError,
  MissingVariablesError,
} from '../templates/string-template.js';
import {
  TemplateNotFoundError,
  TemplateExistsError,
} from '../db/templatesRepository.js';

/**
 * Raised when a request body fails schema validation. Carries the zod issues so
 * the error middleware can surface field-level detail to the client. Thrown by
 * the `parse` helper instead of writing a response inline, so all error → HTTP
 * translation happens in one place (`mapError`).
 */
export class ValidationError extends Error {
  constructor(public readonly issues: z.ZodIssue[]) {
    super('ValidationError');
    this.name = 'ValidationError';
  }
}

/** The HTTP status + JSON body an error translates to. */
export interface MappedError {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Translate a thrown error into an HTTP status and response body. Returns
 * `null` for unrecognised errors so the caller can decide the fallback
 * (typically 500 with a generic message and a server-side log).
 *
 * Centralising the mapping keeps route handlers free of try/catch: they simply
 * throw domain errors and this function owns the contract.
 */
export function mapError(err: unknown): MappedError | null {
  // --- 400: request/data validation ---------------------------------------
  if (err instanceof ValidationError) {
    return { status: 400, body: { error: 'ValidationError', issues: err.issues } };
  }
  if (err instanceof TemplateValidationError) {
    return {
      status: 400,
      body: { error: 'TemplateValidationError', template: err.templateName, issues: err.issues },
    };
  }
  if (err instanceof StringTemplateValidationError) {
    return { status: 400, body: { error: 'TemplateValidationError', issues: err.issues } };
  }
  if (err instanceof MissingVariablesError) {
    return { status: 400, body: { error: 'MissingVariables', missing: err.missing } };
  }

  // --- 404 / 409: template lookup / conflict -------------------------------
  if (err instanceof UnknownTemplateError) {
    return {
      status: 404,
      body: { error: 'UnknownTemplate', template: err.templateName, available: err.available },
    };
  }
  if (err instanceof TemplateNotFoundError) {
    return { status: 404, body: { error: 'TemplateNotFound', name: err.templateName } };
  }
  if (err instanceof TemplateExistsError) {
    return { status: 409, body: { error: 'TemplateExists', name: err.templateName } };
  }

  // --- 502: genuine printer/transport failure ------------------------------
  if (err instanceof PrinterError) {
    return { status: 502, body: { error: 'PrinterError', message: err.message } };
  }

  // Unrecognised — caller falls back to 500 without leaking internals.
  return null;
}
