import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import { db } from '@edward/auth';
import {
  getApiKey,
  createApiKey,
  updateApiKey,
  deleteApiKey,
} from '../../controllers/apiKey.controller.js';
import * as apiKeyService from '../../services/apiKey.service.js';
import * as encryption from '../../utils/encryption.js';
import type { AuthenticatedRequest } from '../../middleware/auth.js';
import { HttpStatus } from '../../utils/constants.js';

vi.mock('@edward/auth', async () => {
  const actual = await vi.importActual<typeof import('@edward/auth')>('@edward/auth');
  return {
    ...actual,
    db: {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'user-123' }]),
    },
    user: {},
    eq: vi.fn(),
  };
});

vi.mock('../../services/apiKey.service.js', () => ({
  getUserWithApiKey: vi.fn(),
}));

vi.mock('../../utils/encryption.js', () => ({
  encrypt: vi.fn().mockReturnValue('encrypted-key'),
  decrypt: vi.fn().mockReturnValue('sk-proj-original-key'),
}));

describe('apiKey controller', () => {
  const mockUserId = 'user-123';
  const mockEncryptedKey = 'encrypted-key-data';

  const createMockRequest = (body = {}, userId = mockUserId): AuthenticatedRequest => {
    return {
      body,
      userId,
    } as AuthenticatedRequest;
  };

  const createMockResponse = () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    return res;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getApiKey', () => {
    it('should return API key status when key exists', async () => {
      const mockUserData = {
        id: mockUserId,
        apiKey: mockEncryptedKey,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      };

      vi.mocked(apiKeyService.getUserWithApiKey).mockResolvedValue(mockUserData);
      vi.mocked(encryption.decrypt).mockReturnValue('sk-proj-1234567890abcdef');

      const req = createMockRequest();
      const res = createMockResponse();

      await getApiKey(req, res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(jsonCall).toMatchObject({
        message: 'API key status retrieved successfully',
        data: {
          hasApiKey: true,
          keyPreview: 'sk-proj...cdef',
          userId: mockUserId,
          createdAt: mockUserData.createdAt,
          updatedAt: mockUserData.updatedAt,
        },
      });
      expect(jsonCall?.timestamp).toBeDefined();
      expect(new Date(jsonCall?.timestamp).toISOString()).toBe(jsonCall?.timestamp);
    });

    it('should return no key status when API key not set', async () => {
      const mockUserData = {
        id: mockUserId,
        apiKey: null,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      };

      vi.mocked(apiKeyService.getUserWithApiKey).mockResolvedValue(mockUserData);

      const req = createMockRequest();
      const res = createMockResponse();

      await getApiKey(req, res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(jsonCall).toMatchObject({
        message: 'No API key found',
        data: {
          hasApiKey: false,
          userId: mockUserId,
          createdAt: mockUserData.createdAt,
          updatedAt: mockUserData.updatedAt,
        },
      });
      expect(jsonCall?.timestamp).toBeDefined();
      expect(new Date(jsonCall?.timestamp).toISOString()).toBe(jsonCall?.timestamp);
    });

    it('should handle decryption errors gracefully', async () => {
      const mockUserData = {
        id: mockUserId,
        apiKey: 'corrupted-key',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(apiKeyService.getUserWithApiKey).mockResolvedValue(mockUserData);
      vi.mocked(encryption.decrypt).mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await getApiKey(req, res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(jsonCall?.data?.hasApiKey).toBe(true);
      expect(jsonCall?.data?.keyPreview).toBeUndefined();
    });

    it('should return 500 on service error', async () => {
      vi.mocked(apiKeyService.getUserWithApiKey).mockRejectedValue(new Error('DB error'));

      const req = createMockRequest();
      const res = createMockResponse();

      await getApiKey(req, res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  describe('createApiKey', () => {
    it('should create new API key', async () => {
      const mockUserData = {
        id: mockUserId,
        apiKey: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(apiKeyService.getUserWithApiKey).mockResolvedValue(mockUserData);
      vi.mocked(db.returning).mockResolvedValue([{ id: mockUserId }]);

      const req = createMockRequest({ apiKey: 'sk-proj-valid-key-12345678901234567890' });
      const res = createMockResponse();

      await createApiKey(req, res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(jsonCall).toMatchObject({
        message: 'API key created successfully',
        data: {
          userId: mockUserId,
          keyPreview: 'sk-proj...7890',
        },
      });
      expect(jsonCall?.timestamp).toBeDefined();
      expect(new Date(jsonCall?.timestamp).toISOString()).toBe(jsonCall?.timestamp);
    });

    it('should return 400 for invalid API key format', async () => {
      const req = createMockRequest({ apiKey: 'short' });
      const res = createMockResponse();

      await createApiKey(req, res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    });

    it('should return 404 when user not found', async () => {
      vi.mocked(apiKeyService.getUserWithApiKey).mockResolvedValue(undefined);

      const req = createMockRequest({ apiKey: 'sk-proj-valid-key-12345678901234567890' });
      const res = createMockResponse();

      await createApiKey(req, res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    });

    it('should return 409 when API key already exists', async () => {
      const mockUserData = {
        id: mockUserId,
        apiKey: 'existing-key',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(apiKeyService.getUserWithApiKey).mockResolvedValue(mockUserData);

      const req = createMockRequest({ apiKey: 'sk-proj-valid-key-12345678901234567890' });
      const res = createMockResponse();

      await createApiKey(req, res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    });
  });

  describe('updateApiKey', () => {
    it('should update existing API key', async () => {
      const mockUserData = {
        id: mockUserId,
        apiKey: 'old-key',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(apiKeyService.getUserWithApiKey).mockResolvedValue(mockUserData);
      vi.mocked(db.returning).mockResolvedValue([{ id: mockUserId }]);

      const req = createMockRequest({ apiKey: 'sk-proj-new-key-12345678901234567890' });
      const res = createMockResponse();

      await updateApiKey(req, res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(jsonCall).toMatchObject({
        message: 'API key updated successfully',
        data: {
          userId: mockUserId,
          keyPreview: 'sk-proj...7890',
        },
      });
      expect(jsonCall?.timestamp).toBeDefined();
      expect(new Date(jsonCall?.timestamp).toISOString()).toBe(jsonCall?.timestamp);
    });

    it('should return 400 for invalid API key', async () => {
      const req = createMockRequest({ apiKey: '' });
      const res = createMockResponse();

      await updateApiKey(req, res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    });

    it('should return 404 when user not found', async () => {
      vi.mocked(apiKeyService.getUserWithApiKey).mockResolvedValue(undefined);

      const req = createMockRequest({ apiKey: 'sk-proj-valid-key-12345678901234567890' });
      const res = createMockResponse();

      await updateApiKey(req, res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    });
  });

  describe('deleteApiKey', () => {
    it('should delete API key', async () => {
      const mockUserData = {
        id: mockUserId,
        apiKey: 'existing-key',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(apiKeyService.getUserWithApiKey).mockResolvedValue(mockUserData);
      vi.mocked(db.returning).mockResolvedValue([{ id: mockUserId }]);

      const req = createMockRequest();
      const res = createMockResponse();

      await deleteApiKey(req, res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(jsonCall).toMatchObject({
        message: 'API key deleted successfully',
      });
      expect(jsonCall?.timestamp).toBeDefined();
      expect(new Date(jsonCall?.timestamp).toISOString()).toBe(jsonCall?.timestamp);
    });

    it('should return 404 when user not found', async () => {
      vi.mocked(apiKeyService.getUserWithApiKey).mockResolvedValue(undefined);

      const req = createMockRequest();
      const res = createMockResponse();

      await deleteApiKey(req, res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    });
  });
});
