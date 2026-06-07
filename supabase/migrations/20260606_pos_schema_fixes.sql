-- POS-002: POS schema integrity fixes
--
-- C-4: Defense-in-depth CHECK constraints >= 0 para todos los montos de dinero.
--      Defense contra bypass via SQL directo, migraciones manuales, o CSV import.
--      Verificado pre-apply: 0 rows negativas en todas las tablas.
--
-- m-19: Unificar precision de opening_rate/closing_rate con sales.exchange_rate.
--       Antes numeric(19,2) → ahora numeric(19,4) para evitar pérdida de precisión
--       en cierres de caja cuando la tasa tiene más de 2 decimales significativos.
--
-- m-20: Índice (tenant_id, updated_at) en cash_registers para sync pull
--       eficiente. Antes: scan completo en WHERE tenant_id = ? ORDER BY updated_at.

BEGIN;

-- C-4: CHECKs >= 0 para sales
ALTER TABLE public.sales
  ADD CONSTRAINT sales_subtotal_bs_nonneg CHECK (subtotal_bs >= 0);
ALTER TABLE public.sales
  ADD CONSTRAINT sales_iva_bs_nonneg CHECK (iva_bs IS NULL OR iva_bs >= 0);
ALTER TABLE public.sales
  ADD CONSTRAINT sales_igtf_bs_nonneg CHECK (igtf_bs IS NULL OR igtf_bs >= 0);
ALTER TABLE public.sales
  ADD CONSTRAINT sales_total_bs_nonneg CHECK (total_bs >= 0);
ALTER TABLE public.sales
  ADD CONSTRAINT sales_discount_bs_nonneg CHECK (discount_bs IS NULL OR discount_bs >= 0);

-- C-4: CHECKs >= 0 para sale_items
ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_unit_price_usd_nonneg CHECK (unit_price_usd >= 0);
ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_total_price_usd_nonneg CHECK (total_price_usd >= 0);
ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_cost_usd_per_unit_nonneg CHECK (cost_usd_per_unit IS NULL OR cost_usd_per_unit >= 0);

-- C-4: CHECKs >= 0 para cash_registers
ALTER TABLE public.cash_registers
  ADD CONSTRAINT cash_registers_opening_balance_nonneg CHECK (opening_balance_bs IS NULL OR opening_balance_bs >= 0);
ALTER TABLE public.cash_registers
  ADD CONSTRAINT cash_registers_closing_balance_nonneg CHECK (closing_balance_bs IS NULL OR closing_balance_bs >= 0);
ALTER TABLE public.cash_registers
  ADD CONSTRAINT cash_registers_total_sales_count_nonneg CHECK (total_sales_count >= 0);
ALTER TABLE public.cash_registers
  ADD CONSTRAINT cash_registers_total_sales_bs_nonneg CHECK (total_sales_bs >= 0);
ALTER TABLE public.cash_registers
  ADD CONSTRAINT cash_registers_total_igtf_bs_nonneg CHECK (total_igtf_bs >= 0);

-- m-19: Unificar precision de rates con sales.exchange_rate
ALTER TABLE public.cash_registers
  ALTER COLUMN opening_rate TYPE numeric(19,4) USING opening_rate::numeric(19,4);
ALTER TABLE public.cash_registers
  ALTER COLUMN closing_rate TYPE numeric(19,4) USING closing_rate::numeric(19,4);

-- m-20: Índice para sync pull
CREATE INDEX IF NOT EXISTS idx_cash_registers_tenant_updated
  ON public.cash_registers(tenant_id, updated_at)
  WHERE deleted_at IS NULL;

COMMIT;
