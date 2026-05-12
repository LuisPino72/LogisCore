-- Fix: Eliminar claim top-level role del JWT
-- PostgREST interpreta el claim 'role' como rol de BD y falla si no es 'anon' o 'authenticated'
-- El cliente ya lee app_metadata.role, no necesita el claim top-level

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
    ORDER BY (CASE WHEN ur.role = 'admin' THEN 1 WHEN ur.role = 'owner' THEN 2 ELSE 3 END) ASC
    LIMIT 1;

    IF FOUND THEN
        event := jsonb_set(event, '{claims, app_metadata, role}', to_jsonb(v_role));

        IF v_tenant_id IS NOT NULL THEN
            event := jsonb_set(event, '{claims, app_metadata, tenant_id}', to_jsonb(v_tenant_id::text));
        END IF;
    END IF;

    RETURN event;
END;
$$;
