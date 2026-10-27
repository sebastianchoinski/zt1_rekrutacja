import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import example from '../examples/cabinet.json';
import { AppModule, configureApp } from '../src/api/app.js';
import { PrismaService } from '../src/api/prisma.service.js';

const id = '8a88e65d-24c2-4524-9951-3c0e210fba15';
const database = {
  $queryRaw: vi.fn(),
  calculation: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
};

describe('HTTP API', () => {
  let app: NestExpressApplication;
  let webDirectory: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(database)
      .compile();
    app = module.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    webDirectory = mkdtempSync(join(tmpdir(), 'materials-web-test-'));
    writeFileSync(join(webDirectory, 'index.html'), '<html><body>material-app</body></html>');
    configureApp(app, webDirectory);
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    if (webDirectory) rmSync(webDirectory, { recursive: true, force: true });
  });
  beforeEach(() => {
    vi.resetAllMocks();
    database.calculation.create.mockImplementation(async ({ data }) => ({
      id,
      createdAt: new Date('2026-01-01T12:00:00Z'),
      ...data,
    }));
  });

  it('calculates and persists the input with its result', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/calculations')
      .send(example)
      .expect(201);
    expect(response.body.input).toEqual(example);
    expect(response.body.result.requirements).toContainEqual(
      expect.objectContaining({
        item: 'PLYTA',
        gross: 15.4,
        stock: 3,
        net: 12.4,
        packages: 3,
        purchaseQuantity: 17.4,
      }),
    );
    expect(response.body.materialCount).toBe(3);
    expect(database.calculation.create).toHaveBeenCalledOnce();
  });

  it('does not save data with unknown references', async () => {
    const input = structuredClone(example);
    input.bom[0]!.component = 'NIEZNANY';
    const response = await request(app.getHttpServer())
      .post('/api/calculations')
      .send(input)
      .expect(422);
    expect(response.body.issues).toContainEqual(
      expect.objectContaining({ path: 'bom.0.component' }),
    );
    expect(JSON.stringify(response.body)).toContain('NIEZNANY');
    expect(response.body).not.toHaveProperty('stack');
    expect(database.calculation.create).not.toHaveBeenCalled();
  });

  it.each(['M\u0000', 'M\uD800', 'M\uDC00'])(
    'rejects invalid database text before attempting to persist %j',
    async (code) => {
      const input = {
        order: { item: code, quantity: 1 },
        items: [{ code, unit: 'kg' }],
        bom: [],
        stock: [],
      };
      const response = await request(app.getHttpServer())
        .post('/api/calculations')
        .send(input)
        .expect(422);
      expect(response.body.code).toBe('INVALID_INPUT');
      expect(response.body.issues).toContainEqual(
        expect.objectContaining({ path: 'items.0.code' }),
      );
      expect(database.calculation.create).not.toHaveBeenCalled();
    },
  );

  it('also validates database compatibility of units', async () => {
    const input = structuredClone(example);
    input.items[0]!.unit = 'kg\u0000';
    const response = await request(app.getHttpServer())
      .post('/api/calculations')
      .send(input)
      .expect(422);
    expect(response.body.issues).toContainEqual(expect.objectContaining({ path: 'items.0.unit' }));
    expect(database.calculation.create).not.toHaveBeenCalled();
  });

  it('reports the cycle instead of recursing indefinitely', async () => {
    const input = structuredClone(example);
    input.bom.push({ parent: 'KORPUS', component: 'SZAFKA', quantity: 1, wastePct: 0 });
    const response = await request(app.getHttpServer())
      .post('/api/calculations')
      .send(input)
      .expect(422);
    expect(response.body.code).toBe('BOM_CYCLE');
    expect(response.body.message).toContain('→');
    expect(database.calculation.create).not.toHaveBeenCalled();
  });

  it('returns a readable error for malformed JSON', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/calculations')
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);
    expect(response.body.code).toBe('INVALID_JSON');
    expect(response.body).not.toHaveProperty('stack');
  });

  it.each(['null', 'true', '42', '"tekst"'])(
    'validates well-formed JSON %s as input instead of reporting broken syntax',
    async (body) => {
      const response = await request(app.getHttpServer())
        .post('/api/calculations')
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(422);
      expect(response.body.code).toBe('INVALID_INPUT');
      expect(response.body.issues).toContainEqual(expect.objectContaining({ path: 'input' }));
      expect(database.calculation.create).not.toHaveBeenCalled();
    },
  );

  it('rejects a request exceeding the input size limit', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/calculations')
      .send({ data: 'x'.repeat(1024 * 1024) })
      .expect(413);
    expect(response.body.code).toBe('INPUT_TOO_LARGE');
  });

  it('hides database internals when saving fails', async () => {
    database.calculation.create.mockRejectedValue(new Error('private database connection details'));
    const response = await request(app.getHttpServer())
      .post('/api/calculations')
      .send(example)
      .expect(500);
    expect(response.body.code).toBe('SERVER_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('private');
  });

  it('returns recent history and a saved snapshot', async () => {
    const summary = {
      id,
      createdAt: '2026-01-01T12:00:00Z',
      orderItem: 'SZAFKA',
      orderQuantity: 10,
      materialCount: 3,
    };
    database.calculation.findMany.mockResolvedValue([summary]);
    expect((await request(app.getHttpServer()).get('/api/calculations').expect(200)).body).toEqual([
      summary,
    ]);
    expect(database.calculation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    );
    database.calculation.findUnique.mockResolvedValue({ ...summary, input: example });
    expect(
      (await request(app.getHttpServer()).get(`/api/calculations/${id}`).expect(200)).body.input,
    ).toEqual(example);
  });

  it('distinguishes invalid and missing calculation IDs', async () => {
    await request(app.getHttpServer()).get('/api/calculations/not-an-id').expect(400);
    expect(database.calculation.findUnique).not.toHaveBeenCalled();
    database.calculation.findUnique.mockResolvedValue(null);
    await request(app.getHttpServer()).get(`/api/calculations/${id}`).expect(404);
  });

  it('checks the database before reporting readiness', async () => {
    database.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    expect((await request(app.getHttpServer()).get('/api/health').expect(200)).body).toEqual({
      status: 'ok',
    });
    expect(database.$queryRaw).toHaveBeenCalledOnce();
  });

  it.each(['/historia', `/historia/szafka-${id}`])(
    'serves the web application when opening %s directly',
    async (path) => {
      const response = await request(app.getHttpServer()).get(path).expect(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('material-app');
    },
  );

  it('keeps unknown API endpoints as JSON errors instead of serving the web app', async () => {
    const response = await request(app.getHttpServer()).get('/api/unknown').expect(404);
    expect(response.body.code).toBe('REQUEST_ERROR');
  });
});
