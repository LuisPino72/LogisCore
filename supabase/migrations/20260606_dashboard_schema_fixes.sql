-- DASH-001-02: Dashboard schema integrity fixes
-- S-1: FK de sale_items.presentation_id debe apuntar a product_presentations (no products)
-- M-12: Eliminar índice duplicado idx_sale_items_sale_id (conservar idx_sale_items_sale)
-- Verificado: 0 filas con presentation_id que apunten a un id que no exista en product_presentations.

ALTER TABLE public.sale_items
  DROP CONSTRAINT sale_items_presentation_id_fkey;

ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_presentation_id_fkey
  FOREIGN KEY (presentation_id) REFERENCES public.product_presentations(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS public.idx_sale_items_sale_id;
