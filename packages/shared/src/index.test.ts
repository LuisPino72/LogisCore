import { describe, it, expect } from 'vitest';
import { validateRif, calculateIGTF, preciseRound } from './index';

describe('LogisCore Shared Package', () => {
  it('validateRif - valid RIF', () => {
    const result = validateRif('V123456789');
    expect(result.isValid).toBe(true);
    expect(result.rif).toBe('V123456789');
  });

  it('validateRif - invalid RIF', () => {
    const result = validateRif('X123456789');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('RIF_INVALID');
  });

  it('validateRif - missing RIF', () => {
    const result = validateRif(null);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('MISSING_RIF');
  });

  it('calculateIGTF - 3% on USD payments', () => {
    const igtf = calculateIGTF(100, 90);
    expect(igtf).toBe(270);
  });

  it('preciseRound - 2 decimals', () => {
    expect(preciseRound(10.567)).toBe(10.57);
  });
});
