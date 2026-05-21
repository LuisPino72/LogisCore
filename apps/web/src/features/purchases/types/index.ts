import type { PurchaseOrderStatus } from '../../../specs/purchases';

export type TabKey = 'ordenes' | 'proveedores';

export interface TabState {
  searchQuery: string;
  statusFilter: PurchaseOrderStatus | 'all';
  dateFilter: string;
}
