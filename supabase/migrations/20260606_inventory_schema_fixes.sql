-- INV-001-02: Inventory schema integrity fixes
-- M-14: unit_multiplier > 0 CHECK constraint (defense-in-depth)
-- M-18: RLS policies roles: {public} → {authenticated} for 15 inventory policies
-- Verificado pre-apply: 0 filas con unit_multiplier <= 0, 0 NULLs (min=1, max=30).

ALTER TABLE public.product_presentations
  ADD CONSTRAINT product_presentations_unit_multiplier_check
  CHECK ((unit_multiplier > 0));

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'products',
        'product_presentations',
        'categories',
        'inventory_lots',
        'inventory_movements'
      )
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', r.policyname, r.tablename);
  END LOOP;
END $$;
