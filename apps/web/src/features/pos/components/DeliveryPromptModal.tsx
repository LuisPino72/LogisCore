import { useState } from 'react';
import { Modal, Button } from '@/common/components';
import { Truck, Store, ChefHat, X } from 'lucide-react';

interface DeliveryPromptModalProps {
  isOpen: boolean;
  onDelivery: (needsKitchen: boolean) => void;
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

  const handleClose = () => {
    setStep('choose');
    onClose();
  };

  const handleDelivery = () => {
    setWantsKitchen(needsKitchenDefault ?? false);
    setStep('kitchen');
  };

  const handleKitchenChoice = (needsKitchen: boolean) => {
    onDelivery(needsKitchen);
    setStep('choose');
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
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={() => { setWantsKitchen(true); handleKitchenChoice(true); }}
                disabled={loading}
                className={`flex items-center gap-3 p-4 min-h-[56px] w-full justify-start ${wantsKitchen ? 'border-warning bg-warning/5' : ''}`}
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
