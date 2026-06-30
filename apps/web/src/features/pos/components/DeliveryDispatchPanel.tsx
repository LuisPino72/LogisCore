import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button, Modal, Select, Input, Skeleton, Alert, Card } from '@/common/components';
import { MapPin, Send } from 'lucide-react';
import { getDeliveryPersons } from '../../settings/services/deliveryPersonService';
import { dispatchDelivery, generateMapsLink } from '../services/saleService';
import { useSettingsStore } from '../../settings/stores/settingsStore';
import { useToastStore } from '../../../stores/toastStore';
import { handleServiceError } from '../../../common/utils/handleServiceError';
import type { DexieSale } from '../../../services/dexie/types';
import type { DexieDeliveryPerson } from '../../../services/dexie/db';

interface DeliveryDispatchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sale: DexieSale;
  customerName: string;
  customerPhone?: string;
}

function buildWaText({
  customerName,
  customerPhone,
  deliveryAddress,
  mapsLink,
  deliveryNotes,
  deliveryFee,
}: {
  customerName: string;
  customerPhone?: string;
  deliveryAddress?: string;
  mapsLink: string;
  deliveryNotes?: string;
  deliveryFee: string;
}) {
  return [
    `🚴 Delivery para ${customerName}`,
    customerPhone ? `📞 ${customerPhone}` : '',
    `📍 ${deliveryAddress || 'Sin dirección'}`,
    `🗺️ ${mapsLink}`,
    deliveryNotes ? `📝 ${deliveryNotes}` : '',
    `💰 Tarifa: $${deliveryFee}`,
  ].filter(Boolean).join('\n');
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
  const [showPreview, setShowPreview] = useState(false);
  const mountedRef = useRef(true);

  const defaultDeliveryFee = useSettingsStore((s) => s.defaultDeliveryFee);
  const { addToast } = useToastStore();

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
      setDeliveryFee(String(sale.deliveryFee ?? defaultDeliveryFee ?? 2));
      setSelectedPerson('');
      setShowPreview(false);
    }
  }, [isOpen, defaultDeliveryFee]);

  const mapsLink = useMemo(
    () => generateMapsLink(sale.deliveryLat, sale.deliveryLng, sale.deliveryAddress),
    [sale.deliveryLat, sale.deliveryLng, sale.deliveryAddress]
  );

  const waMessageText = useMemo(
    () => buildWaText({ customerName, customerPhone, deliveryAddress: sale.deliveryAddress, mapsLink, deliveryNotes: sale.deliveryNotes, deliveryFee }),
    [customerName, customerPhone, sale.deliveryAddress, mapsLink, sale.deliveryNotes, deliveryFee]
  );

  const handleDispatch = useCallback(async () => {
    if (!selectedPerson || !deliveryFee) return;
    setShowPreview(true);
  }, [selectedPerson, deliveryFee]);

  const handleConfirmSend = useCallback(async () => {
    setLoading(true);
    try {
      const result = await dispatchDelivery(sale.id, {
        deliveryPersonName: selectedPerson,
        deliveryFee: parseFloat(deliveryFee),
      });
      if (result.ok) {
        const person = deliveryPersons.find((p) => p.name === selectedPerson);
        const phone = person?.phone ? `58${person.phone.replace(/\D/g, '')}` : '';
        const waUrl = phone
          ? `https://wa.me/${phone}?text=${encodeURIComponent(waMessageText)}`
          : `https://wa.me/?text=${encodeURIComponent(waMessageText)}`;
        window.open(waUrl, '_blank');

        addToast({ type: 'success', message: 'Delivery despachado correctamente', duration: 3000 });
        onClose();
      } else {
        handleServiceError(result);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedPerson, deliveryFee, sale, deliveryPersons, waMessageText, addToast, onClose]);

  const parsedFee = parseFloat(deliveryFee) || 0;
  const canDispatch = selectedPerson && parsedFee > 0 && parsedFee <= 1000;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Despachar Delivery" size="sm">
      <div className="flex flex-col gap-4 animate-slide-down">
        {error && (
          <Alert variant="error" title="Error">{error}</Alert>
        )}

        {showPreview ? (
          <>
            <Alert variant="info" title="Vista previa del mensaje">
              Se abrirá WhatsApp con este mensaje:
            </Alert>
            <Card className="p-3 bg-surface-alt text-xs whitespace-pre-line text-gray-800 max-h-40 overflow-y-auto wrap-break-word">
              {waMessageText}
            </Card>
            <div className="flex gap-2">
              <Button
                variant="primary"
                fullWidth
                onClick={handleConfirmSend}
                disabled={loading}
                loading={loading}
                className="min-h-11"
                aria-label="Confirmar envío por WhatsApp"
              >
                <Send size={16} />
                Confirmar y Enviar
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowPreview(false)}
                disabled={loading}
                className="min-h-11"
                aria-label="Cancelar envío"
              >
                Cancelar
              </Button>
            </div>
          </>
        ) : (
          <>
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
                  max="1000"
                  step="0.50"
                  value={deliveryFee}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '' || (parseFloat(v) >= 0 && parseFloat(v) <= 1000)) setDeliveryFee(v);
                  }}
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
                aria-label="Vista previa del mensaje para el motorizado"
              >
                <Send size={16} />
                Enviar al Motorizado
              </Button>
              <Button variant="ghost" fullWidth onClick={onClose} className="min-h-11">
                Despachar después
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
