import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { HttpStatus, ERROR_MESSAGES } from '../utils/constants.js';

export function validateRequest(schema: ZodSchema) {
  return function requestValidator(req: Request, res: Response, next: NextFunction): void {
    try {
      const parsed = schema.parse(req) as
        | {
            body?: unknown;
            params?: unknown;
            query?: unknown;
            headers?: unknown;
          }
        | undefined;

      if (parsed && typeof parsed === 'object') {
        if ('body' in parsed && parsed.body !== undefined) {
          req.body = parsed.body;
        }
        if ('params' in parsed && parsed.params !== undefined) {
          req.params = parsed.params as Request['params'];
        }
        if ('query' in parsed && parsed.query !== undefined) {
          req.query = parsed.query as Request['query'];
        }
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(HttpStatus.BAD_REQUEST).json({
          error: ERROR_MESSAGES.VALIDATION_ERROR,
          details: error.errors.map(function formatError(err) {
            return {
              path: err.path,
              message: err.message,
            };
          }),
          timestamp: new Date().toISOString(),
        });
        return;
      }

      next(error);
    }
  };
}
