import { getDb } from '../../../services/dexie/db';
import { success, type Result, type AppError } from '@logiscore/core';

export interface DeliverySettlementRow {
  name: string;
  deliveryCount: number;
  totalFees: number;
  paidAmount: number;
  pendingAmount: number;
}

export async function getDeliverySettlement(
  tenantId: string,
  startDate: string,
  endDate: string,
): Promise<Result<DeliverySettlementRow[], AppError>> {
  const db = getDb();

  const sales = await db.sales
    .where('[tenantId+status+createdAt]')
    .between(
      [tenantId, 'entregada', startDate],
      [tenantId, 'entregada', endDate]
    )
    .filter((s) => !s.deletedAt && !!s.deliveryPersonName)
    .toArray();

  if (sales.length === 0) {
    return success([]);
  }

  const saleIds = new Set(sales.map(s => s.id));
  const expenses = await db.expenses
    .where('tenantId')
    .equals(tenantId)
    .filter((e) =>
      e.category === 'DELIVERY' &&
      !e.deletedAt &&
      !!e.saleId && saleIds.has(e.saleId)
    )
    .toArray();

  const grouped = new Map<string, { sales: typeof sales; expenses: typeof expenses }>();

  for (const sale of sales) {
    const name = sale.deliveryPersonName!;
    if (!grouped.has(name)) {
      grouped.set(name, { sales: [], expenses: [] });
    }
    grouped.get(name)!.sales.push(sale);
  }

  for (const expense of expenses) {
    const sale = sales.find(s => s.id === expense.saleId);
    if (sale?.deliveryPersonName) {
      const entry = grouped.get(sale.deliveryPersonName);
      if (entry) {
        entry.expenses.push(expense);
      }
    }
  }

  const rows: DeliverySettlementRow[] = [];
  for (const [name, data] of grouped) {
    const totalFees = data.sales.reduce((sum, s) => sum + (s.deliveryFee || 0), 0);
    const paidAmount = data.expenses
      .filter(e => e.status === 'paid')
      .reduce((sum, e) => sum + (e.amountUsd || 0), 0);
    const pendingAmount = data.expenses
      .filter(e => e.status === 'pending')
      .reduce((sum, e) => sum + (e.amountUsd || 0), 0);

    rows.push({
      name,
      deliveryCount: data.sales.length,
      totalFees: Math.round(totalFees * 100) / 100,
      paidAmount: Math.round(paidAmount * 100) / 100,
      pendingAmount: Math.round(pendingAmount * 100) / 100,
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return success(rows);
}

export async function markDeliverySettlementPaid(
  tenantId: string,
  personName: string,
  startDate: string,
  endDate: string,
): Promise<Result<number, AppError>> {
  const db = getDb();

  const sales = await db.sales
    .where('[tenantId+status+createdAt]')
    .between(
      [tenantId, 'entregada', startDate],
      [tenantId, 'entregada', endDate]
    )
    .filter(s => !s.deletedAt && s.deliveryPersonName === personName)
    .toArray();

  const saleIds = new Set(sales.map(s => s.id));
  const expenses = await db.expenses
    .where('tenantId')
    .equals(tenantId)
    .filter(e =>
      e.category === 'DELIVERY' &&
      !e.deletedAt &&
      !!e.saleId && saleIds.has(e.saleId) &&
      e.status === 'pending'
    )
    .toArray();

  const now = new Date().toISOString();
  await db.expenses.bulkUpdate(expenses.map(e => ({
    key: e.id,
    changes: { status: 'paid' as const, updatedAt: now },
  })));

  return success(expenses.length);
}
