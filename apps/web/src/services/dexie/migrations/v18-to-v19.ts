/**
 * BACKLOG-106 [PURCHASES-001] — Migración Dexie v18 → v19
 * Agrega índice [tenantId+rif] a tabla suppliers.
 * Campo rif es opcional (nullable); no requiere backfill.
 * Si suppliers existentes tuvieran rif (no debería, es nuevo campo), se preservan.
 */
import { logger } from '../../../lib/logger';
import type { Table } from 'dexie';
import type { DexieSupplier } from '../db';

export interface V18ToV19Context {
  suppliers: Table<DexieSupplier, string>;
}

export async function migrateV18ToV19(ctx: V18ToV19Context): Promise<void> {
  // No data migration needed: rif is a new optional field.
  // Dexie v19 schema recreates suppliers table with new index [tenantId+rif];
  // existing rows survive with rif=undefined.
  const count = await ctx.suppliers.count();
  logger.info('Dexie', `[v18→v19] suppliers table preserved (${count} rows); rif index added.`);
}
