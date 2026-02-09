import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redis } from '../../lib/redis.js';
import { 
  acquireUserSlot, 
  releaseUserSlot, 
  getUserConcurrency,
  withUserSlot 
} from '../../services/concurrency.service.js';

vi.mock('../../lib/redis.js', () => ({
  redis: {
    eval: vi.fn(),
    get: vi.fn()
  }
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

describe('ConcurrencyService', () => {
  const mockUserId = 'user-123';
  const MAX_CONCURRENT_PER_USER = 2;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('acquireUserSlot', () => {
    it('should acquire slot successfully when under limit', async () => {
      vi.mocked(redis.eval).mockResolvedValue(1);

      const result = await acquireUserSlot(mockUserId);

      expect(result).toBe(true);
      expect(redis.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call(\'INCR\', key)'),
        1,
        `user:concurrency:${mockUserId}`,
        MAX_CONCURRENT_PER_USER,
        300
      );
    });

    it('should acquire slot when at limit but not over', async () => {
      vi.mocked(redis.eval).mockResolvedValue(MAX_CONCURRENT_PER_USER);

      const result = await acquireUserSlot(mockUserId);

      expect(result).toBe(true);
    });

    it('should reject when over concurrency limit and log warning', async () => {
      vi.mocked(redis.eval).mockResolvedValue(0);
      vi.mocked(redis.get).mockResolvedValue('3');
      const { logger } = await import('../../utils/logger.js');

      const result = await acquireUserSlot(mockUserId);

      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          current: 3,
          max: MAX_CONCURRENT_PER_USER
        }),
        'User at max concurrency, request rejected'
      );
    });


    it('should fail closed when Redis eval fails', async () => {
      vi.mocked(redis.eval).mockRejectedValue(new Error('Redis connection failed'));

      const result = await acquireUserSlot(mockUserId);

      expect(result).toBe(false);
    });

    it('should fail closed on network timeout', async () => {
      vi.mocked(redis.eval).mockRejectedValue(new Error('ETIMEDOUT'));

      const result = await acquireUserSlot(mockUserId);

      expect(result).toBe(false);
    });

    it('should fail closed on Redis unavailable', async () => {
      vi.mocked(redis.eval).mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await acquireUserSlot(mockUserId);

      expect(result).toBe(false);
    });
  });

  describe('releaseUserSlot', () => {
    it('should release slot successfully', async () => {
      vi.mocked(redis.eval).mockResolvedValue(1);

      await releaseUserSlot(mockUserId);

      expect(redis.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call(\'DECR\', key)'),
        1,
        `user:concurrency:${mockUserId}`
      );
    });

    it('should handle Redis errors gracefully', async () => {
      vi.mocked(redis.eval).mockRejectedValue(new Error('Redis connection failed'));

      await expect(releaseUserSlot(mockUserId)).resolves.not.toThrow();
    });
  });

  describe('getUserConcurrency', () => {
    it('should return current concurrency count', async () => {
      vi.mocked(redis.get).mockResolvedValue('2');

      const count = await getUserConcurrency(mockUserId);

      expect(count).toBe(2);
      expect(redis.get).toHaveBeenCalledWith(`user:concurrency:${mockUserId}`);
    });

    it('should return 0 when key does not exist', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);

      const count = await getUserConcurrency(mockUserId);

      expect(count).toBe(0);
    });

    it('should return 0 for invalid count string', async () => {
      vi.mocked(redis.get).mockResolvedValue('invalid');

      const count = await getUserConcurrency(mockUserId);

      expect(count).toBe(0);
    });
  });

  describe('withUserSlot', () => {
    it('should execute function when slot is acquired', async () => {
      vi.mocked(redis.eval).mockResolvedValue(1);

      const mockFn = vi.fn().mockResolvedValue('result');
      const result = await withUserSlot(mockUserId, mockFn);

      expect(result).toBe('result');
      expect(mockFn).toHaveBeenCalled();
      expect(redis.eval).toHaveBeenCalledTimes(2);
    });

    it('should throw error when slot cannot be acquired', async () => {
      vi.mocked(redis.eval).mockResolvedValue(0);

      const mockFn = vi.fn();

      await expect(withUserSlot(mockUserId, mockFn)).rejects.toThrow(
        'Too many concurrent requests. Please wait and try again.'
      );
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should release slot even if function throws', async () => {
      vi.mocked(redis.eval).mockResolvedValue(1);

      const mockFn = vi.fn().mockRejectedValue(new Error('Function failed'));

      await expect(withUserSlot(mockUserId, mockFn)).rejects.toThrow('Function failed');
      expect(redis.eval).toHaveBeenCalledTimes(2);
    });

    it('should throw error when Redis is unavailable (fail closed)', async () => {
      vi.mocked(redis.eval).mockRejectedValue(new Error('Redis connection failed'));

      const mockFn = vi.fn();

      await expect(withUserSlot(mockUserId, mockFn)).rejects.toThrow(
        'Too many concurrent requests. Please wait and try again.'
      );
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should propagate function return value', async () => {
      vi.mocked(redis.eval).mockResolvedValue(1);

      const complexResult = { data: [1, 2, 3], status: 'success' };
      const mockFn = vi.fn().mockResolvedValue(complexResult);
      
      const result = await withUserSlot(mockUserId, mockFn);

      expect(result).toEqual(complexResult);
    });
  });

  describe('concurrency limit enforcement', () => {
    it('should allow up to MAX_CONCURRENT_PER_USER simultaneous requests', async () => {
      let currentCount = 0;
      vi.mocked(redis.eval).mockImplementation(async () => {
        currentCount++;
        return currentCount <= MAX_CONCURRENT_PER_USER ? currentCount : 0;
      });

      const result1 = await acquireUserSlot(mockUserId);
      const result2 = await acquireUserSlot(mockUserId);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });

    it('should reject third concurrent request', async () => {
      vi.mocked(redis.eval).mockResolvedValue(0);

      const result = await acquireUserSlot(mockUserId);

      expect(result).toBe(false);
    });
  });
});
