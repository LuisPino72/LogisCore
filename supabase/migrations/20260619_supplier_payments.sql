-- MED-8: Cuentas por Pagar (Proveedores)
--
-- Nuevo modulo de cuentas por pagar: espejo de credit_payments (clientes).
-- Crea tabla supplier_payments + columnas en suppliers/purchase_orders.

BEGIN;

-- ============================================================
-- 1. supplier_payments — nueva tabla
-- ============================================================
CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  amount_usd NUMERIC(12,2) NOT NULL CHECK (amount_usd > 0),
  amount_bs NUMERIC(12,2) NOT NULL CHECK (amount_bs >= 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('efectivo_bs','pago_movil','tarjeta_bs','efectivo_usd','credito','transferencia','cheque','otro')),
  exchange_rate NUMERIC(10,4) NOT NULL,
  reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_supplier_payments_tenant ON public.supplier_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON public.supplier_payments(tenant_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_order ON public.supplier_payments(tenant_id, purchase_order_id);

-- ============================================================
-- 2. suppliers — agregar balance y campos
-- ============================================================
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS balance NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_balance_nonneg CHECK (balance >= 0);

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12,2);

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS payment_terms TEXT;

-- ============================================================
-- 3. purchase_orders — agregar estado de pago
-- ============================================================
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (payment_status IN ('pending', 'paid', 'partially_paid', 'overdue'));

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS due_date DATE;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS paid_amount_usd NUMERIC(12,2) NOT NULL DEFAULT 0;

-- ============================================================
-- 4. RLS — supplier_payments
-- ============================================================
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY supplier_payments_admin_all
  ON public.supplier_payments
  FOR ALL
  TO authenticated
  USING (
    (SELECT role FROM (SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::text AS role) r) = 'admin'
  );

-- Owner: full access on own tenant
CREATE POLICY supplier_payments_owner_all
  ON public.supplier_payments
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid)
    AND (SELECT role FROM (SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::text AS role) r) = 'owner'
  );

-- Employee: read only on own tenant
CREATE POLICY supplier_payments_employee_select
  ON public.supplier_payments
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid)
    AND (SELECT role FROM (SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::text AS role) r) = 'employee'
  );

COMMIT;
