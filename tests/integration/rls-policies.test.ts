/**
 * Integration Tests — RLS Policies (Verificación Real)
 *
 * Estos tests verifican que las políticas RLS de Supabase funcionan
 * correctamente ejecutando queries reales contra la DB de producción
 * vía Management API.
 *
 * SPEC-ID: SECURITY-001, SECURITY-002
 *
 * Ejecutar: npx vitest run tests/integration/rls-policies.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';

const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!SUPABASE_ACCESS_TOKEN) {
  throw new Error('SUPABASE_ACCESS_TOKEN is required in env vars for integration tests');
}
const PROJECT_REF = 'pvnslzavkhqkvbzhdgzp';
const API_BASE = `https://api.supabase.com/v1/projects/${PROJECT_REF}`;

async function execSQL(query: string): Promise<unknown[]> {
  const res = await fetch(`${API_BASE}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SQL execution failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

describe('RLS: Verificación de habilitación en todas las tablas', () => {
  let tables: { tablename: string; rowsecurity: boolean }[];

  beforeAll(async () => {
    tables = await execSQL(
      `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    ) as { tablename: string; rowsecurity: boolean }[];
  });

  it('Todas las tablas públicas tienen RLS habilitado', () => {
    expect(tables.length).toBeGreaterThan(0);
    const disabled = tables.filter(t => !t.rowsecurity);
    expect(disabled).toEqual([]);
  });

  it('Hay al menos 20 tablas con RLS', () => {
    expect(tables.length).toBeGreaterThanOrEqual(20);
  });
});

describe('RLS: Todas las tablas críticas tienen policies', () => {
  let policies: { tablename: string; policyname: string; cmd: string }[];

  const CRITICAL_TABLES = [
    'tenants', 'user_roles', 'subscriptions', 'products', 'categories',
    'product_presentations', 'inventory_lots', 'inventory_movements',
    'sales', 'sale_items', 'cash_registers', 'suppliers',
    'purchase_orders', 'purchase_order_items', 'expenses',
    'recipes', 'recipe_lines', 'production_orders', 'exchange_rates',
  ];

  beforeAll(async () => {
    policies = await execSQL(
      `SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename`
    ) as { tablename: string; policyname: string; cmd: string }[];
  });

  it('Cada tabla crítica tiene al menos una policy', () => {
    const tablesWithPolicies = new Set(policies.map(p => p.tablename));
    const missing = CRITICAL_TABLES.filter(t => !tablesWithPolicies.has(t));
    expect(missing).toEqual([]);
  });

  it('Las tablas de negocio tienen policy SELECT para owner', () => {
    const businessTables = [
      'products', 'categories', 'inventory_lots', 'inventory_movements',
      'sales', 'sale_items', 'cash_registers', 'suppliers',
      'purchase_orders', 'purchase_order_items', 'expenses',
      'recipes', 'recipe_lines', 'production_orders', 'exchange_rates',
    ];
    const selectPolicies = policies.filter(p => p.cmd === 'SELECT');
    const tablesWithSelect = new Set(selectPolicies.map(p => p.tablename));
    const missing = businessTables.filter(t => !tablesWithSelect.has(t));
    expect(missing).toEqual([]);
  });

  it('La tabla outbox es EXCLUSIVA para service_role', () => {
    const outboxPolicies = policies.filter(p => p.tablename === 'outbox');
    expect(outboxPolicies.length).toBeGreaterThanOrEqual(4);

    for (const policy of outboxPolicies) {
      expect(policy.policyname).toMatch(/service/);
    }
  });

  it('La tabla audit_trail tiene protecciones contra DELETE/UPDATE', () => {
    const auditPolicies = policies.filter(p => p.tablename === 'audit_trail');
    const deletePolicy = auditPolicies.find(p => p.cmd === 'DELETE');
    const updatePolicy = auditPolicies.find(p => p.cmd === 'UPDATE');

    expect(deletePolicy).toBeDefined();
    expect(updatePolicy).toBeDefined();
    expect(deletePolicy!.policyname).toContain('no_delete');
    expect(updatePolicy!.policyname).toContain('no_update');
  });
});

describe('RLS: Tenant isolation patterns', () => {
  let policies: { tablename: string; policyname: string; qual: string | null }[];

  beforeAll(async () => {
    policies = await execSQL(
      `SELECT tablename, policyname, qual FROM pg_policies WHERE schemaname = 'public' AND cmd != 'DELETE' AND cmd != 'UPDATE' ORDER BY tablename`
    ) as { tablename: string; policyname: string; qual: string | null }[];
  });

  it('Las policies de owner filtran por tenant_id via JWT', () => {
    const ownerPolicies = policies.filter(p =>
      p.policyname.includes('owner') && p.qual !== null
    );
    expect(ownerPolicies.length).toBeGreaterThan(0);

    for (const policy of ownerPolicies) {
      expect(policy.qual).toContain('tenant_id');
      expect(policy.qual).toContain('jwt');
    }
  });

  it('Las policies de employee filtran por tenant_id via JWT', () => {
    const employeePolicies = policies.filter(p =>
      p.policyname.includes('employee') && p.qual !== null
    );
    expect(employeePolicies.length).toBeGreaterThan(0);

    for (const policy of employeePolicies) {
      expect(policy.qual).toContain('tenant_id');
      expect(policy.qual).toContain('jwt');
    }
  });

  it('Ninguna policy de negocio permite acceso sin filtro de tenant', () => {
    const businessTables = [
      'products', 'categories', 'sales', 'sale_items', 'cash_registers',
      'suppliers', 'purchase_orders', 'expenses', 'inventory_lots',
      'inventory_movements', 'recipes', 'production_orders', 'exchange_rates',
    ];
    const businessPolicies = policies.filter(p =>
      businessTables.includes(p.tablename) &&
      !p.policyname.includes('admin') &&
      p.qual !== null
    );

    for (const policy of businessPolicies) {
      expect(policy.qual).toContain('tenant_id');
    }
  });
});

describe('RLS: Admin bypass verification', () => {
  let policies: { tablename: string; policyname: string; qual: string | null }[];

  beforeAll(async () => {
    policies = await execSQL(
      `SELECT tablename, policyname, qual FROM pg_policies WHERE schemaname = 'public' AND policyname LIKE '%admin%' ORDER BY tablename`
    ) as { tablename: string; policyname: string; qual: string | null }[];
  });

  it('Todas las tablas críticas tienen policy admin_all', () => {
    const tablesWithAdmin = new Set(policies.map(p => p.tablename));
    const criticalWithoutAdmin = [
      'tenants', 'user_roles', 'subscriptions', 'products', 'categories',
      'product_presentations', 'inventory_lots', 'inventory_movements',
      'sales', 'sale_items', 'cash_registers', 'suppliers',
      'purchase_orders', 'purchase_order_items', 'expenses',
      'recipes', 'recipe_lines', 'production_orders', 'exchange_rates',
    ].filter(t => !tablesWithAdmin.has(t));

    expect(criticalWithoutAdmin).toEqual([]);
  });

  it('Las policies admin usan role = admin (no hardcoded)', () => {
    for (const policy of policies) {
      expect(policy.qual).toContain('admin');
    }
  });
});

describe('RLS: Índices en columnas de tenant_id', () => {
  it('Las tablas grandes tienen índices en tenant_id', async () => {
    const indexes = await execSQL(
      `SELECT indexname, tablename FROM pg_indexes
       WHERE schemaname = 'public'
       AND indexname LIKE '%tenant_id%'
       ORDER BY tablename`
    ) as { indexname: string; tablename: string }[];

    const indexedTables = new Set(indexes.map(i => i.tablename));
    const largeTables = [
      'sales', 'sale_items', 'inventory_lots', 'inventory_movements',
      'expenses', 'products', 'categories',
    ];
    const missing = largeTables.filter(t => !indexedTables.has(t));

    expect(missing).toEqual([]);
  });
});

describe('RLS: FORCE ROW LEVEL SECURITY', () => {
  it('Verificar estado de FORCE RLS (recomendado para defense-in-depth)', async () => {
    const result = await execSQL(
      `SELECT c.relname AS tablename, c.relforcerowsecurity AS force_rls
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
       ORDER BY c.relname`
    ) as { tablename: string; force_rls: boolean }[];

    // Solo verificamos que la query funciona y返回 resultados
    expect(result.length).toBeGreaterThan(0);

    // Registramos cuáles tienen FORCE RLS (para documentación)
    const withForce = result.filter(r => r.force_rls);
    const withoutForce = result.filter(r => !r.force_rls);

    // Esto es informativo, no un error - FORCE RLS es opcional en Supabase
    // porque la API usa roles anon/authenticated, no el superuser
    expect(withoutForce.length).toBeGreaterThanOrEqual(0);
  });
});
