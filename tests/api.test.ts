import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/http/app.js';
import { PrinterService } from '../src/printer/service.js';
import { openDatabase, type Db } from '../src/db/database.js';
import { SettingsRepository } from '../src/db/settingsRepository.js';
import { TemplatesRepository } from '../src/db/templatesRepository.js';
import { PrinterError, type PrinterTransport, type SendResult } from '../src/printer/transport.js';

/** Captures the TSPL sent, so tests never touch a real printer. */
class FakeTransport implements PrinterTransport {
  public lastTspl = '';
  async send(tspl: string): Promise<SendResult> {
    this.lastTspl = tspl;
    return { mode: 'dry-run', bytesSent: Buffer.byteLength(tspl) };
  }
}

describe('HTTP API', () => {
  let db: Db;
  let settings: SettingsRepository;
  let templates: TemplatesRepository;
  let fake: FakeTransport;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = openDatabase(':memory:');
    settings = SettingsRepository.create(db);
    templates = TemplatesRepository.create(db);
    fake = new FakeTransport();
    const service = new PrinterService(settings, fake);
    app = createApp({ settings, templates, service });
  });

  afterEach(() => {
    db.close();
  });

  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.dryRun).toBe(true);
  });

  it('GET /api/config exposes label defaults', async () => {
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.label.widthMm).toBe(45);
    expect(res.body.printer.ip).toBe('192.168.0.50');
  });

  it('GET /api/settings returns the full settings', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.printer).toBeDefined();
    expect(res.body.label).toBeDefined();
  });

  it('PUT /api/settings updates settings and affects prints', async () => {
    const put = await request(app)
      .put('/api/settings')
      .send({ label: { widthMm: 100, heightMm: 50 } });
    expect(put.status).toBe(200);
    expect(put.body.settings.label.widthMm).toBe(100);

    // The next test print should reflect the new geometry.
    const print = await request(app).post('/api/print/test').send({ landscape: true });
    expect(print.body.tspl).toContain('SIZE 100 mm,50 mm');
  });

  it('PUT /api/settings rejects invalid values', async () => {
    const res = await request(app)
      .put('/api/settings')
      .send({ printer: { port: -1 } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('POST /api/print/test prints and returns TSPL', async () => {
    const res = await request(app).post('/api/print/test').send({ landscape: true });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.tspl).toContain('SIZE 45 mm,75 mm');
    expect(fake.lastTspl).toContain('PRINT 1,1');
  });

  it('POST /api/print/raw sends verbatim commands', async () => {
    const res = await request(app)
      .post('/api/print/raw')
      .send({ commands: ['CLS', 'PRINT 1,1'] });
    expect(res.status).toBe(200);
    expect(fake.lastTspl).toBe('CLS\r\nPRINT 1,1\r\n');
  });

  it('POST /api/print/label validates the body', async () => {
    const res = await request(app)
      .post('/api/print/label')
      .send({ geometry: {}, elements: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('POST /api/print/label accepts a valid label', async () => {
    const res = await request(app)
      .post('/api/print/label')
      .send({
        geometry: { widthMm: 45, heightMm: 75, gapMm: 3, direction: 0, mirror: 0 },
        elements: [
          {
            kind: 'text',
            x: 60,
            y: 30,
            font: '3',
            rotation: 90,
            xMultiplier: 1,
            yMultiplier: 1,
            content: 'Hello',
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(fake.lastTspl).toContain('TEXT 60,30,"3",90,1,1,"Hello"');
  });

  it('POST /api/print/label rejects an element positioned off the label (400)', async () => {
    const res = await request(app)
      .post('/api/print/label')
      .send({
        geometry: { widthMm: 45, heightMm: 75, gapMm: 3, direction: 0, mirror: 0 },
        elements: [
          // x=5000 is far past the 360-dot width at the default 8 dpmm.
          {
            kind: 'text',
            x: 5000,
            y: 30,
            font: '3',
            rotation: 0,
            xMultiplier: 1,
            yMultiplier: 1,
            content: 'off',
          },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('SpecValidationError');
    expect(res.body.issues.length).toBeGreaterThan(0);
  });

  it('POST /api/test-connection reports unreachable for a bad target', async () => {
    // 203.0.113.0 is TEST-NET-3 (RFC 5737) — guaranteed unroutable.
    const res = await request(app)
      .post('/api/test-connection')
      .send({ ip: '203.0.113.0', port: 9100, timeoutMs: 300 });
    expect(res.status).toBe(200);
    expect(res.body.reachable).toBe(false);
    expect(res.body.error).toBeTruthy();
  });

  // ---- DB-stored TSPL templates -------------------------------------------

  const validTemplate = {
    name: 'api-label',
    description: 'created via api',
    source: 'SIZE 45 mm,75 mm\nGAP 3 mm,0 mm\nCLS\nTEXT 0,0,"3",0,1,1,"{{id}}"\nPRINT 1,1',
    variables: [{ name: 'id', required: true }],
    geometry: { widthMm: 45, heightMm: 75, dpmm: 8 },
  };

  it('GET /api/db-templates lists the seeded template', async () => {
    const res = await request(app).get('/api/db-templates');
    expect(res.status).toBe(200);
    expect(res.body.map((t: { name: string }) => t.name)).toContain('tad-inspecao-defect-taxa');
  });

  it('GET /api/db-templates/:name returns the full template', async () => {
    const res = await request(app).get('/api/db-templates/tad-inspecao-defect-taxa');
    expect(res.status).toBe(200);
    expect(res.body.source).toContain('{{id}}');
    expect(res.body.variables.length).toBeGreaterThan(0);
  });

  it('GET /api/db-templates/:name returns 404 when missing', async () => {
    const res = await request(app).get('/api/db-templates/ghost');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('TemplateNotFound');
  });

  it('POST /api/db-templates/:name/preview renders TSPL without printing', async () => {
    const res = await request(app)
      .post('/api/db-templates/api-preview/preview')
      .send({ data: { id: 'ZZZ' } });
    // api-preview does not exist yet -> 404
    expect(res.status).toBe(404);

    await request(app).post('/api/db-templates').send({ ...validTemplate, name: 'api-preview' });
    const ok = await request(app)
      .post('/api/db-templates/api-preview/preview')
      .send({ data: { id: 'ZZZ' } });
    expect(ok.status).toBe(200);
    expect(ok.body.tspl).toContain('"ZZZ"');
    // Fake transport was never used for preview.
    expect(fake.lastTspl).toBe('');
  });

  it('POST /api/db-templates creates a template (201)', async () => {
    const res = await request(app).post('/api/db-templates').send(validTemplate);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('api-label');
  });

  it('POST /api/db-templates returns 409 on duplicate', async () => {
    await request(app).post('/api/db-templates').send(validTemplate);
    const dup = await request(app).post('/api/db-templates').send(validTemplate);
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('TemplateExists');
  });

  it('POST /api/db-templates returns 400 for invalid TSPL', async () => {
    const res = await request(app)
      .post('/api/db-templates')
      .send({ ...validTemplate, name: 'bad', source: 'CLS\n{{id}}' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('TemplateValidationError');
    expect(res.body.issues.map((i: { code: string }) => i.code)).toContain('missing-size');
  });

  it('PUT /api/db-templates/:name updates a template', async () => {
    await request(app).post('/api/db-templates').send(validTemplate);
    const res = await request(app)
      .put('/api/db-templates/api-label')
      .send({
        description: 'updated',
        source: validTemplate.source,
        variables: validTemplate.variables,
        geometry: validTemplate.geometry,
      });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe('updated');
  });

  it('DELETE /api/db-templates/:name removes a template', async () => {
    await request(app).post('/api/db-templates').send(validTemplate);
    const del = await request(app).delete('/api/db-templates/api-label');
    expect(del.status).toBe(200);
    const after = await request(app).get('/api/db-templates/api-label');
    expect(after.status).toBe(404);
  });

  it('POST /api/db-templates/:name/print sends TSPL to the transport', async () => {
    const res = await request(app)
      .post('/api/db-templates/tad-inspecao-defect-taxa/print')
      .send({
        data: {
          qrData: 'AGM24V-L2',
          id: 'AGM24V-L2',
          timestamp: '11/09/2026 10:15:32',
          footer: 'BATTERY DEFECT ANALYSIS',
          m0_label: 'TCA', m0_value: '84', m0_ci: '78-88',
          m1_label: 'TCF', m1_value: '62', m1_ci: '55-70',
          m2_label: 'TCAR', m2_value: '93', m2_ci: '85-95',
          m3_label: 'IMP', m3_value: '45', m3_ci: '40-55',
          m4_label: 'TAXA', m4_value: '78', m4_ci: '70-85',
          m5_label: 'CM', m5_value: '12.3', m5_ci: '10-15',
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(fake.lastTspl).toContain('QRCODE 330,20,M,7,A,90,"AGM24V-L2"');
    expect(fake.lastTspl).toContain('"BATTERY DEFECT ANALYSIS"');
  });

  it('POST /api/db-templates/:name/print returns 400 when required vars are missing', async () => {
    const res = await request(app)
      .post('/api/db-templates/tad-inspecao-defect-taxa/print')
      .send({ data: { id: 'only-id' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MissingVariables');
    expect(res.body.missing.length).toBeGreaterThan(0);
  });

  it('returns 404 for unknown API routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('maps a PrinterError from the transport to 502', async () => {
    // A transport that fails as a printer would (connection refused, etc.).
    class FailingPrinterTransport implements PrinterTransport {
      async send(): Promise<SendResult> {
        throw new PrinterError('connection refused');
      }
    }
    const failApp = createApp({
      settings,
      templates,
      service: new PrinterService(settings, new FailingPrinterTransport()),
    });
    const res = await request(failApp).post('/api/print/test').send({ landscape: true });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('PrinterError');
  });

  it('maps an unexpected (non-domain) error to 500 without leaking the message', async () => {
    class BuggyTransport implements PrinterTransport {
      async send(): Promise<SendResult> {
        throw new TypeError('internal bug with secret detail');
      }
    }
    const buggyApp = createApp({
      settings,
      templates,
      service: new PrinterService(settings, new BuggyTransport()),
    });
    const res = await request(buggyApp).post('/api/print/test').send({ landscape: true });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('InternalError');
    // The internal message must not be exposed to the client.
    expect(JSON.stringify(res.body)).not.toContain('secret detail');
  });
});
