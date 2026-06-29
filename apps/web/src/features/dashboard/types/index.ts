export interface TenantInfoResponse {
  name: string;
  slug: string;
  rif: string;
  direccion?: string;
  telefono?: string;
  logoUrl?: string;
}

export interface SubscriptionResponse {
  plan: string;
  status: string;
  expires_at: string | null;
}

export interface TopProduct {
  productId: string;
  name: string;
  totalQty: number;
  isWeighted: boolean;
}

export interface PendingTask {
  id: string;
  type: 'expense' | 'order' | 'credit' | 'delivery';
  title: string;
  subtitle: string;
  amount?: number;
  route: string;
  totalCount?: number;
}

export interface ActivityEntry {
  id: string;
  type: 'sale_completed' | 'sale_voided' | 'expense_created' | 'debt_collected' | 'purchase_received' | 'supplier_paid';
  message: string;
  timestamp: string;
  icon: string;
  route?: string;
  entityId?: string;
}

export interface DashboardState {
  tenantInfo: TenantInfoResponse | null;
  subscription: SubscriptionResponse | null;
  error: string | null;
}

export type { Product } from '../../inventory/types';
