import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export const validateRequest = (schema: ZodSchema) => 
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: 'Validation Error',
          details: error.errors.map(err => ({
            path: err.path,
            message: err.message,
          })),
          timestamp: new Date().toISOString(),
        });
        return;
      }

      next(error);
    }
  };