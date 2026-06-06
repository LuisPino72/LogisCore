-- Sprint 3 — Issue #14: tenants.rif formato regex venezolano
-- Aplica CHECK constraint para validar formato de RIF venezolano.
-- Formato: [VEJPG][0-9]{8,9}$

-- Verificar que no hay rifs con formato inválido antes de aplicar
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM tenants
    WHERE rif !~ '^[VEJPG][0-9]{8,9}$'
  ) THEN
    RAISE EXCEPTION 'Hay RIFs con formato inválido en tenants. Cleanup antes de aplicar esta migración.';
  END IF;
END $$;

ALTER TABLE tenants
  ADD CONSTRAINT tenants_rif_format_check
  CHECK (rif ~ '^[VEJPG][0-9]{8,9}$');
