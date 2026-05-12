-- Migration: 20260513000001_remove_tenant_plan.sql
-- Desc: Remove redundant plan column from tenants table (kept in subscriptions)

ALTER TABLE public.tenants DROP COLUMN plan;
