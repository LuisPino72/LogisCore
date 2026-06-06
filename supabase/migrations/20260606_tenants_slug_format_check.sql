ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_slug_format_check
  CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
