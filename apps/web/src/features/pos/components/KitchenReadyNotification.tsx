import { useState, useEffect, useCallback } from 'react';
import { Button, Card } from '@/common/components';
import { X, ChefHat, Send } from 'lucide-react';

interface KitchenReadyNotificationProps {
  saleId: string;
  customerName: string;
  orderNumber: string;
  onDismiss: () => void;
  onViewOrder: () => void;
  onSendSummary?: (saleId: string) => void;
}

export function KitchenReadyNotification({
  saleId,
  customerName,
  orderNumber,
  onDismiss,
  onViewOrder,
  onSendSummary,
}: KitchenReadyNotificationProps) {
  const [exiting, setExiting] = useState(false);

  const triggerDismiss = useCallback(() => {
    setExiting(true);
  }, []);

  useEffect(() => {
    const timer = setTimeout(triggerDismiss, 15000);
    return () => clearTimeout(timer);
  }, [saleId, triggerDismiss]);

  useEffect(() => {
    if (!exiting) return;
    const timer = setTimeout(onDismiss, 300);
    return () => clearTimeout(timer);
  }, [exiting, onDismiss]);

  const handleDismiss = useCallback(() => {
    setExiting(true);
  }, []);

  const handleView = useCallback(() => {
    setExiting(true);
    setTimeout(onViewOrder, 300);
  }, [onViewOrder]);

  return (
    <div
      className={exiting ? 'animate-slide-out-down' : 'animate-slide-down'}
      role="alert"
      aria-live="polite"
    >
      <Card className="border-success/30 bg-success/5 shadow-lg">
        <div className="flex items-start gap-3 p-3">
          <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center shrink-0">
            <ChefHat size={20} className="text-success" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">
              Pedido de {customerName || 'Cliente'} LISTO
            </p>
            <p className="text-xs text-text-secondary mt-0.5">{orderNumber}</p>
            <div className="flex items-center gap-2 mt-2">
              <Button variant="primary" size="sm" onClick={handleView} className="min-h-11 text-xs">
                Ver pedido
              </Button>
              {onSendSummary && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onSendSummary(saleId)}
                  className="min-h-11 w-full text-xs"
                >
                  <Send size={14} className="mr-1" />
                  Enviar resumen
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="min-h-11 min-w-11 p-0"
                aria-label="Cerrar notificación"
              >
                <X size={14} />
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
