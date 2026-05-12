-- Limpieza: Materialized Views obsoletas
-- Decisión: Solo usamos audit_trail para trazabilidad y analítica.
-- Ver: PLAN-OUTBOX-DBML-SCAFFOLD (Parte 0 - Limpieza)

DROP MATERIALIZED VIEW IF EXISTS public.mv_sales_per_hour;
DROP MATERIALIZED VIEW IF EXISTS public.mv_session_duration;
DROP MATERIALIZED VIEW IF EXISTS public.mv_users_per_day;
DROP MATERIALIZED VIEW IF EXISTS public.mv_voided_analysis;
