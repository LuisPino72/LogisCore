import { useState, useEffect } from 'react';
import { CreditCard, ExternalLink } from 'lucide-react';
import { Card, Badge, Skeleton, Alert } from '../../../common/components';
import { dashboardService } from '../../dashboard/services/dashboardService';
import type { SubscriptionResponse } from '../../dashboard/types';

interface SubscriptionTabProps {
  tenantId: string;
}

export function SubscriptionTab({ tenantId }: SubscriptionTabProps) {
  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    dashboardService.getSubscriptionInfo(tenantId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.ok) {
        setSubscription(result.data);
      } else {
        setError(result.error.message);
      }
    });

    return () => { cancelled = true; };
  }, [tenantId]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('es-VE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="success">Activo</Badge>;
      case 'inactive':
        return <Badge variant="neutral">Inactivo</Badge>;
      case 'expired':
        return <Badge variant="danger">Vencido</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const planLabel = (plan: string) => {
    switch (plan) {
      case 'basic': return 'Básico';
      case 'pro': return 'Profesional';
      case 'premium': return 'Premium';
      default: return plan;
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow duration-200">
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <CreditCard size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Suscripción</h2>
            <p className="text-sm text-gray-500">
              Estado y detalles de tu plan de LogisCore.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton variant="shimmer" className="h-6 w-48 rounded-lg" />
            <Skeleton variant="shimmer" className="h-6 w-32 rounded-lg" />
            <Skeleton variant="shimmer" className="h-6 w-56 rounded-lg" />
          </div>
        ) : error ? (
          <Alert variant="error">{error}</Alert>
        ) : subscription ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Plan</p>
                <p className="text-base font-medium text-gray-900">{planLabel(subscription.plan)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Estado</p>
                <div className="mt-0.5">{statusBadge(subscription.status)}</div>
              </div>
              <div>
                <p className="text-sm text-gray-500">Vencimiento</p>
                <p className="text-base text-gray-900">{formatDate(subscription.expires_at)}</p>
              </div>
            </div>

            <div className="pt-2">
              <a
                href="https://wa.me/584145180265?text=Hola%20Luis,%20necesito%20soporte%20con%20mi%20cuenta%20de%20LogisCore"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary-dark font-medium underline underline-offset-2 transition-colors duration-200"
              >
                <ExternalLink size={16} />
                Contactar a Soporte Técnico
              </a>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500">No hay información de suscripción disponible.</p>
        )}
      </div>
    </Card>
  );
}
