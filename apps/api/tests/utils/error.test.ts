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

  it('should handle undefined', () => {
    const result = ensureError(undefined);

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('An unknown error occurred');
  });

  it('should handle number', () => {
    const result = ensureError(404);

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('An unknown error occurred');
  });

  it('should preserve stack trace from error-like object', () => {
    const stackTrace = 'Error: test\n    at Test.method (file.ts:1:1)';
    const errorLike = { message: 'Test error', stack: stackTrace };
    const result = ensureError(errorLike);

    expect(result.stack).toBe(stackTrace);
  });

  it('should handle empty object', () => {
    const result = ensureError({});

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('{}');
  });

  it('should handle nested error objects', () => {
    const nestedError = {
      message: 'Outer error',
      inner: { message: 'Inner error' },
    };
    const result = ensureError(nestedError);

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('Outer error');
  });
});
