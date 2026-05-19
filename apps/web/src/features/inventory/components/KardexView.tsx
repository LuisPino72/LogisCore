import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, Badge, EmptyState, DataTable } from '@/common/components';
import type { Column } from '@/common/components';
import { inventoryService } from '../services/inventoryService';
import type { MovementRow } from '../types';
import { gramsToKg, mlToLt } from '../types';

interface KardexViewProps {
  productId: string;
  productName: string;
  unit?: string;
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

function displayQty(value: number, unit?: string): string {
  if (unit === 'kg') return gramsToKg(value).toFixed(2);
  if (unit === 'lt') return mlToLt(value).toFixed(2);
  return value.toFixed(2);
}

function unitLabel(unit?: string): string {
  if (unit === 'kg') return 'Kg';
  if (unit === 'lt') return 'Lt';
  return '';
}

export function KardexView({ productId, productName, unit }: KardexViewProps) {
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
      <div className="space-y-3">
        <div className="skeleton h-5 w-40 rounded" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-lg" />
          ))}
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-10 rounded" />
        ))}
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

  const totalEntries = movements.reduce((s, m) => s + m.entry, 0);
  const totalExits = movements.reduce((s, m) => s + m.exit, 0);
  const currentBalance = movements.length > 0 ? movements[movements.length - 1].balance : 0;
  const label = unitLabel(unit);

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
        <span className="text-xs font-semibold text-success">{row.entry > 0 ? `${displayQty(row.entry, unit)} ${label}` : '-'}</span>
      ),
    },
    {
      key: 'exit',
      header: 'Salida',
      render: (row) => (
        <span className="text-xs font-semibold text-danger">{row.exit > 0 ? `${displayQty(row.exit, unit)} ${label}` : '-'}</span>
      ),
    },
    {
      key: 'balance',
      header: 'Saldo',
      render: (row) => (
        <span className="text-xs font-bold text-gray-900">{displayQty(row.balance, unit)} {label}</span>
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
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200/60 text-center">
          <p className="text-[10px] text-text-secondary uppercase tracking-wide">Entradas</p>
          <p className="text-base font-bold text-emerald-700">{displayQty(totalEntries, unit)} {label}</p>
        </div>
        <div className="p-3 rounded-lg bg-red-50 border border-red-200/60 text-center">
          <p className="text-[10px] text-text-secondary uppercase tracking-wide">Salidas</p>
          <p className="text-base font-bold text-red-700">{displayQty(totalExits, unit)} {label}</p>
        </div>
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200/60 text-center">
          <p className="text-[10px] text-text-secondary uppercase tracking-wide">Saldo</p>
          <p className="text-base font-bold text-blue-700">{displayQty(currentBalance, unit)} {label}</p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={movements}
        keyExtractor={(item: MovementRow) => item.date + item.type}
        emptyMessage="Sin movimientos"
      />
    </div>
  );
}
