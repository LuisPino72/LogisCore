import { useState, useMemo } from 'react';
import { CreditCard, RefreshCw } from 'lucide-react';
import { Badge, Button, Card, DataTable, Pagination } from '../../../common/components';
import type { Column } from '../../../common/components/DataTable';
import type { SubscriptionView } from '../types';
import { RenewSubscriptionModal } from './RenewSubscriptionModal';
import { SectionHeader } from './SectionHeader';

const PAGE_SIZE = 10;

function getSubscriptionProgress(daysRemaining: number): { pct: number; color: string } {
  const maxDays = 30;
  const pct = Math.min(Math.max((daysRemaining / maxDays) * 100, 0), 100);
  const color = daysRemaining <= 0 ? 'var(--color-danger)' : daysRemaining <= 3 ? 'var(--color-warning)' : daysRemaining <= 7 ? 'var(--color-accent)' : 'var(--color-success)';
  return { pct, color };
}

interface SubscriptionSectionProps {
  subscriptions: SubscriptionView[];
  onRenew: (tenantId: string) => Promise<unknown>;
}

export function SubscriptionSection({ subscriptions, onRenew }: SubscriptionSectionProps) {
  const [page, setPage] = useState(1);
  const [renewTarget, setRenewTarget] = useState<SubscriptionView | null>(null);

  const totalPages = Math.max(1, Math.ceil(subscriptions.length / PAGE_SIZE));
  const paginated = subscriptions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: Column<SubscriptionView>[] = useMemo(() => [
    { key: 'tenantName', header: 'Local' },
    {
      key: 'plan',
      header: 'Plan',
      hideOnMobile: true,
      render: (s: SubscriptionView) => (
        <Badge variant="info">{s.plan}</Badge>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (s: SubscriptionView) => {
        const variant = s.status === 'active'
          ? (s.daysRemaining <= 3 ? 'warning' : 'success')
          : 'danger';
        return <Badge variant={variant} className={s.daysRemaining <= 3 && s.status === 'active' ? 'admin-badge-pulse' : ''}>{s.status === 'active' ? 'Activa' : 'Vencida'}</Badge>;
      },
    },
    {
      key: 'expiresAt',
      header: 'Vence',
      render: (s: SubscriptionView) => {
        if (!s.expiresAt) return <span className="text-gray-400">-</span>;
        const date = new Date(s.expiresAt).toLocaleDateString('es-ES');
        const { pct, color } = getSubscriptionProgress(s.daysRemaining);
        return (
          <div className="space-y-1 min-w-25">
            <span className={`text-xs ${s.daysRemaining <= 0 ? 'text-danger font-bold' : s.daysRemaining <= 3 ? 'text-warning font-bold' : s.daysRemaining <= 7 ? 'text-orange-600' : 'text-gray-700'}`}>
              {date} {s.daysRemaining <= 0 ? '(Vencido)' : `(${s.daysRemaining}d)`}
            </span>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 admin-progress-bar"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Acción',
      render: (s: SubscriptionView) => {
        const canRenew = s.daysRemaining <= 0;
        return (
          <Button
            variant={canRenew ? 'primary' : 'ghost'}
            size="sm"
            className="min-h-11"
            disabled={!canRenew}
            onClick={() => setRenewTarget(s)}
          >
            <RefreshCw size={14} />
            <span className="hidden sm:inline">{canRenew ? 'Renovar +30d' : 'Activa'}</span>
          </Button>
        );
      },
    },
  ], []);

  return (
    <>
      <Card className="admin-card-hover">
        <div className="p-4 pb-0">
          <SectionHeader
            icon={<CreditCard size={20} className="text-accent" />}
            title="Suscripciones"
            subtitle={`${subscriptions.length} local${subscriptions.length !== 1 ? 'es' : ''}`}
          />
        </div>
        <div className="p-4 pt-0">
          <DataTable
            columns={columns}
            data={paginated}
            emptyMessage="No hay suscripciones registradas."
            keyExtractor={(s: SubscriptionView) => s.tenantId}
            renderCardOnMobile
          />
          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          )}
        </div>
      </Card>

      <RenewSubscriptionModal
        isOpen={renewTarget !== null}
        onClose={() => setRenewTarget(null)}
        tenantName={renewTarget?.tenantName ?? ''}
        expiresAt={renewTarget?.expiresAt ?? null}
        onConfirm={async () => {
          if (renewTarget) {
            await onRenew(renewTarget.tenantId);
          }
        }}
      />
    </>
  );
}
