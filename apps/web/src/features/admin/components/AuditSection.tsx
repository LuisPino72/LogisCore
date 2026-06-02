import { useState, useEffect, useMemo, useCallback } from 'react';
import { Shield, Clock } from 'lucide-react';
import {
  Badge,
  Card,
  DataTable,
  Pagination,
  SearchableSelect,
  Select,
  Spinner,
  Tabs,
} from '../../../common/components';
import type { Column } from '../../../common/components/DataTable';
import type { Tab } from '../../../common/components/Tabs';
import { adminService, type AuditEntry, type OutboxEntryRow } from '../services/adminService';

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

function outboxStatusBadge(status: string) {
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

export function AuditSection() {
  const [subTab, setSubTab] = useState<SubTab>('audit');
  const [dateRange, setDateRange] = useState<DateRange>('week');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [tenantFilter, setTenantFilter] = useState('');
  const [tenants, setTenants] = useState<Array<{ id: string; name: string }>>([]);
  const [userEmailMap, setUserEmailMap] = useState<Map<string, string>>(new Map());
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [outboxEntries, setOutboxEntries] = useState<OutboxEntryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [auditPage, setAuditPage] = useState(1);
  const [outboxPage, setOutboxPage] = useState(1);

  useEffect(() => {
    adminService.fetchTenants().then((result) => {
      if (result.ok) {
        setTenants(result.data.map((t) => ({ id: t.id, name: t.name })));
      }
    });
    adminService.fetchAllUsers().then((result) => {
      if (result.ok) {
        const map = new Map<string, string>();
        result.data.forEach((u) => {
          if (u.email) map.set(u.userId, u.email);
        });
        setUserEmailMap(map);
      }
    });
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const startDate = getDateRangeStart(dateRange);

      // Audit: leer de Supabase (admin tiene internet estable)
      const auditResult = await adminService.fetchAuditEntries({
        dateRange: { start: startDate },
        module: moduleFilter,
        tenantId: tenantFilter || null,
        limit: 500,
      });

      if (auditResult.ok) {
        setAuditEntries(auditResult.data);
      } else {
        console.warn('[AuditSection] Error cargando audit:', auditResult.error.message);
        setAuditEntries([]);
      }

      // Outbox: leer de Supabase (cola global de eventos por procesar)
      const outboxResult = await adminService.fetchOutboxEntries({
        dateRange: { start: startDate },
        module: moduleFilter,
        limit: 200,
      });

      if (outboxResult.ok) {
        setOutboxEntries(outboxResult.data);
      } else {
        console.warn('[AuditSection] Error cargando outbox:', outboxResult.error.message);
        setOutboxEntries([]);
      }
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

  const tenantNameMap = useMemo(() => {
    const map = new Map<string, string>();
    tenants.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [tenants]);

  const auditTotalPages = Math.max(1, Math.ceil(auditEntries.length / PAGE_SIZE));
  const outboxTotalPages = Math.max(1, Math.ceil(outboxEntries.length / PAGE_SIZE));
  const paginatedAudit = auditEntries.slice((auditPage - 1) * PAGE_SIZE, auditPage * PAGE_SIZE);
  const paginatedOutbox = outboxEntries.slice((outboxPage - 1) * PAGE_SIZE, outboxPage * PAGE_SIZE);

  const subTabs: Tab[] = useMemo(() => [
    { key: 'audit', label: 'Auditoría', icon: <Shield size={16} /> },
    { key: 'outbox', label: 'Outbox', icon: <Clock size={16} /> },
  ], []);

  const auditColumns: Column<AuditEntry>[] = useMemo(() => [
    {
      key: 'createdAt',
      header: 'Fecha',
      render: (e) => <span className="font-mono text-xs text-gray-500">{formatDate(e.createdAt)}</span>,
    },
    {
      key: 'eventName',
      header: 'Evento',
      render: (e) => (
        <div className="flex items-center gap-2 border-l-2 border-primary/40 pl-2 min-w-0">
          <span className="font-mono text-sm font-medium truncate">{e.eventName}</span>
          {severityBadge(e.severity)}
        </div>
      ),
    },
    {
      key: 'eventModule',
      header: 'Módulo',
      render: (e) => <Badge variant="neutral">{e.eventModule}</Badge>,
    },
    {
      key: 'userId',
      header: 'Usuario',
      render: (e) => {
        const emailFromPayload = (e.payload as Record<string, unknown> | null)?.email as string | undefined;
        const emailFromMap = e.userId ? userEmailMap.get(e.userId) : undefined;
        const display = emailFromPayload || emailFromMap || e.userId?.slice(0, 8) || '-';
        return (
          <span className="text-sm text-gray-700 truncate max-w-40" title={display}>
            {display}
          </span>
        );
      },
      hideOnMobile: true,
    },
    {
      key: 'tenantId',
      header: 'Tenant',
      render: (e) => {
        const name = e.tenantId ? tenantNameMap.get(e.tenantId) : null;
        return (
          <span className="text-sm text-gray-700 truncate max-w-40" title={name || e.tenantId || ''}>
            {name || e.tenantId?.slice(0, 8) || '-'}
          </span>
        );
      },
      hideOnMobile: true,
    },
  ], [tenantNameMap, userEmailMap]);

  const outboxColumns: Column<OutboxEntryRow>[] = useMemo(() => [
    {
      key: 'createdAt',
      header: 'Fecha',
      render: (e) => <span className="font-mono text-xs text-gray-500">{formatDate(e.createdAt)}</span>,
    },
    {
      key: 'event',
      header: 'Evento',
      render: (e) => (
        <div className="border-l-2 border-primary/40 pl-2 min-w-0">
          <span className="font-mono text-sm font-medium truncate block">{e.event}</span>
        </div>
      ),
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
      render: (e) => <span className="font-mono text-sm">{e.retries}</span>,
      hideOnMobile: true,
    },
    {
      key: 'lastError',
      header: 'Error',
      render: (e) => e.lastError
        ? <span className="font-mono text-xs text-red-500 truncate max-w-32" title={e.lastError}>{e.lastError}</span>
        : <span className="text-gray-400">-</span>,
      hideOnMobile: true,
    },
  ], []);

  const activeCount = subTab === 'audit' ? auditEntries.length : outboxEntries.length;
  const activeCountLabel =
    subTab === 'audit'
      ? `${activeCount} evento${activeCount !== 1 ? 's' : ''} de auditoría`
      : `${activeCount} evento${activeCount !== 1 ? 's' : ''} en outbox`;

  return (
    <Card className="audit-container @container pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="p-4 pb-0">
        <div className="relative overflow-hidden flex items-center gap-3 mb-4 rounded-lg bg-linear-to-br from-primary/5 to-transparent p-3">
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle,rgba(13,148,136,0.06)_1px,transparent_1px)] bg-size-[16px_16px]"
          />
          <div className="relative w-10 h-10 rounded-xl bg-primary/15 ring-1 ring-primary/20 flex items-center justify-center shrink-0">
            <Shield size={20} className="text-primary" />
          </div>
          <div className="relative min-w-0">
            <h2 className="text-[clamp(1.125rem,1rem+0.5vw,1.5rem)] font-title font-bold text-gray-900 leading-tight">
              Auditoría
            </h2>
            <p className="text-xs text-text-secondary font-mono truncate">{activeCountLabel}</p>
          </div>
        </div>

        <Tabs tabs={subTabs} activeKey={subTab} onChange={(k) => setSubTab(k as SubTab)} className="mb-4" />

        <div className="flex flex-wrap items-center gap-2 mb-4 @md:flex-nowrap @md:flex-row">
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
            {outboxTotalPages > 1 && (
              <Pagination page={outboxPage} totalPages={outboxTotalPages} onPageChange={setOutboxPage} />
            )}
          </>
        )}
      </div>
    </Card>
  );
}
