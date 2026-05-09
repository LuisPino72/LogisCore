import { describe, it, expect } from 'vitest';
import { success, failure, isSuccess, isFailure, Result } from './result';
import { AppError } from './app-error';

describe('Result<T, E>', () => {
  describe('success(data)', () => {
    it('returns { ok: true, data }', () => {
      const result = success<{ name: string }>({ name: 'test' });
      expect(result.ok).toBe(true);
      expect((result as any).data).toEqual({ name: 'test' });
    });
  });

  describe('failure(error)', () => {
    it('returns { ok: false, error }', () => {
      const testError = new AppError('TEST_ERROR', 'Test error');
      const result = failure<AppError>(testError);
      result satisfies Result<never, AppError>;
      expect(result.ok).toBe(false);
      expect((result as any).error).toEqual(testError);
    });
  });

  describe('isSuccess(result)', () => {
    it('returns true when result.ok is true', () => {
      const result = success({ id: 1 });
      expect(isSuccess(result)).toBe(true);
    });

    it('returns false when result.ok is false', () => {
      const testError = new AppError('ERR', '');
      const result = failure(testError);
      expect(isSuccess(result)).toBe(false);
    });
  });

  describe('isFailure(result)', () => {
    it('returns true when result.ok is false', () => {
      const testError = new AppError('ERR', '');
      const result = failure(testError);
      expect(isFailure(result)).toBe(true);
    });

    it('returns false when result.ok is true', () => {
      const result = success({ id: 1 });
      expect(isFailure(result)).toBe(false);
    });
  });

  describe('TypeScript discriminated union', () => {
    it('narrowing works in conditional', () => {
      const result = success('hello');
      if (isSuccess(result)) {
        expect(typeof (result as any).data).toBe('string');
      }
    });
  });
});