import { CalculationError, type InputIssue } from '../calculator/errors.js';
import { z } from 'zod';

export interface ApiError {
  code: string;
  message: string;
  issues: InputIssue[];
}

const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })),
});

class RequestError extends Error {
  constructor(public readonly error: ApiError) {
    super(error.message);
  }
}

export function describeError(error: unknown): ApiError {
  if (error instanceof RequestError) return error.error;
  if (error instanceof CalculationError)
    return { code: error.code, message: error.message, issues: error.issues };
  if (error instanceof SyntaxError)
    return {
      code: 'INVALID_JSON',
      message: 'Niepoprawny JSON. Sprawdź przecinki, nawiasy i cudzysłowy.',
      issues: [],
    };
  return {
    code: 'UNKNOWN_ERROR',
    message: 'Nie udało się wykonać operacji. Spróbuj ponownie.',
    issues: [],
  };
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, options);
  } catch {
    throw new RequestError({
      code: 'NETWORK_ERROR',
      message: 'Nie można połączyć się z serwerem. Spróbuj ponownie za chwilę.',
      issues: [],
    });
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new RequestError({
      code: 'SERVER_ERROR',
      message: 'Serwer zwrócił niepoprawną odpowiedź. Spróbuj ponownie.',
      issues: [],
    });
  }
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(body);
    throw new RequestError(
      error.success
        ? error.data
        : {
            code: 'SERVER_ERROR',
            message: 'Serwer zwrócił niepoprawną odpowiedź. Spróbuj ponownie.',
            issues: [],
          },
    );
  }
  return body as T;
}
