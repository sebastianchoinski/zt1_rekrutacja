import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { json, type Request, type Response, type NextFunction } from 'express';
import { CalculationsController } from './calculations.controller.js';
import { ApiErrorFilter } from './error.filter.js';
import { PrismaService } from './prisma.service.js';

@Module({ controllers: [CalculationsController], providers: [PrismaService] })
export class AppModule {}

export function configureApp(app: NestExpressApplication, webDirectory = resolve('dist/web')) {
  app.setGlobalPrefix('api');
  app.use(json({ limit: '1mb', strict: false }));
  // Handle parser errors before Nest converts SyntaxError into a generic 400.
  app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    if (typeof error === 'object' && error !== null && 'type' in error) {
      if (error.type === 'entity.parse.failed') {
        response.status(400).json({
          code: 'INVALID_JSON',
          message: 'Niepoprawny JSON. Sprawdź przecinki, nawiasy i cudzysłowy.',
          issues: [],
        });
        return;
      }
      if (error.type === 'entity.too.large') {
        response.status(413).json({
          code: 'INPUT_TOO_LARGE',
          message: 'Dane wejściowe przekraczają limit 1 MB.',
          issues: [],
        });
        return;
      }
    }
    next(error);
  });
  app.useGlobalFilters(new ApiErrorFilter());
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  const webIndex = resolve(webDirectory, 'index.html');
  if (existsSync(webIndex)) {
    app.useStaticAssets(webDirectory);
    app.use((request: Request, response: Response, next: NextFunction) => {
      if (
        (request.method === 'GET' || request.method === 'HEAD') &&
        /^\/historia(?:\/[^/]+)?\/?$/.test(request.path)
      ) {
        response.sendFile(webIndex);
        return;
      }
      next();
    });
  }
}

export async function createApplication() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: ['error', 'warn'],
  });
  configureApp(app);
  app.enableShutdownHooks();
  return app;
}
