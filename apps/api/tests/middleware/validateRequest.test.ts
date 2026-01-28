import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateRequest } from '../../middleware/validateRequest.js';
import { HttpStatus } from '../../utils/constants.js';

describe('validateRequest middleware', () => {
  const createMockResponse = () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    return res;
  };

  const createMockRequest = (body = {}, params = {}, query = {}) => {
    return {
      body,
      params,
      query,
    } as Request;
  };

  const createMockNext = () => vi.fn() as NextFunction;

  it('should call next() when validation passes', () => {
    const schema = z.object({
      body: z.object({ name: z.string() }),
    });

    const req = createMockRequest({ name: 'John' });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = validateRequest(schema);
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 400 when body validation fails', () => {
    const schema = z.object({
      body: z.object({ name: z.string().min(1) }),
    });

    const req = createMockRequest({ name: '' });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = validateRequest(schema);
    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(jsonCall).toMatchObject({
      error: 'Validation Error',
      details: expect.arrayContaining([
        expect.objectContaining({
          path: ['body', 'name'],
          message: expect.stringContaining('String must contain at least 1 character(s)'),
        }),
      ]),
    });
    expect(jsonCall?.timestamp).toBeDefined();
    expect(new Date(jsonCall?.timestamp).toISOString()).toBe(jsonCall?.timestamp);
  });

  it('should validate params correctly', () => {
    const schema = z.object({
      params: z.object({ id: z.string().uuid() }),
    });

    const req = createMockRequest({}, { id: 'not-a-uuid' });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = validateRequest(schema);
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
  });

  it('should validate query correctly', () => {
    const schema = z.object({
      query: z.object({ page: z.coerce.number().min(1) }),
    });

    const req = createMockRequest({}, {}, { page: '0' });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = validateRequest(schema);
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
  });

  it('should handle multiple validation errors', () => {
    const schema = z.object({
      body: z.object({
        name: z.string().min(1),
        email: z.string().email(),
        age: z.number().min(0),
      }),
    });

    const req = createMockRequest({ name: '', email: 'invalid', age: -1 });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = validateRequest(schema);
    middleware(req, res, next);

    const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(jsonCall?.details?.length).toBeGreaterThanOrEqual(1);
  });

  it('should call next with error for non-Zod errors', () => {
    const schema = z.object({
      body: z.object({ test: z.string() }),
    });

    const req = createMockRequest({ test: 'value' });
    const res = createMockResponse();
    const next = createMockNext();

    vi.spyOn(schema, 'parse').mockImplementation(() => {
      throw new Error('Unexpected error');
    });

    const middleware = validateRequest(schema);
    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Unexpected error',
    }));
  });

  it('should validate nested objects', () => {
    const schema = z.object({
      body: z.object({
        user: z.object({
          name: z.string(),
          settings: z.object({
            theme: z.enum(['light', 'dark']),
          }),
        }),
      }),
    });

    const req = createMockRequest({
      user: { name: 'John', settings: { theme: 'blue' } },
    });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = validateRequest(schema);
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
  });

  it('should handle optional fields correctly', () => {
    const schema = z.object({
      body: z.object({
        name: z.string(),
        description: z.string().optional(),
      }),
    });

    const req = createMockRequest({ name: 'Test' });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = validateRequest(schema);
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
