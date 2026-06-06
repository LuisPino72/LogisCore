-- Sprint 1 — Issue #7: tenants.rif UNIQUE
-- Aplica UNIQUE constraint parcial (soft-delete aware) sobre tenants.rif.
-- Esto previene que dos tenants activos tengan el mismo RIF.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM tenants
    WHERE deleted_at IS NULL
    GROUP BY rif
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Hay RIFs duplicados en tenants. Cleanup antes de aplicar esta migración.';
  END IF;
END $$;

ALTER TABLE tenants
  ADD CONSTRAINT tenants_rif_unique
  UNIQUE (rif)
  WHERE deleted_at IS NULL;
