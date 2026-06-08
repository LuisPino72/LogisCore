export interface TenantInfoResponse {
  name: string;
  slug: string;
  rif: string;
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

export interface DashboardState {
  tenantInfo: TenantInfoResponse | null;
  subscription: SubscriptionResponse | null;
  error: string | null;
}

export type { Product } from '../../inventory/types';
