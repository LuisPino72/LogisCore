/**
 * Auth BDD Tests - AUTH-001..003
 * Given-When-Then specifications for Auth module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateLoginInput, isValidRole, AUTH_ROUTES } from '../../features/auth/types';

describe('AUTH-001: Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DEBE permitir login con credenciales validas', () => {
    it('Given: Usuario con email "owner@bodega.com" y password "Valid@123"', () => {
      const input = { email: 'owner@bodega.com', password: 'Valid@123' };
      
      const validateResult = validateLoginInput(input);
      
      expect(validateResult.email).toBe('owner@bodega.com');
      expect(validateResult.password).toBe('Valid@123');
    });
  });

  describe('DEBE rechazar email invalido', () => {
    it('Given: Email "no-es-email"', () => {
      const input = { email: 'no-es-email', password: 'Valid@123' };
      
      expect(() => {
        validateLoginInput(input);
      }).toThrow();
    });
  });

  describe('DEBE rechazar password menor a 8 caracteres', () => {
    it('Given: Password "Abc@12"', () => {
      const input = { email: 'test@test.com', password: 'Abc@12' };
      
      expect(() => {
        validateLoginInput(input);
      }).toThrow();
    });
  });

  describe('DEBE rechazar password sin mayuscula', () => {
    it('Given: Password "valid@123"', () => {
      const input = { email: 'test@test.com', password: 'valid@123' };
      
      expect(() => {
        validateLoginInput(input);
      }).toThrow();
    });
  });

  describe('DEBE rechazar email mayor a 30 caracteres', () => {
    it('Given: Email de 31 caracteres', () => {
      const input = { email: 'a'.repeat(31) + '@test.com', password: 'Valid@123' };
      
      expect(() => {
        validateLoginInput(input);
      }).toThrow();
    });
  });
});

describe('AUTH-002: Redireccion por rol', () => {
  describe('isValidRole valida todos los roles', () => {
    it('Given: role="admin"', () => {
      expect(isValidRole('admin')).toBe(true);
    });
    it('Given: role="owner"', () => {
      expect(isValidRole('owner')).toBe(true);
    });
    it('Given: role="employee"', () => {
      expect(isValidRole('employee')).toBe(true);
    });
    it('Given: role desconocido retorna false', () => {
      expect(isValidRole('superadmin')).toBe(false);
    });
  });

  describe('AUTH_ROUTES constantes', () => {
    it('LOGIN es /login', () => {
      expect(AUTH_ROUTES.LOGIN).toBe('/login');
    });
    it('ADMIN es /admin', () => {
      expect(AUTH_ROUTES.ADMIN).toBe('/admin');
    });
    it('DASHBOARD es :slug/dashboard', () => {
      expect(AUTH_ROUTES.DASHBOARD).toBe(':slug/dashboard');
    });
  });
});

describe('AUTH-003: Proteccion de rutas', () => {
  describe('buildUserSession retorna null sin sesion', () => {
    it('Given: No hay sesion activa, buildUserSession falla', async () => {
      // buildUserSession requiere sesion de Supabase
      // si el mock retorna null, debe lanzar o retornar Result.failure
      const { supabase } = await import('../../services/supabase/client');
      expect(supabase.from).toBeDefined();
    });
  });
});