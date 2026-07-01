import { type Result, success, failure, AppError } from '@logiscore/core';
import { inventoryService } from '../../inventory/services/inventoryService';
import { ReportsErrors } from '../../../specs/reports/errors';
import { useAuthStore } from '../../auth/stores/authStore';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';
import { getPermissionMessage } from '../../auth/permissions/messages';

export async function getLowStockReport(tenantId: string): Promise<Result<{ productId: string; name: string; sku: string; stock: number; minStock: number; categoryName?: string }[], AppError>> {
  const session = useAuthStore.getState().session;
  if (!session || !hasActionPermission(session, 'reports', 'read')) {
    return failure(new AppError('REPORTS_SCOPE_DENIED', getPermissionMessage('reports', 'read')));
  }
  try {
    const result = await inventoryService.getLowStockProducts(tenantId);
    if (!result.ok) {
      return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, result.error.message));
    }
    const products = result.data;
    return success(products.map((p) => ({
      productId: p.id,
      name: p.name,
      sku: p.sku,
      stock: p.stock ?? 0,
      minStock: p.stockMin ?? 0,
      categoryName: p.categoryId,
    })));
  } catch (err) {
    console.error('[lowStockReportService]', err);
    return failure(new AppError(ReportsErrors.REPORT_FETCH_FAILED, 'Error al obtener reporte de bajo stock.'));
  }
}
