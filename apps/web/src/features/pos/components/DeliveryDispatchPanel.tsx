import { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Modal, Select, Input, Skeleton, Alert } from '@/common/components';
import { MapPin, MessageCircle } from 'lucide-react';
import { getDeliveryPersons } from '../../settings/services/deliveryPersonService';
import { dispatchDelivery, generateMapsLink } from '../services/saleService';
import { normalizeWaPhone } from '../services/receiptService';
import { useSettingsStore } from '../../settings/stores/settingsStore';
import { useToastStore } from '../../../stores/toastStore';
import type { DexieSale } from '../../../services/dexie/types';
import type { DexieDeliveryPerson } from '../../../services/dexie/db';

interface DeliveryDispatchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sale: DexieSale;
  customerName: string;
  customerPhone?: string;
}

export function DeliveryDispatchPanel({
  isOpen,
  onClose,
  sale,
  customerName,
  customerPhone,
}: DeliveryDispatchPanelProps) {
  const [deliveryPersons, setDeliveryPersons] = useState<DexieDeliveryPerson[]>([]);
  const [selectedPerson, setSelectedPerson] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingPersons, setLoadingPersons] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const defaultDeliveryFee = useSettingsStore((s) => s.defaultDeliveryFee);
  const { addToast } = useToastStore();

  // TECH DEBT: llamado directo a getDeliveryPersons desde el componente.
  // Lo correcto sería inyectar el servicio vía props o hook para testabilidad.
  // Contexto: DeliveryDispatchPanel se abrió paso como componente standalone sin
  // abstracción de datos. Refactor futuro: mover a un hook useDeliveryService().
  useEffect(() => {
    if (!isOpen || !sale.tenantId) return;
    mountedRef.current = true;
    setLoadingPersons(true);
    setError(null);
    getDeliveryPersons(sale.tenantId).then((res) => {
      if (!mountedRef.current) return;
      if (res.ok) {
        setDeliveryPersons(res.data);
      } else {
        setError(res.error?.message || 'Error al cargar motorizados');
      }
      setLoadingPersons(false);
    });
    return () => { mountedRef.current = false; };
  }, [isOpen, sale.tenantId]);

  useEffect(() => {
    if (isOpen) {
      setDeliveryFee(String(defaultDeliveryFee || 2));
      setSelectedPerson('');
    }
  }, [isOpen, defaultDeliveryFee]);

  const handleDispatch = useCallback(async () => {
    if (!selectedPerson || !deliveryFee) return;
    setLoading(true);
    try {
      const result = await dispatchDelivery(sale.id, {
        deliveryPersonName: selectedPerson,
        deliveryFee: parseFloat(deliveryFee),
      });
      if (result.ok) {
        const person = deliveryPersons.find((p) => p.name === selectedPerson);
        const mapsLink = generateMapsLink(sale.deliveryLat, sale.deliveryLng, sale.deliveryAddress);
        const text = [
          `🚴 Delivery para ${customerName}`,
          `📍 ${sale.deliveryAddress || 'Sin dirección'}`,
          `🗺️ ${mapsLink}`,
          sale.deliveryNotes ? `📝 ${sale.deliveryNotes}` : '',
          `💰 Tarifa: $${deliveryFee}`,
        ].filter(Boolean).join('\n');

        const phone = person?.phone ? `58${person.phone.replace(/\D/g, '')}` : '';
        const waUrl = phone
          ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
          : `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(waUrl, '_blank');

        addToast({ type: 'success', message: 'Delivery despachado correctamente', duration: 3000 });
        onClose();
      } else {
        addToast({ type: 'error', message: result.error?.message || 'Error al despachar', duration: 4000 });
      }
    } finally {
      setLoading(false);
    }
  }, [selectedPerson, deliveryFee, sale, customerName, deliveryPersons, addToast, onClose]);

  const handleNotifyCustomer = useCallback(async () => {
    if (!sale) return;
    if (!customerPhone) {
      addToast({ type: 'warning', message: 'El cliente no tiene teléfono registrado' });
      return;
    }
    const normalizedPhone = normalizeWaPhone(customerPhone);
    const text = encodeURIComponent(`¡Hola ${customerName}! Tu pedido va en camino con ${selectedPerson} 🚴`);
    window.open(`https://wa.me/${normalizedPhone}?text=${text}`, '_blank');
  }, [sale, customerPhone, customerName, selectedPerson, addToast]);

  const canDispatch = selectedPerson && deliveryFee && parseFloat(deliveryFee) > 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Despachar Delivery" size="sm">
      <div className="flex flex-col gap-4 animate-slide-down">
        {error && (
          <Alert variant="error" title="Error">{error}</Alert>
        )}
        {loadingPersons ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        ) : deliveryPersons.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-text-secondary">
              Registra motorizados en <strong>Settings → Delivery</strong>
            </p>
          </div>
        ) : (
          <>
            <Select
              label="Motorizado"
              value={selectedPerson}
              onChange={(e) => setSelectedPerson(e.target.value)}
            >
              <option value="">Seleccionar motorizado...</option>
              {deliveryPersons.map((p) => (
                <option key={p.id} value={p.name}>{p.name} ({p.phone})</option>
              ))}
            </Select>

            <Input
              label="Tarifa $"
              type="number"
              min="0"
              step="0.50"
              value={deliveryFee}
              onChange={(e) => setDeliveryFee(e.target.value)}
            />

            {sale.deliveryAddress && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-surface-alt text-sm">
                <MapPin size={14} className="text-primary shrink-0 mt-0.5" />
                <span className="text-gray-700">{sale.deliveryAddress}</span>
              </div>
            )}

            {sale.deliveryNotes && (
              <div className="p-2.5 rounded-lg bg-surface-alt text-sm text-gray-600">
                📝 {sale.deliveryNotes}
              </div>
            )}
          </>
        )}

        <div className="flex flex-col gap-2 pt-1">
          <Button
            variant="primary"
            fullWidth
            onClick={handleDispatch}
            disabled={!canDispatch || loading || loadingPersons}
            loading={loading}
            className="min-h-11"
            aria-label="Enviar ubicación al motorizado por WhatsApp"
          >
            📨 Enviar al Motorizado
          </Button>
          {selectedPerson && (
            <Button
              variant="secondary"
              fullWidth
              onClick={handleNotifyCustomer}
              className="min-h-11"
              aria-label="Notificar al cliente por WhatsApp"
              // TECH DEBT: inline style WhatsApp verde. Refactor: className con variable CSS o token de diseño.
              style={{ backgroundColor: '#25D366', borderColor: '#25D366', color: 'white' }}
            >
              <MessageCircle size={16} />
              Notificar Cliente
            </Button>
          )}
          <Button variant="ghost" fullWidth onClick={onClose} className="min-h-11">
            Saltar, lo haré después
          </Button>
        </div>
      </div>
    </Modal>
  );
}
