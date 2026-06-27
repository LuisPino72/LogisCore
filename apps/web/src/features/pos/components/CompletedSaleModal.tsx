import { CheckCircle2, FileText, MessageCircle } from 'lucide-react';
import { Modal, Button, Badge } from '../../../common/components';
import { formatBs, formatUsd } from '@/lib/formatBs';
import { METADATA_PAGOS } from '../../../specs/pos';
import type { CompletedSaleData } from '../types';

export interface CompletedSaleModalProps {
  completedSale: CompletedSaleData | null;
  sharing: boolean;
  onShare: (mode: 'ticket' | 'text') => void;
  onClose: () => void;
}

export function CompletedSaleModal({ completedSale, sharing, onShare, onClose }: CompletedSaleModalProps) {
  return (
    <Modal
      isOpen={completedSale !== null}
      onClose={onClose}
      title="Venta completada"
      size="sm"
    >
      {completedSale && (
        <div className="flex flex-col items-center gap-4 py-2 animate-slide-down">
          <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center animate-check-pop">
            <CheckCircle2 size={32} className="text-success" />
          </div>
          <p className="text-(length:--text-fluid-2xl) font-bold text-gray-900">{formatUsd(completedSale.totalUsd)}</p>
          <p className="text-sm text-text-secondary -mt-2">{formatBs(completedSale.totalBs)}</p>
          <Badge variant="success" className="text-xs">
            {METADATA_PAGOS[completedSale.paymentMethod]?.label ?? completedSale.paymentMethod}
          </Badge>

          <div className="flex flex-col gap-2 w-full pt-2">
            <Button
              variant="primary"
              fullWidth
              onClick={() => onShare('ticket')}
              disabled={sharing}
              className="min-h-11"
              style={{ backgroundColor: '#25D366', borderColor: '#25D366', color: 'white' }}
            >
              <FileText size={16} />
              {sharing ? 'Enviando...' : 'Ticket por WhatsApp'}
            </Button>
            {completedSale.customerPhone && (
              <Button
                variant="secondary"
                fullWidth
                onClick={() => onShare('text')}
                disabled={sharing}
                className="min-h-11"
                style={{ backgroundColor: '#25D366', borderColor: '#25D366', color: 'white' }}
              >
                <MessageCircle size={16} />
                {sharing ? 'Enviando...' : 'Solo texto por WhatsApp'}
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
