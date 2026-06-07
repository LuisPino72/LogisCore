-- ====================================================================
-- PLAN-115: Production module - CHECK constraints + índices + NOT NULL
-- Fecha: 2026-06-07
-- Sesión: 110
-- ====================================================================
-- INSTRUCCIONES: Ejecutar este SQL en Supabase via Management API
-- Endpoint: POST https://api.supabase.com/v1/projects/pvnslzavkhqkvbzhdgzp/database/query
-- Auth: Bearer ${SUPABASE_ACCESS_TOKEN}
-- ====================================================================
-- Contexto: módulo production tiene 0 filas reales en las 3 tablas (recipes,
-- recipe_lines, production_orders). Las 3 CHECKs y el NOT NULL son safe
-- porque no hay data que viole las constraints. Los índices son CREATE INDEX
-- IF NOT EXISTS (idempotente).
-- ====================================================================

-- 1. CHECK: recipe_lines.quantity > 0
-- Antes: TS-only via Zod (`specs/production/index.ts:56` `.positive()`).
-- Ahora: enforced en BD como defensa en profundidad (service_role bypass).
ALTER TABLE public.recipe_lines
  DROP CONSTRAINT IF EXISTS recipe_lines_quantity_positive_check;
ALTER TABLE public.recipe_lines
  ADD CONSTRAINT recipe_lines_quantity_positive_check CHECK (quantity > 0);

-- 2. CHECK: production_orders.batch_count > 0
ALTER TABLE public.production_orders
  DROP CONSTRAINT IF EXISTS production_orders_batch_count_positive_check;
ALTER TABLE public.production_orders
  ADD CONSTRAINT production_orders_batch_count_positive_check CHECK (batch_count > 0);

-- 3. CHECK: production_orders.quantity_produced IS NULL OR >= 0
-- IS NULL permitido porque production_orders.quantity_produced es nullable
-- (default 0 pero TS permite omitir al crear). Solo validamos si esta presente.
ALTER TABLE public.production_orders
  DROP CONSTRAINT IF EXISTS production_orders_quantity_produced_nonneg_check;
ALTER TABLE public.production_orders
  ADD CONSTRAINT production_orders_quantity_produced_nonneg_check
    CHECK (quantity_produced IS NULL OR quantity_produced >= 0);

-- 4. NOT NULL: production_orders.quantity_produced
-- TS ya lo declara required (`specs/production/index.ts:106` `.int().min(0)`).
-- Safe: 0 filas reales. El default 0 cubre inserciones que no lo especifiquen.
ALTER TABLE public.production_orders
  ALTER COLUMN quantity_produced SET DEFAULT 0;
-- Solo aplicar NOT NULL si la columna no tiene nulos. Como tiene 0 filas,
-- el UPDATE es no-op. El ALTER siguiente es safe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.production_orders WHERE quantity_produced IS NULL
  ) THEN
    ALTER TABLE public.production_orders
      ALTER COLUMN quantity_produced SET NOT NULL;
  ELSE
    RAISE NOTICE 'production_orders.quantity_produced tiene nulos, NO se aplica NOT NULL. Backfill primero.';
  END IF;
END $$;

-- 5. Índices compuestos en production_orders
-- Dexie ya los tiene (db.ts:411 `[tenantId+status]`, `[tenantId+deletedAt]`)
-- pero el schema Supabase no. Aceleran queries server-side (RLS, reports).
CREATE INDEX IF NOT EXISTS idx_production_orders_tenant_status
  ON public.production_orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_production_orders_tenant_deleted
  ON public.production_orders(tenant_id, deleted_at);

-- 6. Verificación
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN ('public.recipe_lines'::regclass, 'public.production_orders'::regclass)
  AND contype = 'c'
  AND conname IN (
    'recipe_lines_quantity_positive_check',
    'production_orders_batch_count_positive_check',
    'production_orders_quantity_produced_nonneg_check'
  );

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'production_orders'
  AND indexname IN (
    'idx_production_orders_tenant_status',
    'idx_production_orders_tenant_deleted'
  );

SELECT
  column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'production_orders'
  AND column_name = 'quantity_produced';

-- ====================================================================
-- FIN DE LA MIGRACIÓN
-- ====================================================================
