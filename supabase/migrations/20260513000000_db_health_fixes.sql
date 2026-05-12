-- Migration: 20260513000000_db_health_fixes.sql
-- Desc: Health check fixes: RLS hardening, JWT determinism, Type standardization, Soft-delete for subscriptions

-- 1. RLS HARDENING: Audit Trail
-- Restringir inserciones de audit_trail solo al service_role
DROP POLICY IF EXISTS "audit_trail_service_insert" ON public.audit_trail;
CREATE POLICY "audit_trail_service_insert" ON public.audit_trail
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

-- 2. JWT HOOK DETERMINISM
-- Actualizar la función para que siempre elija el rol más potente (owner > employee)
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role text;
    v_tenant_id uuid;
BEGIN
    SELECT ur.role, ur.tenant_id INTO v_role, v_tenant_id
    FROM public.user_roles ur
    WHERE ur.user_id = (event->>'user_id')::uuid
      AND ur.deleted_at IS NULL
    ORDER BY (CASE WHEN ur.role = 'owner' THEN 1 WHEN ur.role = 'admin' THEN 2 ELSE 3 END) ASC
    LIMIT 1;

    IF FOUND THEN
        event := jsonb_set(event, '{claims, app_metadata, role}', to_jsonb(v_role));
        event := jsonb_set(event, '{claims, role}', to_jsonb(v_role));

        IF v_tenant_id IS NOT NULL THEN
            event := jsonb_set(event, '{claims, app_metadata, tenant_id}', to_jsonb(v_tenant_id::text));
            event := jsonb_set(event, '{claims, tenant_id}', to_jsonb(v_tenant_id::text));
        END IF;
    END IF;

    RETURN event;
END;
$$;

-- 3. TYPE STANDARDIZATION: Audit Trail
-- Cambiar tenant_id (TEXT) a UUID y eliminar tenant_uuid redundante
-- Nota: Convertimos los datos existentes usando CAST
ALTER TABLE public.audit_trail 
    RENAME COLUMN tenant_id TO tenant_id_old;

ALTER TABLE public.audit_trail 
    ADD COLUMN tenant_id UUID;

UPDATE public.audit_trail 
    SET tenant_id = tenant_uuid; -- Usamos la columna UUID existente para migrar

-- Si alguna fila no tenía tenant_uuid pero sí tenant_id_old, intentamos cast
UPDATE public.audit_trail 
    SET tenant_id = tenant_id_old::uuid 
    WHERE tenant_id IS NULL AND tenant_id_old IS NOT NULL;

ALTER TABLE public.audit_trail 
    DROP COLUMN tenant_id_old,
    DROP COLUMN tenant_uuid;

-- Añadir FK para integridad
ALTER TABLE public.audit_trail 
    ADD CONSTRAINT audit_trail_tenant_id_fkey 
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- 4. SUBSCRIPTIONS SOFT DELETE
-- Agregar columna deleted_at para consistencia universal
ALTER TABLE public.subscriptions 
    ADD COLUMN deleted_at TIMESTAMPTZ;

-- 5. PERFORMANCE INDEX
-- Índice parcial para el hook de autenticación (evita scan de roles borrados)
CREATE INDEX IF NOT EXISTS idx_user_roles_active_hook 
ON public.user_roles(user_id, tenant_id, role) 
WHERE deleted_at IS NULL;
