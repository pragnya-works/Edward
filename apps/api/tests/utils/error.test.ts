import { describe, it, expect } from 'vitest';
import { ensureError } from '../../utils/error.js';

describe('ensureError', () => {
  it('should return the same error if input is an Error instance', () => {
    const originalError = new Error('Original error');
    const result = ensureError(originalError);

    expect(result).toBe(originalError);
    expect(result.message).toBe('Original error');
  });

  it('should create Error from string', () => {
    const result = ensureError('String error message');

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('String error message');
  });

  it('should create Error from object with message property', () => {
    const errorLike = { message: 'Object error message', stack: 'stack trace' };
    const result = ensureError(errorLike);

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('Object error message');
    expect(result.stack).toBe('stack trace');
  });

  it('should create Error from object without message property', () => {
    const errorLike = { code: 500, status: 'error' };
    const result = ensureError(errorLike);

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('{"code":500,"status":"error"}');
  });

  it('should handle null', () => {
    const result = ensureError(null);

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('An unknown error occurred');
  });
});
