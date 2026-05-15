/**
 * Exchange Rate BDD Tests - EXCH-001..004
 */

import { describe, it, expect } from 'vitest';
import { validateExchangeRateInput } from '../../specs/exchange-rate';

describe('EXCH-001/002: Validacion de input de tasa', () => {
  it('Given: Input { rate: 485.00 } valido', () => {
    const result = validateExchangeRateInput({ rate: 485.00 });
    expect(result.rate).toBe(485.00);
  });

  it('Given: rate=0 debe lanzar error', () => {
    expect(() => validateExchangeRateInput({ rate: 0 })).toThrow();
  });

  it('Given: rate negativo debe lanzar error', () => {
    expect(() => validateExchangeRateInput({ rate: -1 })).toThrow();
  });

  it('Given: rate nulo debe lanzar error', () => {
    expect(() => validateExchangeRateInput({ rate: null })).toThrow();
  });
});

describe('EXCH-003: Ingreso manual', () => {
  it('Given: Input { rate: 485.00 } pasa validacion', () => {
    const input = { rate: 485.00 };
    const result = validateExchangeRateInput(input);
    expect(result.rate).toBe(485.00);
  });
});

describe('EXCH-004: Validacion de tasa', () => {
  it('Given: rate definido y > 0 pasa', () => {
    expect(() => validateExchangeRateInput({ rate: 100 })).not.toThrow();
  });

  it('Given: rate indefinido falla', () => {
    expect(() => validateExchangeRateInput({} as never)).toThrow();
  });
});