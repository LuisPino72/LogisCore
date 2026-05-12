-- Migration: exchange_rates table + RLS
-- Tracks BCV exchange rate per tenant

CREATE TABLE public.exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    rate NUMERIC(19,4) NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('bcv_api', 'manual')),
    fetched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

-- Indexes for fast "latest rate" queries
CREATE INDEX idx_exchange_rates_tenant_date ON public.exchange_rates(tenant_id, created_at DESC);
CREATE INDEX idx_exchange_rates_tenant_id ON public.exchange_rates(tenant_id);

-- Owner/Admin can manage (insert, update)
CREATE POLICY "exchange_rates_owner_all" ON public.exchange_rates
    FOR ALL
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner', 'admin')
        AND tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    )
    WITH CHECK (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner', 'admin')
        AND tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    );

-- Employee can read only
CREATE POLICY "exchange_rates_employee_select" ON public.exchange_rates
    FOR SELECT
    USING (
        tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    );
