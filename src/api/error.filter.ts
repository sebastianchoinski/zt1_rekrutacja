import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { CalculationError } from '../calculator/errors.js';

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiErrorFilter.name);

  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof CalculationError) {
      response.status(422).json({ code: error.code, message: error.message, issues: error.issues });
      return;
    }
    if (error instanceof HttpException && error.getStatus() < 500) {
      const status = error.getStatus();
      response.status(status).json({
        code: 'REQUEST_ERROR',
        message:
          status === 404 ? 'Nie znaleziono zasobu.' : 'Niepoprawne żądanie. Sprawdź adres i dane.',
        issues: [],
      });
      return;
    }
    this.logger.error(error);
    response.status(500).json({
      code: 'SERVER_ERROR',
      message: 'Nie udało się zapisać lub odczytać kalkulacji. Spróbuj ponownie.',
      issues: [],
    });
  }
}
