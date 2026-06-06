ALTER TABLE public.audit_trail
  ADD CONSTRAINT audit_trail_severity_check
  CHECK (severity IN ('DEBUG','INFO','WARN','ERROR','CRITICAL'));
