/** Tipos base del sistema LogisCore ERP. */

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  rif: string;
  plan: PlanType;
  createdAt: Date;
  deletedAt: Date | null;
}

export type PlanType = 'basic' | 'pro';

export interface Plan {
  name: PlanType;
  maxUsers: number;
  multiWarehouse: boolean;
}

export const PLANS: Record<PlanType, Plan> = {
  basic: { name: 'basic', maxUsers: 3, multiWarehouse: true },
  pro: { name: 'pro', maxUsers: 10, multiWarehouse: true },
};

export type UserRole = 'admin' | 'owner' | 'employee';

export interface UserSession {
  userId: string;
  email: string;
  role: UserRole;
  tenantId: string;
  tenantSlug: string;
  accessToken: string;
}

export interface Subscription {
  id: string;
  tenantId: string;
  plan: PlanType;
  status: 'active' | 'expired' | 'cancelled';
  startedAt: Date;
  expiresAt: Date;
}

/** Permisos RBAC: formato MODULO:ACCION */
export type Permission = `${string}:${string}`;