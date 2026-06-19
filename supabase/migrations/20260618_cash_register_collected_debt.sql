-- FUGA-1: collected_debt_bs en cash_registers
--
-- Propósito: Acumulador de cobros de deuda para expectedClosing.
-- Opción C: campo separado de total_sales_bs para no distorsionar ventas del día.

BEGIN;

ALTER TABLE public.cash_registers
  ADD COLUMN collected_debt_bs NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.cash_registers
  ADD CONSTRAINT cash_registers_collected_debt_nonneg CHECK (collected_debt_bs >= 0);

COMMIT;
