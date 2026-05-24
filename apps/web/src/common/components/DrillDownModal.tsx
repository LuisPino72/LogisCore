import { type ReactNode } from 'react';
import { Modal } from './Modal';
import { DataTable, type Column } from './DataTable';
import { X } from 'lucide-react';

interface DrillDownModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  columns: Column<Record<string, unknown>>[];
  data: Record<string, unknown>[];
  loading?: boolean;
  footerSummary?: { label: string; value: string }[];
  children?: ReactNode;
}

export function DrillDownModal({
  isOpen,
  onClose,
  title,
  subtitle,
  columns,
  data,
  loading,
  footerSummary,
  children,
}: DrillDownModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="full"
      footer={
        footerSummary ? (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {footerSummary.map((item, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-xs text-text-secondary">{item.label}:</span>
                <span className="text-sm font-semibold text-gray-900">{item.value}</span>
              </div>
            ))}
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {subtitle && (
          <p className="text-xs text-text-secondary">{subtitle}</p>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="skeleton h-32 w-full rounded-lg" />
          </div>
        ) : data.length > 0 ? (
          <>
            <DataTable
              columns={columns}
              data={data}
              keyExtractor={(item) => String(item.id ?? Math.random())}
              renderCardOnMobile
            />
            {children}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-text-secondary">
            <X size={32} className="mb-2 opacity-40" />
            <p className="text-sm">Sin datos para este periodo</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
