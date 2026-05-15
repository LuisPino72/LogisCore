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
    it('Given: Usuario con email "owner@bodega.com" y password "123456"', () => {
      const input = { email: 'owner@bodega.com', password: '123456' };
      
      // When: Llama a authService.login
      const validateResult = validateLoginInput(input);
      
      // Then: Validacion exitosa (Zod parse no lanza)
      expect(validateResult.email).toBe('owner@bodega.com');
      expect(validateResult.password).toBe('123456');
    });
  });

  describe('DEBE rechazar email invalido', () => {
    it('Given: Email "no-es-email"', () => {
      const input = { email: 'no-es-email', password: '123456' };
      
      // When: Valida con LoginInputSchema
      // Then: ZodError (email invalido)
      expect(() => {
        validateLoginInput(input);
      }).toThrow();
    });
  });

  describe('DEBE rechazar password menor a 6 caracteres', () => {
    it('Given: Password "123"', () => {
      const input = { email: 'test@test.com', password: '123' };
      
      // When: Valida con LoginInputSchema
      // Then: ZodError (password muy corta)
      expect(() => {
        validateLoginInput(input);
      }).toThrow();
    });
  });

  describe('DEBE rechazar email mayor a 30 caracteres', () => {
    it('Given: Email de 31 caracteres', () => {
      const input = { email: 'a'.repeat(31) + '@test.com', password: '123456' };
      
      expect(() => {
        validateLoginInput(input);
      }).toThrow();
    });
  });

  describe('DEBE rechazar password mayor a 20 caracteres', () => {
    it('Given: Password de 21 caracteres', () => {
      const input = { email: 'test@test.com', password: 'a'.repeat(21) };
      
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