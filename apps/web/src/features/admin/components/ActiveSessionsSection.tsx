import { useState } from 'react';
import { AlertTriangle, Lock, RefreshCw } from 'lucide-react';
import { Button, Card, DataTable, Select } from '../../../common/components';
import type { Column } from '../../../common/components/DataTable';
import { useToastStore } from '../../../stores/toastStore';
import { handleServiceError } from '../../../common/utils/handleServiceError';
import { useActiveSessions } from '../hooks/useActiveSessions';
import { adminService } from '../services/adminService';

interface ActiveSessionsSectionProps {
  tenants: Array<{ id: string; name: string }>;
}

export function ActiveSessionsSection({ tenants }: ActiveSessionsSectionProps) {
  const { addToast } = useToastStore();
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const { sessions, loading, refresh } = useActiveSessions(selectedTenantId || null);
  const [forcingId, setForcingId] = useState<string | null>(null);

  const handleForceClose = async (sessionId: string) => {
    const confirmed = window.confirm('¿Estás seguro de forzar el cierre de esta sesión?');
    if (!confirmed) return;
    setForcingId(sessionId);
    const result = await adminService.forceCloseSession(sessionId);
    if (result.ok) {
      addToast({ type: 'success', message: 'Sesión cerrada forzosamente', duration: 4000 });
      refresh();
    } else {
      handleServiceError(result);
    }
    setForcingId(null);
  };

  const columns: Column<typeof sessions[0]>[] = [
    { key: 'registerName', header: 'Caja', render: (s) => s.registerName || s.registerId || '-' },
    { key: 'openedBy', header: 'Operador', render: (s) => s.operatorId || s.openedBy || '-' },
    {
      key: 'openingBalanceBs',
      header: 'Monto Inicial',
      render: (s) => `Bs ${(s.openingBalanceBs ?? 0).toFixed(2)}`,
      hideOnMobile: true,
    },
    {
      key: 'totalSalesBs',
      header: 'Ventas del día',
      render: (s) => `Bs ${(s.totalSalesBs ?? 0).toFixed(2)}`,
    },
    {
      key: 'actions',
      header: 'Acciones',
      className: 'overflow-visible',
      render: (s) => (
        <Button
          variant="danger"
          size="sm"
          onClick={() => handleForceClose(s.id)}
          disabled={forcingId === s.id}
        >
          <Lock size={14} /> {forcingId === s.id ? 'Cerrando...' : 'Cierre Forzado'}
        </Button>
      ),
    },
  ];

  return (
    <Card>
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle size={20} className="text-warning" />
          <h3 className="text-sm font-semibold text-gray-700">Sesiones Activas</h3>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>

        <Select
          value={selectedTenantId}
          onChange={(e) => setSelectedTenantId(e.target.value)}
        >
          <option value="">Seleccionar local...</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </Select>

        {selectedTenantId && (
          <DataTable
            columns={columns}
            data={sessions}
            loading={loading}
            emptyMessage="No hay sesiones activas"
            keyExtractor={(s) => s.id}
            renderCardOnMobile
          />
        )}
      </div>
    </Card>
  );
}
