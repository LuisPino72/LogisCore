import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/dexie/db', () => ({
  getDb: () => ({}),
  isDbReady: () => true,
}));
vi.mock('../../services/sync/syncQueue', () => ({ syncQueue: { enqueue: vi.fn() } }));
vi.mock('../../services/outbox/outboxService', () => ({
  outboxService: { enqueue: vi.fn(() => Promise.resolve({ ok: true, data: 1 })) },
}));
vi.mock('../../services/audit/emitWithAudit', () => ({
  emitWithAudit: vi.fn(async () => undefined),
  emitEngineEvent: vi.fn(),
}));
vi.mock('../../services/network/requireNetwork', () => ({
  requireNetwork: vi.fn(() => ({ ok: true, data: undefined })),
}));
vi.mock('../../services/network/networkAwareService', () => ({
  networkAware: { isOnline: () => true },
}));
vi.mock('../../features/auth/services/roleGuard', () => ({
  requireRole: vi.fn(),
}));
vi.mock('../../features/auth/stores/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      session: { userId: 'u1', email: 'a@b.c', role: 'owner', tenantId: 't1' },
    }),
  },
}));

import * as gastosServiceModule from '../../features/gastos/services/gastosService';

describe('DINERO-019: getMonthlyOperatingExpenses eliminada (código muerto)', () => {
  it('Given: gastosService tras commit. When: buscar getMonthlyOperatingExpenses. Then: función no existe como método ni export top-level', () => {
    const exportedNames = Object.keys(gastosServiceModule);
    expect(exportedNames).not.toContain('getMonthlyOperatingExpenses');
    const service = gastosServiceModule.gastosService as unknown as Record<string, unknown>;
    expect(service.getMonthlyOperatingExpenses).toBeUndefined();
  });

  it('Given: gastosService. When: importar gastosService. Then: otras funciones siguen existiendo (no regresión)', () => {
    expect(gastosServiceModule.gastosService).toBeDefined();
    const exported = gastosServiceModule.gastosService as unknown as Record<string, unknown>;
    expect(typeof exported.getAll).toBe('function');
    expect(typeof exported.getRecurringTemplates).toBe('function');
    expect(typeof exported.cancelOccurrence).toBe('function');
  });

  it('Documenta el motivo del borrado: getMonthlyOperatingExpenses era código muerto detectado en re-auditoría 2026-06-05. No se llamaba desde ningún módulo. Mantenida por error histórico. Riesgo latente: si se conectaba a UI sin excluir COMPRA_INVENTARIO, distorsionaba reportes de gastos operativos.', () => {
    const service = gastosServiceModule.gastosService as unknown as Record<string, unknown>;
    const isGone = service.getMonthlyOperatingExpenses === undefined;
    expect(isGone).toBe(true);
  });
});
