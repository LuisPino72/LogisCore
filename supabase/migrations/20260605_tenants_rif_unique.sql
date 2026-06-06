-- Sprint 1 — Issue #7: tenants.rif UNIQUE
-- Aplica UNIQUE constraint parcial (soft-delete aware) sobre tenants.rif.
-- Esto previene que dos tenants activos tengan el mismo RIF.
--
-- Nota: PostgreSQL no soporta UNIQUE CONSTRAINT parcial directamente
-- (la sintaxis UNIQUE (col) WHERE solo es valida para CREATE UNIQUE INDEX).
-- Por eso se usa CREATE UNIQUE INDEX que tiene el mismo efecto.

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

CREATE UNIQUE INDEX IF NOT EXISTS tenants_rif_unique
  ON tenants (rif)
  WHERE deleted_at IS NULL;
