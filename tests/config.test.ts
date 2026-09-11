import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('parses PORT and HOST from the environment', () => {
    const cfg = loadConfig({ PORT: '9090', HOST: '127.0.0.1' });
    expect(cfg.http.port).toBe(9090);
    expect(cfg.http.host).toBe('127.0.0.1');
  });

  it('applies defaults when values are absent', () => {
    const cfg = loadConfig({});
    expect(cfg.http.port).toBe(8080);
    expect(cfg.http.host).toBe('0.0.0.0');
  });

  it('throws on an invalid numeric port', () => {
    expect(() => loadConfig({ PORT: 'not-a-number' })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('throws on a non-positive port', () => {
    expect(() => loadConfig({ PORT: '0' })).toThrow();
  });

  it('does not read printer or label settings from the environment', () => {
    // These are DB-backed now; loadConfig only shapes http.
    const cfg = loadConfig({ PORT: '8080', HOST: '0.0.0.0' });
    expect(cfg).toEqual({ http: { port: 8080, host: '0.0.0.0' } });
  });
});
