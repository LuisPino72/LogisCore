-- BACKLOG-106 [PURCHASES-001] — Campo RIF en suppliers
-- Regla #8: RIF formato V/E/J/G/P + 9 dígitos
-- AUDIT-CRUD-012: rif opcional con regex oficial
-- Migración idempotente (IF NOT EXISTS) — puede re-ejecutarse sin error.

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS rif VARCHAR(10);

-- Índice único por tenant (permite mismo RIF en distintos tenants,
-- no permite duplicados dentro del mismo tenant excepto soft-deleted).
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_tenant_rif
  ON public.suppliers(tenant_id, rif)
  WHERE rif IS NOT NULL AND deleted_at IS NULL;

-- Backfill (no-op si tabla vacía): si hay suppliers existentes sin rif,
-- el campo es nullable, no requiere default.
COMMENT ON COLUMN public.suppliers.rif IS
  'Registro de Información Fiscal venezolano: V/E/J/G/P + 9 dígitos. Opcional.';
