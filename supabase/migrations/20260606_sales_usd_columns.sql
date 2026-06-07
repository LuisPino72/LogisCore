-- ============================================================================
-- POS-002 (C-6) — Persistir montos en USD en `sales`
-- ============================================================================
-- Fecha: 2026-06-06
-- Issue:  `sales` solo persiste montos en BS + exchange_rate. No se puede
--         reconstruir totales USD históricos si la tasa cambia, ni auditar
--         cierres de caja cross-device.
-- Plan:   Agregar 5 columnas USD con CHECKs >= 0 y backfill desde BS/exchange.
--
-- Pre-checks (verificados 2026-06-06):
--   - 17 sales totales, 0 con exchange_rate nulo/0
--   - Todos los valores numéricos con precision numeric (no float)
-- ============================================================================

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS subtotal_usd numeric(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iva_usd      numeric(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igtf_usd     numeric(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_usd    numeric(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_usd numeric(15,4) NOT NULL DEFAULT 0;

-- Backfill: USD = BS / exchange_rate con preciseRound via ROUND
UPDATE public.sales
SET
  subtotal_usd = ROUND(subtotal_bs / exchange_rate, 4),
  iva_usd      = ROUND(iva_bs      / exchange_rate, 4),
  igtf_usd     = ROUND(igtf_bs     / exchange_rate, 4),
  total_usd    = ROUND(total_bs    / exchange_rate, 4),
  discount_usd = CASE
    WHEN discount_bs IS NULL OR discount_bs = 0 THEN 0
    ELSE ROUND(discount_bs / exchange_rate, 4)
  END
WHERE exchange_rate IS NOT NULL
  AND exchange_rate > 0
  AND subtotal_usd = 0; -- backfill solo donde quedó en 0 (sintético: ventas nuevas)

-- Para ventas existentes pre-C-6 (donde subtotal_usd quedó en 0 pero subtotal_bs > 0):
-- aplicar backfill directo sin el WHERE sintético
UPDATE public.sales
SET
  subtotal_usd = ROUND(subtotal_bs / exchange_rate, 4),
  iva_usd      = ROUND(iva_bs      / exchange_rate, 4),
  igtf_usd     = ROUND(igtf_bs     / exchange_rate, 4),
  total_usd    = ROUND(total_bs    / exchange_rate, 4),
  discount_usd = CASE
    WHEN discount_bs IS NULL OR discount_bs = 0 THEN 0
    ELSE ROUND(discount_bs / exchange_rate, 4)
  END
WHERE exchange_rate IS NOT NULL
  AND exchange_rate > 0
  AND subtotal_bs > 0;

-- CHECKs >= 0 (pos-002 C-4 parte 2)
ALTER TABLE public.sales
  ADD CONSTRAINT sales_subtotal_usd_nonneg CHECK (subtotal_usd >= 0),
  ADD CONSTRAINT sales_iva_usd_nonneg      CHECK (iva_usd      >= 0),
  ADD CONSTRAINT sales_igtf_usd_nonneg     CHECK (igtf_usd     >= 0),
  ADD CONSTRAINT sales_total_usd_nonneg    CHECK (total_usd    >= 0),
  ADD CONSTRAINT sales_discount_usd_nonneg CHECK (discount_usd >= 0);
