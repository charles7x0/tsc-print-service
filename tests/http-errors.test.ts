import { describe, expect, it } from 'vitest';
import { mapError, ValidationError } from '../src/http/errors.js';
import { PrinterError } from '../src/printer/transport.js';
import {
  StringTemplateValidationError,
  MissingVariablesError,
} from '../src/templates/string-template.js';
import {
  TemplateNotFoundError,
  TemplateExistsError,
} from '../src/db/templatesRepository.js';

describe('mapError', () => {
  it('maps ValidationError to 400 with issues', () => {
    const mapped = mapError(new ValidationError([]));
    expect(mapped).toEqual({ status: 400, body: { error: 'ValidationError', issues: [] } });
  });

  it('maps StringTemplateValidationError to 400', () => {
    const mapped = mapError(new StringTemplateValidationError([{ code: 'missing-size', message: 'x' }]));
    expect(mapped?.status).toBe(400);
    expect(mapped?.body.error).toBe('TemplateValidationError');
  });

  it('maps MissingVariablesError to 400 with the missing names', () => {
    const mapped = mapError(new MissingVariablesError(['id']));
    expect(mapped).toEqual({ status: 400, body: { error: 'MissingVariables', missing: ['id'] } });
  });

  it('maps TemplateNotFoundError to 404', () => {
    const mapped = mapError(new TemplateNotFoundError('ghost'));
    expect(mapped).toEqual({ status: 404, body: { error: 'TemplateNotFound', name: 'ghost' } });
  });

  it('maps TemplateExistsError to 409', () => {
    const mapped = mapError(new TemplateExistsError('dup'));
    expect(mapped).toEqual({ status: 409, body: { error: 'TemplateExists', name: 'dup' } });
  });

  it('maps PrinterError to 502 with the message', () => {
    const mapped = mapError(new PrinterError('connection refused'));
    expect(mapped).toEqual({
      status: 502,
      body: { error: 'PrinterError', message: 'connection refused' },
    });
  });

  it('returns null for an unrecognised error (caller falls back to 500)', () => {
    expect(mapError(new TypeError('bug'))).toBeNull();
    expect(mapError('a string')).toBeNull();
  });
});
