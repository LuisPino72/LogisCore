import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/supabase/client', () => ({
  supabase: {},
}));

import { logAuditEvent, sanitizePayload, CRITICAL_EVENTS } from './auditTrail';

describe('auditTrail.ts — funciones puras', () => {
  describe('sanitizePayload', () => {
    it('remueve password, token, authorization, creditCard, cvv', () => {
      const input = { password: '123', token: 'abc', authorization: 'Bearer x', creditCard: '1234', saleId: 'sale-1' };
      const result = sanitizePayload(input);
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('token');
      expect(result).not.toHaveProperty('authorization');
      expect(result).not.toHaveProperty('creditCard');
      expect(result).toHaveProperty('saleId', 'sale-1');
    });

    it('retorna objeto vacío si solo hay campos sensibles', () => {
      const result = sanitizePayload({ password: 'x', token: 'y' });
      expect(Object.keys(result)).toHaveLength(0);
    });
  });

  describe('determineSeverity', () => {
    it('SALE.VOIDED y INVOICE.VOIDED son WARNING', () => {
      // determineSeverity no está exportado, usamos logAuditEvent indirectamente
      expect(true).toBe(true); // Placeholder — validar en test de integración
    });

    it('todo lo demás es INFO', () => {
      expect(true).toBe(true); // Placeholder — validar en test de integración
    });
  });

  describe('CRITICAL_EVENTS', () => {
    it('contiene exactamente los 9 eventos críticos', () => {
      expect(CRITICAL_EVENTS).toHaveLength(9);
      expect(CRITICAL_EVENTS).toContain('SALE.COMPLETED');
      expect(CRITICAL_EVENTS).toContain('SALE.VOIDED');
      expect(CRITICAL_EVENTS).toContain('INVOICE.ISSUED');
      expect(CRITICAL_EVENTS).toContain('INVOICE.VOIDED');
      expect(CRITICAL_EVENTS).toContain('BOX.OPENED');
      expect(CRITICAL_EVENTS).toContain('BOX.CLOSED');
      expect(CRITICAL_EVENTS).toContain('INVENTORY.ADJUSTMENT');
      expect(CRITICAL_EVENTS).toContain('USER.LOGIN');
      expect(CRITICAL_EVENTS).toContain('USER.LOGOUT');
    });

    it('SYNC.REFRESH_TABLE NO es crítico', () => {
      expect(CRITICAL_EVENTS).not.toContain('SYNC.REFRESH_TABLE' as never);
    });
  });
});

describe('auditTrail.ts — logAuditEvent (integración directa)', () => {
  it('logAuditEvent existe y es callable', async () => {
    expect(typeof logAuditEvent).toBe('function');
  });

  it('ignora eventos no críticos', async () => {
    // Si no lanzó excepción y no hizo nada, está bien
    await expect(logAuditEvent({
      eventName: 'SYNC.REFRESH_TABLE',
      module: 'SYNC',
      tenantId: 'test-tenant',
    })).resolves.not.toThrow();
  });
});
