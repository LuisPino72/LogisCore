import { useState, useMemo } from 'react';
import { Modal, Button } from '@/common/components';
import { Truck, Store, ChefHat, X, AlertCircle } from 'lucide-react';
import { needsKitchenForCart } from '../services/posService';
import { usePosStore } from '../stores/posStore';

interface DeliveryPromptModalProps {
  isOpen: boolean;
  onDelivery: (needsKitchen: boolean, isUrgent: boolean) => void;
  onJustPark: () => void;
  onClose: () => void;
  loading?: boolean;
  needsKitchenDefault?: boolean;
}

export function DeliveryPromptModal({
  isOpen,
  onDelivery,
  onJustPark,
  onClose,
  loading = false,
  needsKitchenDefault,
}: DeliveryPromptModalProps) {
  const [step, setStep] = useState<'choose' | 'kitchen'>('choose');
  const [wantsKitchen, setWantsKitchen] = useState(needsKitchenDefault ?? false);
  const [isUrgent, setIsUrgent] = useState(false);

  const cart = usePosStore((s) => s.cart);
  const products = usePosStore((s) => s.products);

  const productsMap = useMemo(() => {
    const map = new Map<string, typeof products[number]>();
    for (const p of products) {
      map.set(p.id, p);
    }
    return map;
  }, [products]);

  const autoNeedsKitchen = useMemo(() => {
    return needsKitchenForCart(cart, productsMap);
  }, [cart, productsMap]);

  const handleClose = () => {
    setStep('choose');
    onClose();
  };

  const handleDelivery = () => {
    setWantsKitchen(autoNeedsKitchen || (needsKitchenDefault ?? false));
    setStep('kitchen');
  };

  const handleKitchenChoice = (needsKitchen: boolean) => {
    setStep('choose');
    onDelivery(needsKitchen, isUrgent);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={step === 'choose' ? '¿Enviar a Delivery?' : '¿Requiere cocina?'}
    >
      <div className="flex flex-col gap-3 animate-slide-down">
        {step === 'choose' ? (
          <>
            <p className="text-sm text-gray-600">
              Selecciona el tipo de pedido para esta venta.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={handleDelivery}
                disabled={loading}
                className="flex items-center gap-3 p-4 min-h-[56px] w-full justify-start"
                aria-label="Seleccionar delivery a domicilio"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Truck size={20} className="text-primary" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold text-gray-900">Delivery</p>
                  <p className="text-xs text-text-secondary">Enviar a domicilio</p>
                </div>
              </Button>
              <Button
                variant="outline"
                onClick={onJustPark}
                disabled={loading}
                className="flex items-center gap-3 p-4 min-h-[56px] w-full justify-start"
                aria-label="Guardar venta para retomar después"
              >
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <Store size={20} className="text-gray-600" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold text-gray-900">Solo pausar</p>
                  <p className="text-xs text-text-secondary">Guardar para retomar después</p>
                </div>
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600">
              ¿Esta orden requiere preparación en cocina?
            </p>
            {autoNeedsKitchen && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-warning/10 border border-warning/20">
                <AlertCircle size={14} className="text-warning shrink-0" />
                <span className="text-xs text-warning font-medium">
                  🍳 Productos detectados que requieren cocina
                </span>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={() => { setWantsKitchen(true); handleKitchenChoice(true); }}
                disabled={loading}
                className={`flex items-center gap-3 p-4 min-h-[56px] w-full justify-start ${wantsKitchen ? 'border-warning bg-warning/5' : ''}`}
                aria-label="Sí, requiere preparación en cocina"
              >
                <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
                  <ChefHat size={20} className="text-warning" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold text-gray-900">Sí, necesita cocina</p>
                  <p className="text-xs text-text-secondary">Pasará por preparación antes de enviar</p>
                </div>
              </Button>
               <Button
                 variant="outline"
                 onClick={() => { setWantsKitchen(false); handleKitchenChoice(false); }}
                 disabled={loading}
                 className={`flex items-center gap-3 p-4 min-h-[56px] w-full justify-start ${!wantsKitchen ? 'border-success bg-success/5' : ''}`}
                 aria-label="No, enviar directo a delivery"
               >
                 <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                   <Truck size={20} className="text-success" />
                 </div>
                 <div className="text-left flex-1">
                   <p className="text-sm font-semibold text-gray-900">No, directo a envío</p>
                   <p className="text-xs text-text-secondary">Sin preparación adicional</p>
                 </div>
               </Button>
             </div>
             <div className="mt-4 p-3 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-between gap-3">
               <div className="flex items-center gap-2">
                 <span className="text-sm font-medium text-gray-700">🚨 Prioridad Urgente</span>
               </div>
               <Button
                 variant={isUrgent ? "primary" : "outline"}
                 onClick={() => setIsUrgent(!isUrgent)}
                 className="px-3 py-1 h-8 text-xs"
               >
                 {isUrgent ? 'Activado' : 'Desactivado'}
               </Button>
             </div>
             <Button
               variant="ghost"
               onClick={() => setStep('choose')}
               className="mt-1"
             >
               <X size={14} className="mr-1" />
               Volver
             </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
