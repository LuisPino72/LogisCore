-- DINERO-007 (A2): RIF único por tenant activo
-- Crea índice único PARCIAL sobre suppliers(tenant_id, rif) WHERE deleted_at IS NULL AND rif IS NOT NULL
-- Permite reusar RIF en suppliers soft-deleted y entre tenants diferentes.

DROP INDEX IF EXISTS public.idx_suppliers_tenant_rif;
DROP INDEX IF EXISTS public.idx_suppliers_tenant_rif_active;
CREATE UNIQUE INDEX idx_suppliers_tenant_rif_active
  ON public.suppliers (tenant_id, rif)
  WHERE deleted_at IS NULL AND rif IS NOT NULL;
