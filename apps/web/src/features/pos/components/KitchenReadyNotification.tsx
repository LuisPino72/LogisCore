import { useState, useEffect, useCallback } from 'react';
import { Button, Card } from '@/common/components';
import { X, ChefHat } from 'lucide-react';

interface KitchenReadyNotificationProps {
  saleId: string;
  customerName: string;
  orderNumber: string;
  onDismiss: () => void;
  onViewOrder: () => void;
}

export function KitchenReadyNotification({
  saleId,
  customerName,
  orderNumber,
  onDismiss,
  onViewOrder,
}: KitchenReadyNotificationProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, 15000);
    return () => clearTimeout(timer);
  }, [saleId, onDismiss]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setTimeout(onDismiss, 300);
  }, [onDismiss]);

  const handleView = useCallback(() => {
    setVisible(false);
    setTimeout(onViewOrder, 300);
  }, [onViewOrder]);

  if (!visible) return null;

  return (
    <div className="animate-slide-down">
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
              <Button variant="primary" size="sm" onClick={handleView} className="min-h-9 text-xs">
                Ver pedido
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDismiss} className="min-h-9 min-w-9 p-0">
                <X size={14} />
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
