-- Fix: handle_new_tenant ya no referencia NEW.plan (columna eliminada de tenants)
-- El plan se asigna por defecto como 'basic' en la subscription

CREATE OR REPLACE FUNCTION public.handle_new_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.subscriptions (tenant_id, plan, status, started_at, expires_at)
    VALUES (NEW.id, 'basic', 'active', now(), now() + interval '30 days');
    RETURN NEW;
END;
$$;
