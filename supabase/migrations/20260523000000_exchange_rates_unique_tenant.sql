-- Migration: make exchange_rates unique per tenant (one row per tenant)
-- Limpia duplicados y añade unique constraint para usar UPSERT

-- 1. Eliminar duplicados: mantener solo la fila más reciente por tenant
DELETE FROM public.exchange_rates
WHERE id NOT IN (
    SELECT DISTINCT ON (tenant_id) id
    FROM public.exchange_rates
    ORDER BY tenant_id, created_at DESC
);

-- 2. Añadir unique constraint en tenant_id
ALTER TABLE public.exchange_rates
ADD CONSTRAINT exchange_rates_tenant_id_key UNIQUE (tenant_id);
