-- Sprint 3 — Issue #22: naming de CHECK constraints
-- Renombra user_roles_role_check a user_roles_role_valid para alinear
-- con la convención del proyecto.

ALTER TABLE user_roles
  RENAME CONSTRAINT user_roles_role_check TO user_roles_role_valid;
