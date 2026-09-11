import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/http/app.js';
import { PrinterService } from '../src/printer/service.js';
import { openDatabase, type Db } from '../src/db/database.js';
import { SettingsRepository } from '../src/db/settingsRepository.js';
import type { PrinterTransport, SendResult } from '../src/printer/transport.js';

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
  let fake: FakeTransport;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = openDatabase(':memory:');
    settings = new SettingsRepository(db);
    fake = new FakeTransport();
    const service = new PrinterService(settings, fake);
    app = createApp({ settings, service });
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

  it('POST /api/print/defect-tag builds a tag and returns TSPL', async () => {
    const res = await request(app)
      .post('/api/print/defect-tag')
      .send({
        id: 'AGM24V_LINE2',
        timestamp: '11/09/2026 10:15:32',
        gauges: [
          { label: 'TCA', value: 84 },
          { label: 'CM', value: 12.3 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.tspl).toContain('SIZE 45 mm,75 mm');
    expect(res.body.tspl).toContain('QRCODE');
    expect(fake.lastTspl).toContain('"TCA"');
  });

  it('POST /api/print/defect-tag validates the body', async () => {
    const res = await request(app)
      .post('/api/print/defect-tag')
      .send({ id: 'X', timestamp: 't', gauges: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
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

  // ---- Unified template-driven print endpoint ----

  it('GET /api/templates lists available templates', async () => {
    const res = await request(app).get('/api/templates');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const names = res.body.map((t: { name: string }) => t.name);
    expect(names).toContain('defect-tag');
    expect(names).toContain('simple-label');
  });

  it('POST /api/print renders a defect-tag via template name', async () => {
    const res = await request(app)
      .post('/api/print')
      .send({
        template: 'defect-tag',
        data: {
          id: 'AGM24V_LINE2',
          timestamp: '11/09/2026 10:15:32',
          gauges: [{ label: 'TCA', value: 84 }],
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.template).toBe('defect-tag');
    expect(res.body.tspl).toContain('SIZE 45 mm,75 mm');
    expect(res.body.tspl).toContain('QRCODE');
  });

  it('POST /api/print renders a simple-label via template name', async () => {
    const res = await request(app)
      .post('/api/print')
      .send({
        template: 'simple-label',
        data: { lines: ['Hello', 'World'], barcode: { data: '123' } },
      });
    expect(res.status).toBe(200);
    expect(res.body.tspl).toContain('"Hello"');
    expect(res.body.tspl).toContain('BARCODE');
  });

  it('POST /api/print returns 404 for unknown template', async () => {
    const res = await request(app)
      .post('/api/print')
      .send({ template: 'nonexistent', data: {} });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('UnknownTemplate');
    expect(res.body.available).toContain('defect-tag');
  });

  it('POST /api/print returns 400 with field errors for invalid data', async () => {
    const res = await request(app)
      .post('/api/print')
      .send({ template: 'defect-tag', data: { id: 'X' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('TemplateValidationError');
    expect(res.body.template).toBe('defect-tag');
    expect(res.body.issues.length).toBeGreaterThan(0);
  });

  it('returns 404 for unknown API routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
  });
});
