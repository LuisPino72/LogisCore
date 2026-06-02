import { useState, useEffect, useMemo, useCallback } from 'react';
import { Shield, Clock } from 'lucide-react';
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  Pagination,
  SearchableSelect,
  Select,
  Spinner,
  Tabs,
} from '../../../common/components';
import type { Column } from '../../../common/components/DataTable';
import type { Tab } from '../../../common/components/Tabs';
import { getDb, isDbReady, type DexieAuditEntry } from '../../../services/dexie/db';
import type { OutboxEntry } from '@logiscore/core';
import { adminService } from '../services/adminService';

type SubTab = 'audit' | 'outbox';
type DateRange = 'today' | 'week' | 'month' | 'all';

const MODULE_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'POS', label: 'POS' },
  { value: 'Inventory', label: 'Inventario' },
  { value: 'Production', label: 'Producción' },
  { value: 'Purchases', label: 'Compras' },
  { value: 'Gastos', label: 'Gastos' },
  { value: 'Admin', label: 'Admin' },
  { value: 'Auth', label: 'Auth' },
  { value: 'Sync', label: 'Sync' },
  { value: 'Exchange', label: 'Exchange' },
];

const DATE_RANGES: { value: DateRange; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Últimos 7 días' },
  { value: 'month', label: 'Último mes' },
  { value: 'all', label: 'Todo' },
];

const PAGE_SIZE = 20;

function getDateRangeStart(range: DateRange): string | null {
  if (range === 'all') return null;
  const now = new Date();
  if (range === 'today') {
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  if (range === 'week') {
    now.setDate(now.getDate() - 7);
    return now.toISOString();
  }
  if (range === 'month') {
    now.setMonth(now.getMonth() - 1);
    return now.toISOString();
  }
  return null;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-VE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function severityBadge(severity: string) {
  switch (severity) {
    case 'WARNING':
      return <Badge variant="warning">WARNING</Badge>;
    default:
      return <Badge variant="info">INFO</Badge>;
  }
}

function outboxStatusBadge(status: OutboxEntry['status']) {
  switch (status) {
    case 'pending':
      return <Badge variant="warning">Pendiente</Badge>;
    case 'processing':
      return <Badge variant="info">Procesando</Badge>;
    case 'processed':
      return <Badge variant="success">Procesado</Badge>;
    case 'failed':
      return <Badge variant="danger">Fallido</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
}

function auditStatusBadge(status: DexieAuditEntry['status']) {
  switch (status) {
    case 'synced':
      return <Badge variant="success">Sincronizado</Badge>;
    case 'pending':
      return <Badge variant="warning">Pendiente</Badge>;
    default:
      return <Badge variant="danger">{status}</Badge>;
  }
}

export function AuditSection() {
  const [subTab, setSubTab] = useState<SubTab>('audit');
  const [dateRange, setDateRange] = useState<DateRange>('week');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [tenantFilter, setTenantFilter] = useState('');
  const [tenants, setTenants] = useState<Array<{ id: string; name: string }>>([]);
  const [auditEntries, setAuditEntries] = useState<DexieAuditEntry[]>([]);
  const [outboxEntries, setOutboxEntries] = useState<OutboxEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [auditPage, setAuditPage] = useState(1);
  const [outboxPage, setOutboxPage] = useState(1);

  useEffect(() => {
    adminService.fetchTenants().then((result) => {
      if (result.ok) {
        setTenants(result.data.map((t) => ({ id: t.id, name: t.name })));
      }
    });
  }, []);

  const loadData = useCallback(async () => {
    if (!isDbReady()) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const db = getDb();
      const startDate = getDateRangeStart(dateRange);

      const auditQuery = db.auditEntries.orderBy('createdAt').reverse();
      const outboxQuery = db.outbox.orderBy('createdAt').reverse();

      let auditData = await auditQuery.toArray();
      let outboxData = await outboxQuery.toArray();

      if (startDate) {
        auditData = auditData.filter((e) => e.createdAt >= startDate);
        outboxData = outboxData.filter((e) => e.createdAt >= startDate);
      }

      if (moduleFilter !== 'all') {
        auditData = auditData.filter((e) => e.module === moduleFilter);
        outboxData = outboxData.filter((e) => e.module === moduleFilter);
      }

      if (tenantFilter) {
        auditData = auditData.filter((e) => e.tenantId === tenantFilter);
      }

      setAuditEntries(auditData);
      setOutboxEntries(outboxData);
    } catch (err) {
      console.warn('[AuditSection] Error cargando datos:', err);
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, moduleFilter, tenantFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setAuditPage(1);
    setOutboxPage(1);
  }, [dateRange, moduleFilter, tenantFilter]);

  const tenantOptions = useMemo(() => [
    { value: '', label: 'Todos los tenants' },
    ...tenants.map((t) => ({ value: t.id, label: t.name })),
  ], [tenants]);

  const auditTotalPages = Math.max(1, Math.ceil(auditEntries.length / PAGE_SIZE));
  const outboxTotalPages = Math.max(1, Math.ceil(outboxEntries.length / PAGE_SIZE));
  const paginatedAudit = auditEntries.slice((auditPage - 1) * PAGE_SIZE, auditPage * PAGE_SIZE);
  const paginatedOutbox = outboxEntries.slice((outboxPage - 1) * PAGE_SIZE, outboxPage * PAGE_SIZE);

  const subTabs: Tab[] = useMemo(() => [
    { key: 'audit', label: 'Auditoría', icon: <Shield size={16} /> },
    { key: 'outbox', label: 'Outbox', icon: <Clock size={16} /> },
  ], []);

  const auditColumns: Column<DexieAuditEntry>[] = useMemo(() => [
    {
      key: 'createdAt',
      header: 'Fecha',
      render: (e) => <span className="text-xs text-gray-500">{formatDate(e.createdAt)}</span>,
    },
    {
      key: 'eventName',
      header: 'Evento',
      render: (e) => (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{e.eventName}</span>
          {severityBadge(e.severity)}
        </div>
      ),
    },
    {
      key: 'module',
      header: 'Módulo',
      render: (e) => <Badge variant="neutral">{e.module}</Badge>,
    },
    {
      key: 'userId',
      header: 'Usuario',
      render: (e) => <span className="text-sm text-gray-600 truncate max-w-24">{e.userId || '-'}</span>,
      hideOnMobile: true,
    },
    {
      key: 'tenantId',
      header: 'Tenant',
      render: (e) => <span className="text-sm text-gray-600 truncate max-w-24">{e.tenantId || '-'}</span>,
      hideOnMobile: true,
    },
    {
      key: 'status',
      header: 'Status',
      render: (e) => auditStatusBadge(e.status),
    },
  ], []);

  const outboxColumns: Column<OutboxEntry>[] = useMemo(() => [
    {
      key: 'createdAt',
      header: 'Fecha',
      render: (e) => <span className="text-xs text-gray-500">{formatDate(e.createdAt)}</span>,
    },
    {
      key: 'event',
      header: 'Evento',
      render: (e) => <span className="text-sm font-medium">{e.event}</span>,
    },
    {
      key: 'module',
      header: 'Módulo',
      render: (e) => <Badge variant="neutral">{e.module}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (e) => outboxStatusBadge(e.status),
    },
    {
      key: 'retries',
      header: 'Reintentos',
      render: (e) => <span className="text-sm">{e.retries}</span>,
      hideOnMobile: true,
    },
    {
      key: 'lastError',
      header: 'Error',
      render: (e) => e.lastError
        ? <span className="text-xs text-red-500 truncate max-w-32" title={e.lastError}>{e.lastError}</span>
        : <span className="text-gray-400">-</span>,
      hideOnMobile: true,
    },
  ], []);

  return (
    <Card>
      <div className="p-4 pb-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Shield size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-title font-bold text-gray-900">Auditoría</h2>
            <p className="text-xs text-text-secondary">
              {auditEntries.length} evento{auditEntries.length !== 1 ? 's' : ''} de auditoría · {outboxEntries.length} en outbox
            </p>
          </div>
        </div>

        <Tabs tabs={subTabs} activeKey={subTab} onChange={(k) => setSubTab(k as SubTab)} className="mb-4" />

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="w-36"
          >
            {DATE_RANGES.map((dr) => (
              <option key={dr.value} value={dr.value}>{dr.label}</option>
            ))}
          </Select>
          <Select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="w-36"
          >
            {MODULE_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>
          {subTab === 'audit' && (
            <SearchableSelect
              value={tenantFilter}
              onChange={setTenantFilter}
              options={tenantOptions}
              placeholder="Todos los tenants"
              className="flex-1 min-w-40"
            />
          )}
        </div>
      </div>

      <div className="p-4 pt-0">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size="md" />
          </div>
        ) : subTab === 'audit' ? (
          <>
            <DataTable
              columns={auditColumns}
              data={paginatedAudit}
              emptyMessage="No hay eventos de auditoría para los filtros seleccionados."
              keyExtractor={(e) => String(e.id)}
              renderCardOnMobile
            />
            {auditEntries.length === 0 && (
              <EmptyState
                icon={<Shield size={32} />}
                title="Sin eventos de auditoría"
                description="Los eventos de auditoría aparecerán aquí cuando se registren acciones críticas en el sistema."
              />
            )}
            {auditTotalPages > 1 && (
              <Pagination page={auditPage} totalPages={auditTotalPages} onPageChange={setAuditPage} />
            )}
          </>
        ) : (
          <>
            <DataTable
              columns={outboxColumns}
              data={paginatedOutbox}
              emptyMessage="No hay eventos en outbox para los filtros seleccionados."
              keyExtractor={(e) => String(e.id)}
              renderCardOnMobile
            />
            {outboxEntries.length === 0 && (
              <EmptyState
                icon={<Clock size={32} />}
                title="Outbox vacío"
                description="Los eventos pendientes de procesamiento aparecerán aquí."
              />
            )}
            {outboxTotalPages > 1 && (
              <Pagination page={outboxPage} totalPages={outboxTotalPages} onPageChange={setOutboxPage} />
            )}
          </>
        )}
      </div>
    </Card>
  );
}
