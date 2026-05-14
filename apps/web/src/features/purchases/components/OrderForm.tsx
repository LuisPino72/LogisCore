import { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { Button, Input, Modal } from '../../../common/components';
import { inventoryService } from '../../inventory/services/inventoryService';
import type { Product } from '../../../specs/inventory';
import type { Supplier, CreatePurchaseOrderInput, PurchaseOrderWithItems } from '../../../specs/purchases';

interface OrderFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreatePurchaseOrderInput) => Promise<boolean>;
  suppliers: Supplier[];
  tenantId: string;
  editOrder?: PurchaseOrderWithItems | null;
}

interface OrderItemInput {
  productId: string;
  quantity: number;
  totalCostUsd: number;
}

function getProductUnit(products: Product[], productId: string): string {
  const p = products.find((pr) => pr.id === productId);
  if (!p) return '';
  return p.isWeighted ? (p.unit === 'lt' ? 'Lt' : 'Kg') : 'Und';
}

export function OrderForm({ isOpen, onClose, onSubmit, suppliers, tenantId, editOrder }: OrderFormProps) {
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<OrderItemInput[]>([{ productId: '', quantity: 1, totalCostUsd: 0 }]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isEditing = !!editOrder;

  useEffect(() => {
    if (isOpen) {
      inventoryService.getProducts(tenantId).then((res) => {
        if (res.ok) setProducts(res.data);
      });
      if (editOrder) {
        setSupplierId(editOrder.supplierId);
        setNotes(editOrder.notes ?? '');
        setItems(editOrder.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          totalCostUsd: i.totalUsd,
        })));
      } else {
        setSupplierId('');
        setNotes('');
        setItems([{ productId: '', quantity: 1, totalCostUsd: 0 }]);
      }
      setError('');
    }
  }, [isOpen, editOrder, tenantId]);

  const addItem = () => {
    setItems([...items, { productId: '', quantity: 1, totalCostUsd: 0 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof OrderItemInput, value: string | number) => {
    const next = [...items];
    next[index] = { ...next[index], [field]: value };
    setItems(next);
  };

  const totalUsd = items.reduce((sum, item) => sum + item.totalCostUsd, 0);

  const handleSubmit = async () => {
    if (!supplierId) {
      setError('Selecciona un proveedor');
      return;
    }
    const validItems = items.filter((i) => i.productId && i.quantity > 0 && i.totalCostUsd > 0);
    if (validItems.length === 0) {
      setError('Agrega al menos un item válido');
      return;
    }

    setSubmitting(true);
    setError('');
    const ok = await onSubmit({
      supplierId,
      notes: notes.trim() || undefined,
      items: validItems,
    });
    setSubmitting(false);

    if (ok) {
      setSupplierId('');
      setNotes('');
      setItems([{ productId: '', quantity: 1, totalCostUsd: 0 }]);
      onClose();
    } else {
      setError('Error al guardar orden');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Editar orden de compra' : 'Nueva orden de compra'}>
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <div className="input-wrapper">
          <label className="input-label">Proveedor</label>
          <select className="select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Seleccionar...</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="input-label">Items</label>
          {items.map((item, idx) => {
            const unit = getProductUnit(products, item.productId);
            const isDecimal = unit === 'Kg' || unit === 'Lt';
            return (
              <div key={idx} className="flex gap-2 items-start">
                <div className="flex-1 min-w-0 space-y-1">
                  <select
                    className="select text-sm"
                    value={item.productId}
                    onChange={(e) => updateItem(idx, 'productId', e.target.value)}
                  >
                    <option value="">Producto...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="0"
                      step={isDecimal ? '0.01' : '1'}
                      placeholder={`Cant (${unit || 'Und'})`}
                      value={item.quantity || ''}
                      onChange={(e) => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                      inputClassName="text-sm px-2 py-1"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="Costo total $"
                      value={item.totalCostUsd || ''}
                      onChange={(e) => updateItem(idx, 'totalCostUsd', parseFloat(e.target.value) || 0)}
                      inputClassName="text-sm px-2 py-1"
                    />
                  </div>
                </div>
                {items.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => removeItem(idx)} className="text-danger mt-1">
                    <X size={16} />
                  </Button>
                )}
              </div>
            );
          })}
          <Button variant="ghost" size="sm" onClick={addItem} className="w-full">
            <Plus size={16} />
            <span className="ml-1">Agregar item</span>
          </Button>
        </div>

        <div className="input-wrapper">
          <label className="input-label">Notas (opcional)</label>
          <Input
            placeholder="Ej: Entrega en 3 días"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            inputClassName="text-sm px-2 py-2"
          />
        </div>

        <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
          <span className="text-sm font-medium">Total:</span>
          <span className="text-lg font-bold text-primary">$ {totalUsd.toFixed(2)}</span>
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex gap-3 pt-2">
          <Button variant="ghost" fullWidth onClick={onClose}>Cancelar</Button>
          <Button variant="primary" fullWidth onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear orden'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
