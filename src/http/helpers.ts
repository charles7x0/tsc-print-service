import type { Request, Response } from 'express';
import type { z } from 'zod';
import type { SendResult } from '../printer/transport.js';
import { ValidationError } from './errors.js';

/**
 * Wrap an async route handler so rejected promises are forwarded to Express's
 * error handler (and thus to the central error middleware) instead of crashing
 * the process.
 */
export function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void> | void,
): (req: Request, res: Response, next: (err?: unknown) => void) => void {
  return (req, res, next) => {
    try {
      const result = fn(req, res);
      if (result instanceof Promise) result.catch(next);
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Validate a request body against a zod schema, returning the parsed value.
 * Throws `ValidationError` on failure (caught by the central error middleware
 * and mapped to a 400). Unlike a "return undefined and send inline" helper,
 * this keeps handlers linear and puts all error → HTTP translation in one
 * place.
 */
export function parse<S extends z.ZodTypeAny>(schema: S, req: Request): z.output<S> {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    throw new ValidationError(result.error.issues);
  }
  return result.data;
}

/** The standard envelope every print endpoint returns. */
export interface PrintResponse {
  ok: true;
  template?: string;
  copies?: number;
  result: SendResult;
  tspl: string;
}

/** Build a consistent print response envelope. */
export function printResponse(
  result: SendResult,
  tspl: string,
  extra: { template?: string; copies?: number } = {},
): PrintResponse {
  return { ok: true, result, tspl, ...extra };
}
