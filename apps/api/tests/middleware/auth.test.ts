import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import { authMiddleware, getAuthenticatedUserId, type AuthenticatedRequest } from '../../middleware/auth.js';
import { HttpStatus } from '../../utils/constants.js';
import { auth } from '@edward/auth';

vi.mock('@edward/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

describe('auth middleware', () => {
  const createMockResponse = () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    return res;
  };

  const createMockRequest = (headers = {}, method = 'GET'): AuthenticatedRequest => {
    return {
      headers,
      method,
    } as AuthenticatedRequest;
  };

  const createMockNext = () => vi.fn() as NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authMiddleware', () => {
    it('should call next() for OPTIONS requests', async () => {
      const req = createMockRequest({}, 'OPTIONS');
      const res = createMockResponse();
      const next = createMockNext();

      await authMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 401 when no session exists', async () => {
      const req = createMockRequest({ authorization: 'Bearer invalid' });
      const res = createMockResponse();
      const next = createMockNext();

      vi.mocked(auth.api.getSession).mockResolvedValue(null);

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(jsonCall).toMatchObject({
        error: 'Unauthorized',
      });
      expect(jsonCall?.timestamp).toBeDefined();
      expect(new Date(jsonCall?.timestamp).toISOString()).toBe(jsonCall?.timestamp);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when session exists but no user', async () => {
      const req = createMockRequest({ authorization: 'Bearer token' });
      const res = createMockResponse();
      const next = createMockNext();

      vi.mocked(auth.api.getSession).mockResolvedValue({
        session: { id: 'session-123' },
        user: null,
      } as never);

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    });

    it('should set userId and sessionId on request when authenticated', async () => {
      const req = createMockRequest({ authorization: 'Bearer valid-token' });
      const res = createMockResponse();
      const next = createMockNext();

      vi.mocked(auth.api.getSession).mockResolvedValue({
        session: { id: 'session-123' },
        user: { id: 'user-123' },
      } as never);

      await authMiddleware(req, res, next);

      expect(req.userId).toBe('user-123');
      expect(req.sessionId).toBe('session-123');
      expect(next).toHaveBeenCalled();
    });

    it('should return 401 when getSession throws error', async () => {
      const req = createMockRequest({});
      const res = createMockResponse();
      const next = createMockNext();

      vi.mocked(auth.api.getSession).mockRejectedValue(new Error('Auth error'));

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(next).not.toHaveBeenCalled();
    });

    it('should pass headers to getSession', async () => {
      const headers = { authorization: 'Bearer test-token', 'content-type': 'application/json' };
      const req = createMockRequest(headers);
      const res = createMockResponse();
      const next = createMockNext();

      vi.mocked(auth.api.getSession).mockResolvedValue({
        session: { id: 'session-123' },
        user: { id: 'user-123' },
      } as never);

      await authMiddleware(req, res, next);

      expect(auth.api.getSession).toHaveBeenCalledWith({ headers });
    });
  });

  describe('getAuthenticatedUserId', () => {
    it('should return userId when present', () => {
      const req = { userId: 'user-123' } as AuthenticatedRequest;

      const result = getAuthenticatedUserId(req);

      expect(result).toBe('user-123');
    });

    it('should throw error when userId is missing', () => {
      const req = {} as AuthenticatedRequest;

      expect(() => getAuthenticatedUserId(req)).toThrow(
        "Context Error: req.userId is missing. Ensure 'authMiddleware' is applied to this route."
      );
    });

    it('should throw error when userId is empty string', () => {
      const req = { userId: '' } as AuthenticatedRequest;

      expect(() => getAuthenticatedUserId(req)).toThrow();
    });
  });
});
