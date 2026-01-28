import { describe, it, expect, vi } from 'vitest';
import type { Response } from 'express';
import { sendError, sendSuccess } from '../../utils/response.js';
import { HttpStatus } from '../../utils/constants.js';

describe('response utils', () => {
  interface MockResponse {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  }

  const createMockResponse = (): MockResponse & Response => {
    return {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as MockResponse & Response;
  };

  describe('sendError', () => {
    it('should send error response with correct status', () => {
      const res = createMockResponse();
      const errorMessage = 'Something went wrong';

      sendError(res, HttpStatus.BAD_REQUEST, errorMessage);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      const jsonCall = res.json.mock.calls[0]?.[0];
      expect(jsonCall).toMatchObject({
        error: errorMessage,
      });
      expect(jsonCall?.timestamp).toBeDefined();
      expect(new Date(jsonCall?.timestamp).toISOString()).toBe(jsonCall?.timestamp);
    });

    it('should send 500 error', () => {
      const res = createMockResponse();

      sendError(res, HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error');

      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('should send 404 error', () => {
      const res = createMockResponse();

      sendError(res, HttpStatus.NOT_FOUND, 'Not found');

      expect(res.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    });

    it('should include valid ISO timestamp', () => {
      const res = createMockResponse();

      sendError(res, HttpStatus.UNAUTHORIZED, 'Unauthorized');

      const jsonCall = res.json.mock.calls[0]?.[0];
      expect(jsonCall?.timestamp).toBeDefined();
      expect(new Date(jsonCall?.timestamp).toISOString()).toBe(jsonCall?.timestamp);
    });
  });

  describe('sendSuccess', () => {
    it('should send success response with data', () => {
      const res = createMockResponse();
      const data = { id: '123', name: 'Test' };

      sendSuccess(res, HttpStatus.OK, 'Success', data);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      const jsonCall = res.json.mock.calls[0]?.[0];
      expect(jsonCall).toMatchObject({
        message: 'Success',
        data,
      });
      expect(jsonCall?.timestamp).toBeDefined();
      expect(new Date(jsonCall?.timestamp).toISOString()).toBe(jsonCall?.timestamp);
    });

    it('should send success response without data', () => {
      const res = createMockResponse();

      sendSuccess(res, HttpStatus.CREATED, 'Created');

      expect(res.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      const jsonCall = res.json.mock.calls[0]?.[0];
      expect(jsonCall).toMatchObject({
        message: 'Created',
        data: undefined,
      });
      expect(jsonCall?.timestamp).toBeDefined();
      expect(new Date(jsonCall?.timestamp).toISOString()).toBe(jsonCall?.timestamp);
    });

    it('should send 201 created response', () => {
      const res = createMockResponse();

      sendSuccess(res, HttpStatus.CREATED, 'Resource created', { id: 'new-id' });

      expect(res.status).toHaveBeenCalledWith(HttpStatus.CREATED);
    });

    it('should handle null data', () => {
      const res = createMockResponse();

      sendSuccess(res, HttpStatus.OK, 'Success', null);

      const jsonCall = res.json.mock.calls[0]?.[0];
      expect(jsonCall).toMatchObject({
        message: 'Success',
        data: null,
      });
      expect(jsonCall?.timestamp).toBeDefined();
      expect(new Date(jsonCall?.timestamp).toISOString()).toBe(jsonCall?.timestamp);
    });

    it('should handle array data', () => {
      const res = createMockResponse();
      const data = [{ id: 1 }, { id: 2 }];

      sendSuccess(res, HttpStatus.OK, 'List retrieved', data);

      const jsonCall = res.json.mock.calls[0]?.[0];
      expect(jsonCall).toMatchObject({
        message: 'List retrieved',
        data,
      });
      expect(jsonCall?.timestamp).toBeDefined();
      expect(new Date(jsonCall?.timestamp).toISOString()).toBe(jsonCall?.timestamp);
    });
  });
});
