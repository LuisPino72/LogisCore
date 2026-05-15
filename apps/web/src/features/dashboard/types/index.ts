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

export interface DashboardState {
  tenantInfo: TenantInfoResponse | null;
  employees: number;
  subscription: SubscriptionResponse | null;
  todayEarnings: number;
  loading: boolean;
  error: string | null;
}
