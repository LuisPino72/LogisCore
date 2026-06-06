// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { extractRole, extractTenantId, isJWTExpired, decodeJWTPayload } from '../../lib/jwt';

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.mock-signature`;
}

const NOW = 1_700_000_000_000;

describe('LOGIN-001-11 jwt.ts: extractRole / extractTenantId / isJWTExpired (escenario 18 + cobertura)', () => {
  describe('decodeJWTPayload', () => {
    it('Given: JWT bien formado. When: decodeJWTPayload. Then: retorna el payload', () => {
      const token = makeJwt({ role: 'owner', tenant_id: 'tid-1' });
      const decoded = decodeJWTPayload(token);
      expect(decoded.role).toBe('owner');
      expect(decoded.tenant_id).toBe('tid-1');
    });

    it('Given: JWT malformado (1 parte). When: decodeJWTPayload. Then: retorna {} sin lanzar', () => {
      expect(decodeJWTPayload('not-a-jwt')).toEqual({});
    });

    it('Given: JWT malformado (payload no base64). When: decodeJWTPayload. Then: retorna {} sin lanzar', () => {
      expect(decodeJWTPayload('header.!@#$.signature')).toEqual({});
    });

    it('Given: string vacío. When: decodeJWTPayload. Then: retorna {} sin lanzar', () => {
      expect(decodeJWTPayload('')).toEqual({});
    });
  });

  describe('isJWTExpired (escenario 18: > en vez de >=)', () => {
    it('Given: JWT con exp en el futuro. When: isJWTExpired. Then: retorna false', () => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW);
      const token = makeJwt({ exp: Math.floor(NOW / 1000) + 3600 });
      expect(isJWTExpired(token)).toBe(false);
      vi.restoreAllMocks();
    });

    it('Given: JWT con exp en el pasado. When: isJWTExpired. Then: retorna true', () => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW);
      const token = makeJwt({ exp: Math.floor(NOW / 1000) - 3600 });
      expect(isJWTExpired(token)).toBe(true);
      vi.restoreAllMocks();
    });

    it('Given: JWT con exp = Date.now() exacto (frame). When: isJWTExpired. Then: retorna false (NO expired, post Sprint 3)', () => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW);
      const token = makeJwt({ exp: NOW / 1000 });
      expect(isJWTExpired(token)).toBe(false);
      vi.restoreAllMocks();
    });

    it('Given: JWT con exp = Date.now() + 1ms. When: isJWTExpired. Then: retorna true al siguiente frame', () => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW + 1);
      const token = makeJwt({ exp: NOW / 1000 });
      expect(isJWTExpired(token)).toBe(true);
      vi.restoreAllMocks();
    });

    it('Given: JWT sin claim exp. When: isJWTExpired. Then: retorna false', () => {
      const token = makeJwt({ role: 'owner' });
      expect(isJWTExpired(token)).toBe(false);
    });

    it('Given: JWT malformado. When: isJWTExpired. Then: retorna false (sin lanzar)', () => {
      expect(isJWTExpired('not-a-jwt')).toBe(false);
    });
  });

  describe('extractRole', () => {
    it('Given: session null. When: extractRole. Then: retorna null', () => {
      expect(extractRole(null)).toBeNull();
    });

    it('Given: JWT con app_metadata.role. When: extractRole. Then: retorna el rol', () => {
      const token = makeJwt({
        exp: Math.floor(Date.now() / 1000) + 3600,
        app_metadata: { role: 'admin' },
      });
      expect(extractRole({ access_token: token })).toBe('admin');
    });

    it('Given: JWT con role en top-level (fallback). When: extractRole. Then: retorna el rol', () => {
      const token = makeJwt({
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: 'employee',
      });
      expect(extractRole({ access_token: token })).toBe('employee');
    });

    it('Given: JWT expirado. When: extractRole. Then: retorna null (no usa rol)', () => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW);
      const token = makeJwt({
        exp: Math.floor(NOW / 1000) - 3600,
        app_metadata: { role: 'admin' },
      });
      expect(extractRole({ access_token: token })).toBeNull();
      vi.restoreAllMocks();
    });

    it('Given: JWT sin role en ningún lado. When: extractRole. Then: retorna null', () => {
      const token = makeJwt({
        exp: Math.floor(Date.now() / 1000) + 3600,
        app_metadata: {},
      });
      expect(extractRole({ access_token: token })).toBeNull();
    });

    it('Given: JWT malformado. When: extractRole. Then: retorna null (no lanza)', () => {
      expect(extractRole({ access_token: 'bad-token' })).toBeNull();
    });
  });

  describe('extractTenantId', () => {
    it('Given: session null. When: extractTenantId. Then: retorna null', () => {
      expect(extractTenantId(null)).toBeNull();
    });

    it('Given: JWT con app_metadata.tenant_id. When: extractTenantId. Then: retorna el uuid', () => {
      const token = makeJwt({
        exp: Math.floor(Date.now() / 1000) + 3600,
        app_metadata: { tenant_id: 'uuid-1' },
      });
      expect(extractTenantId({ access_token: token })).toBe('uuid-1');
    });

    it('Given: JWT con tenant_id en top-level (fallback). When: extractTenantId. Then: retorna el uuid', () => {
      const token = makeJwt({
        exp: Math.floor(Date.now() / 1000) + 3600,
        tenant_id: 'uuid-2',
      });
      expect(extractTenantId({ access_token: token })).toBe('uuid-2');
    });

    it('Given: JWT expirado con tenant_id. When: extractTenantId. Then: retorna null', () => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW);
      const token = makeJwt({
        exp: Math.floor(NOW / 1000) - 3600,
        app_metadata: { tenant_id: 'uuid-3' },
      });
      expect(extractTenantId({ access_token: token })).toBeNull();
      vi.restoreAllMocks();
    });

    it('Given: JWT sin tenant_id. When: extractTenantId. Then: retorna null', () => {
      const token = makeJwt({
        exp: Math.floor(Date.now() / 1000) + 3600,
        app_metadata: {},
      });
      expect(extractTenantId({ access_token: token })).toBeNull();
    });
  });
});
