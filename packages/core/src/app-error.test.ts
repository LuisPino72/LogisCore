import { describe, it, expect } from 'vitest';
import { AppError, createAppError, isAppError } from './app-error';

describe('AppError', () => {
  describe('constructor', () => {
    it('creates instance with code and message', () => {
      const error = new AppError('TEST_CODE', 'Test error message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.message).toBe('Test error message');
      expect(error.module).toBe('TEST');
    });

    it('includes statusCode when provided', () => {
      const error = new AppError('TEST_CODE', 'Test error', { statusCode: 404 });
      expect(error.statusCode).toBe(404);
    });

    it('includes details when provided', () => {
      const error = new AppError('TEST_CODE', 'Test error', { details: { foo: 'bar' } });
      expect(error.details).toEqual({ foo: 'bar' });
    });
  });

  describe('toJSON()', () => {
    it('serializes all properties', () => {
      const error = new AppError('TEST_CODE', 'Test error', { statusCode: 500 });
      const json = error.toJSON();
      expect(json.code).toBe('TEST_CODE');
      expect(json.message).toBe('Test error');
      expect(json.module).toBe('TEST');
      expect(json.statusCode).toBe(500);
      expect(json.timestamp).toBeDefined();
    });
  });

  describe('createAppError(input)', () => {
    it('creates AppError from input object', () => {
      const error = createAppError({ code: 'CODE', message: 'Message' });
      expect(error.code).toBe('CODE');
      expect(error.message).toBe('Message');
    });

    it('handles input with details', () => {
      const error = createAppError({ code: 'CODE', message: 'Message', details: { key: 'value' } });
      expect(error.details).toEqual({ key: 'value' });
    });
  });

  describe('isAppError(error)', () => {
    it('returns true for AppError instance', () => {
      const error = new AppError('CODE', 'Message');
      expect(isAppError(error)).toBe(true);
    });

    it('returns false for regular Error', () => {
      const error = new Error('Regular error');
      expect(isAppError(error)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isAppError(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isAppError(undefined)).toBe(false);
    });

    it('returns false for plain object', () => {
      expect(isAppError({ code: 'CODE' })).toBe(false);
    });
  });
});