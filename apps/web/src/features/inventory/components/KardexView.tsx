import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, Badge, Spinner, EmptyState, DataTable } from '@/common/components';
import type { Column } from '@/common/components';
import { inventoryService } from '../services/inventoryService';
import type { MovementRow } from '../types';

interface KardexViewProps {
  productId: string;
  productName: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function getTypeLabel(type: MovementRow['type']): string {
  switch (type) {
    case 'initial': return 'Stock Inicial';
    case 'purchase': return 'Compra';
    case 'sale': return 'Venta';
    case 'adjustment': return 'Ajuste';
  }
}

function getTypeVariant(type: MovementRow['type']): 'info' | 'success' | 'danger' | 'warning' {
  switch (type) {
    case 'initial': return 'info';
    case 'purchase': return 'success';
    case 'sale': return 'danger';
    case 'adjustment': return 'warning';
  }
}

function getTypeIcon(type: MovementRow['type']) {
  switch (type) {
    case 'purchase': return <TrendingUp size={14} className="text-success" />;
    case 'sale': return <TrendingDown size={14} className="text-danger" />;
    default: return <Minus size={14} className="text-gray-400" />;
  }
}

export function KardexView({ productId, productName }: KardexViewProps) {
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    inventoryService.getProductMovements(productId).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.ok) {
        setMovements(res.data);
      } else {
        setError(res.error.message);
      }
    });
    return () => { cancelled = true; };
  }, [productId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="sm" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-4 bg-danger/5 text-danger text-sm text-center">{error}</Card>
    );
  }

  if (movements.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUp size={32} />}
        title="Sin movimientos"
        description={`No hay movimientos registrados para ${productName}`}
      />
    );
  }

  const columns: Column<MovementRow>[] = [
    {
      key: 'date',
      header: 'Fecha',
      render: (row) => (
        <span className="text-xs whitespace-nowrap">{formatDate(row.date)}</span>
      ),
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (row) => (
        <div className="flex items-center gap-1.5">
          {getTypeIcon(row.type)}
          <Badge variant={getTypeVariant(row.type)}>{getTypeLabel(row.type)}</Badge>
        </div>
      ),
    },
    {
      key: 'entry',
      header: 'Entrada',
      render: (row) => (
        <span className="text-xs font-semibold text-success">{row.entry > 0 ? row.entry.toFixed(2) : '-'}</span>
      ),
    },
    {
      key: 'exit',
      header: 'Salida',
      render: (row) => (
        <span className="text-xs font-semibold text-danger">{row.exit > 0 ? row.exit.toFixed(2) : '-'}</span>
      ),
    },
    {
      key: 'balance',
      header: 'Saldo',
      render: (row) => (
        <span className="text-xs font-bold text-gray-900">{row.balance.toFixed(2)}</span>
      ),
    },
    {
      key: 'reason',
      header: 'Razón',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-xs text-gray-500">{row.reason ?? '-'}</span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={movements}
      keyExtractor={(item: MovementRow) => item.date + item.type}
      emptyMessage="Sin movimientos"
    />
  );
}
