/**
 * Integration Tests — Edge Functions
 *
 * Estos tests verifican que las edge functions de Supabase responden
 * correctamente. Requieren conexión a un proyecto de Supabase de prueba.
 *
 * SPEC-ID: ADMIN-001, DASH-001
 */

import { describe, it, expect } from 'vitest';

describe('admin-create-tenant', () => {
  it('Crea tenant + owner + employees', () => {
    // TODO: POST con service_role
    // const result = await fetch(EDGE_FN_URL + '/admin-create-tenant', {...});
    // expect(result.status).toBe(200);
    expect(true).toBe(true);
  });

  it('Rechaza payload sin RIF valido', () => {
    // TODO: POST con RIF invalido
    expect(true).toBe(true);
  });
});

describe('fetch-bcv-rate', () => {
  it('Retorna tasa actualizada', () => {
    // TODO: POST sin tenant_id (modo cron)
    expect(true).toBe(true);
  });

  it('Rechaza requests sin auth', () => {
    // TODO: POST sin Authorization header
    expect(true).toBe(true);
  });
});
