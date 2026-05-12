-- Audit Trail: trazabilidad de eventos críticos del sistema
-- Solo el admin (Luis) puede leer; el sistema (service_role) inserta automáticamente.

CREATE TABLE IF NOT EXISTS public.audit_trail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  event_module text NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  tenant_id text NOT NULL,
  tenant_uuid uuid REFERENCES public.tenants(id),
  payload jsonb DEFAULT '{}',
  severity text NOT NULL DEFAULT 'INFO',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para consultas de métricas futuras
CREATE INDEX IF NOT EXISTS idx_audit_trail_event ON public.audit_trail(event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_trail_tenant ON public.audit_trail(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_trail_date  ON public.audit_trail(created_at DESC);

-- =========================================================================
-- ROW LEVEL SECURITY
-- =========================================================================

ALTER TABLE public.audit_trail ENABLE ROW LEVEL SECURITY;

-- 1. Solo admin (Luis) puede SELECT
CREATE POLICY "audit_trail_admin_select" ON public.audit_trail
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
        AND ur.deleted_at IS NULL
    )
  );

-- 2. Solo service_role puede INSERT (el middleware llama con service key)
CREATE POLICY "audit_trail_service_insert" ON public.audit_trail
  FOR INSERT
  WITH CHECK (true);

-- 3. Nadie puede UPDATE o DELETE (inmutable)
CREATE POLICY "audit_trail_no_update" ON public.audit_trail
  FOR UPDATE
  USING (false);

CREATE POLICY "audit_trail_no_delete" ON public.audit_trail
  FOR DELETE
  USING (false);
