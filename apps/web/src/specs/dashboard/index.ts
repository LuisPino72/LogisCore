import { z } from 'zod';

/** Dashboard Spec - DASH-001..003 */

export const DailySummarySchema = z.object({
  totalSales: z.number(),
  totalSalesBs: z.number(),
  cashOnHand: z.number(),
  productsSold: z.number(),
  boxStatus: z.enum(['open', 'closed']),
});

export type DailySummary = z.infer<typeof DailySummarySchema>;

export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  path: string;
  enabled: boolean;
  roles: ('admin' | 'owner' | 'employee')[];
}

export const QUICK_ACTIONS: QuickAction[] = [
  { id: 'pos', label: 'Nueva Venta', icon: 'shopping-cart', path: ':slug/pos', enabled: true, roles: ['owner', 'employee'] },
  { id: 'inventory', label: 'Inventario', icon: 'package', path: ':slug/inventory', enabled: true, roles: ['owner'] },
  { id: 'reports', label: 'Reporte', icon: 'file-text', path: ':slug/reports', enabled: true, roles: ['owner'] },
  { id: 'settings', label: 'Ajustes', icon: 'settings', path: ':slug/settings', enabled: true, roles: ['owner'] },
];

export const EMPLOYEE_QUICK_ACTIONS = QUICK_ACTIONS.filter(a => a.id === 'pos');