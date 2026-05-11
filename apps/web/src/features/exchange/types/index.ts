export interface ExchangeRateResponse {
  id: string;
  rate: number;
  source: 'bcv_api' | 'manual';
  fetched_at: string | null;
  created_at: string;
}

export interface ExchangeRateState {
  rate: number | null;
  source: 'bcv_api' | 'manual' | null;
  fetchedAt: string | null;
  loading: boolean;
  isUpdating: boolean;
  error: string | null;
}
