-- ============================================================================
-- PLAN-113 (C2 + C6) — expenses idempotencia: purchase_order_id + parent+date
-- ============================================================================
-- Fecha: 2026-06-07
--
-- C2: receiveOrder crea expense COMPRA_INVENTARIO sin purchaseOrderId ni
--     check idempotente. Si tx commitea y response se pierde -> retry duplica.
--     Solucion: columna purchase_order_id + UNIQUE INDEX parcial.
-- C6: checkAndGenerateRecurring race condition puede crear duplicados
--     (parent, date). Solucion: UNIQUE INDEX parcial.
--
-- Pre-checks (verificados 2026-06-07):
--   - 0 duplicados en (parent_expense_id, date) en BD
--   - 0 expenses con purchase_order_id (columna no existe aun)
-- ============================================================================

-- 1) C2: agregar columna purchase_order_id (nullable, soft-delete friendly)
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS purchase_order_id UUID NULL;

-- 2) C2: UNIQUE INDEX parcial — maximo 1 expense ACTIVO por purchase_order
--    (permite soft-deleted viejos + reactivacion)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  uq_expenses_purchase_order_active
  ON public.expenses(purchase_order_id)
  WHERE purchase_order_id IS NOT NULL AND deleted_at IS NULL;

-- 3) C2: FK opcional a purchase_orders (RESTRICT para no perder trazabilidad)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'expenses_purchase_order_id_fkey'
      AND table_name = 'expenses'
  ) THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_purchase_order_id_fkey
      FOREIGN KEY (purchase_order_id)
      REFERENCES public.purchase_orders(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- 4) C6: UNIQUE INDEX parcial para recurring instances
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  uq_expenses_recurring_instance
  ON public.expenses(parent_expense_id, date)
  WHERE parent_expense_id IS NOT NULL AND deleted_at IS NULL;
