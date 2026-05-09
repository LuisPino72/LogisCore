import { describe, it, expect } from 'vitest';
import { ERROR_CATALOG, getErrorByCode } from '@/lib/errors';

describe('errors.ts — Catálogo de Errores', () => {
  describe('getErrorByCode — lookup exitoso', () => {
    it('retorna SALE_BOX_CLOSED con metadata correcta', () => {
      const err = getErrorByCode('SALE_BOX_CLOSED');
      expect(err.id).toBe('SALE-001');
      expect(err.code).toBe('SALE_BOX_CLOSED');
      expect(err.severity).toBe('HIGH');
      expect(err.recoverable).toBe(true);
      expect(err.action).toBe('OPEN_CASH_BOX');
      expect(err.module).toBe('SALES');
    });

    it('retorna AUTH_SESSION_EXPIRED como CRITICAL y recoverable', () => {
      const err = getErrorByCode('AUTH_SESSION_EXPIRED');
      expect(err.id).toBe('AUTH-001');
      expect(err.severity).toBe('CRITICAL');
      expect(err.recoverable).toBe(true);
      expect(err.action).toBe('LOGIN_AGAIN');
      expect(err.httpStatus).toBe(401);
    });

    it('retorna DLQ_MAX_RETRIES_EXCEEDED como HIGH y NO recoverable', () => {
      const err = getErrorByCode('DLQ_MAX_RETRIES_EXCEEDED');
      expect(err.id).toBe('DLQ-001');
      expect(err.severity).toBe('HIGH');
      expect(err.recoverable).toBe(false);
    });

    it('retorna INVOICE_ALREADY_ISSUED como HIGH y NO recoverable', () => {
      const err = getErrorByCode('INVOICE_ALREADY_ISSUED');
      expect(err.id).toBe('INVC-005');
      expect(err.severity).toBe('HIGH');
      expect(err.recoverable).toBe(false);
    });
  });

  describe('getErrorByCode — fallback', () => {
    it('retorna UNKNOWN-000 para código inexistente', () => {
      const err = getErrorByCode('MADE_UP_ERROR');
      expect(err.id).toBe('UNKNOWN-000');
      expect(err.severity).toBe('CRITICAL');
      expect(err.recoverable).toBe(false);
      expect(err.action).toBe('CONTACT_SUPPORT');
      expect(err.httpStatus).toBe(500);
      expect(err.module).toBe('UNKNOWN');
    });
  });

  describe('ERROR_CATALOG — cobertura de errores', () => {
    it('contiene todos los módulos principales', () => {
      const modules = new Set(Object.values(ERROR_CATALOG).map(e => e.module));
      expect(modules.has('AUTH')).toBe(true);
      expect(modules.has('SALES')).toBe(true);
      expect(modules.has('INVOICING')).toBe(true);
      expect(modules.has('INVENTORY')).toBe(true);
      expect(modules.has('SECURITY')).toBe(true);
      expect(modules.has('SYNC')).toBe(true);
    });

    it('SALE tiene >= 28 errores', () => {
      const saleErrors = Object.values(ERROR_CATALOG).filter(e => e.module === 'SALES');
      expect(saleErrors.length).toBeGreaterThanOrEqual(28);
    });

    it('INVOICING tiene >= 20 errores', () => {
      const invcErrors = Object.values(ERROR_CATALOG).filter(e => e.module === 'INVOICING');
      expect(invcErrors.length).toBeGreaterThanOrEqual(20);
    });

    it('todos los errores tienen message no vacío', () => {
      for (const [code, err] of Object.entries(ERROR_CATALOG)) {
        expect(err.message.length, `Error: ${code} sin mensaje`).toBeGreaterThan(0);
      }
    });

    it('todos los errores tienen id con formato MODULO-NNN', () => {
      for (const [code, err] of Object.entries(ERROR_CATALOG)) {
        expect(err.id, `Error: ${code} con id inválido: ${err.id}`).toMatch(/^[A-Z]+-\d{3}$/);
      }
    });
  });

  describe('inferencia de severidad', () => {
    it('AUTH con TOKEN es CRITICAL', () => {
      const err = getErrorByCode('AUTH_TOKEN_INVALID');
      expect(err.severity).toBe('CRITICAL');
    });

    it('AUTH_SCOPE_DENIED es HIGH (no es crítico)', () => {
      const err = getErrorByCode('AUTH_SCOPE_DENIED');
      expect(err.severity).toBe('HIGH');
    });

    it('FISCAL_INVOICE_IMMUTABLE es HIGH', () => {
      const err = getErrorByCode('FISCAL_INVOICE_IMMUTABLE');
      expect(err.severity).toBe('HIGH');
    });

    it('PRODUCT_NOT_FOUND es MEDIUM', () => {
      const err = getErrorByCode('PRODUCT_NOT_FOUND');
      expect(err.severity).toBe('MEDIUM');
    });

    it('SALE_TOTALS_MISMATCH es HIGH (módulo SALES)', () => {
      const err = getErrorByCode('SALE_TOTALS_MISMATCH');
      expect(err.severity).toBe('HIGH');
    });
  });

  describe('inferencia de recoverability', () => {
    it('SYNC_CONFLICT es recoverable', () => {
      const err = getErrorByCode('SYNC_CONFLICT');
      expect(err.recoverable).toBe(true);
    });

    it('PRODUCT_NOT_FOUND NO es recoverable', () => {
      const err = getErrorByCode('PRODUCT_NOT_FOUND');
      expect(err.recoverable).toBe(false);
    });

    it('SALE_BOX_CLOSED es recoverable', () => {
      const err = getErrorByCode('SALE_BOX_CLOSED');
      expect(err.recoverable).toBe(true);
    });
  });
});
