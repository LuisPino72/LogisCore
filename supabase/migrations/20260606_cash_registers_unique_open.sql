-- ============================================================================
-- POS-002 (C-8) — atomicidad de openCashRegister
-- ============================================================================
-- Fecha: 2026-06-06
-- Issue:  Race condition en openCashRegister: dos requests concurrentes
--         pueden pasar la verificación remota simultánea y crear 2 cajas
--         abiertas para el mismo tenant el mismo día, rompiendo la regla
--         "una caja por día".
-- Plan:   Índice único parcial: máximo 1 cash_register ABIERTA por tenant.
--         Si la app intenta crear la 2da, la BD rechaza con 23505 (unique
--         violation) y la app re-lee para retornar la existente.
--
-- Pre-checks (verificados 2026-06-06):
--   - 0 tenants con > 1 cash_register abierta simultáneamente
--   - 0 cash_registers con is_open=true + deleted_at IS NULL duplicadas
-- ============================================================================

-- 1. Identificar y limpiar duplicados existentes (defensivo)
--    NO debería haber, pero el constraint lo garantizaría de todas formas
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT tenant_id, COUNT(*) as cnt
    FROM public.cash_registers
    WHERE is_open = true AND deleted_at IS NULL
    GROUP BY tenant_id
    HAVING COUNT(*) > 1
  ) dups;

  IF dup_count > 0 THEN
    RAISE WARNING 'POS-002 C-8: % tenants tienen > 1 caja abierta. NO se procede con constraint hasta limpiar.', dup_count;
  ELSE
    RAISE NOTICE 'POS-002 C-8: pre-check OK (0 duplicados).';
  END IF;
END $$;

-- 2. Crear índice único parcial (rechaza 2da caja abierta por tenant)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  uq_cash_registers_one_open_per_tenant
  ON public.cash_registers(tenant_id)
  WHERE is_open = true AND deleted_at IS NULL;
