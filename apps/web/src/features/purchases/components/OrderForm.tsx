import { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { Button, Input, Modal, Select } from '../../../common/components';
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

function getProductSku(products: Product[], productId: string): string {
  const p = products.find((pr) => pr.id === productId);
  return p?.sku ?? '';
}

function isWeighted(products: Product[], productId: string): boolean {
  const p = products.find((pr) => pr.id === productId);
  return p?.isWeighted ?? false;
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
      <div className="space-y-4">
        <Select
          label="Proveedor"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          validation={{ required: true }}
        >
          <option value="">Seleccionar...</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>

        <div className="space-y-2">
          <label className="input-label">Items</label>
          {items.map((item, idx) => {
            const unit = getProductUnit(products, item.productId);
            const sku = getProductSku(products, item.productId);
            const weighted = isWeighted(products, item.productId);
            const hasProduct = !!item.productId;

            return (
              <div key={idx} className="rounded-lg border border-border bg-surface-alt p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <Select
                      value={item.productId}
                      onChange={(e) => updateItem(idx, 'productId', e.target.value)}
                      validation={{ required: true }}
                    >
                      <option value="">Producto...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                      ))}
                    </Select>
                  </div>
                  {items.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeItem(idx)} className="text-danger shrink-0 mt-0.5">
                      <X size={16} />
                    </Button>
                  )}
                </div>

                {hasProduct && (
                  <div className="flex items-center gap-2">
                    {weighted && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">
                        {unit}
                      </span>
                    )}
                    {sku && (
                      <span className="text-[10px] text-text-secondary bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                        {sku}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      type="number"
                      min="0"
                      step={weighted ? '0.01' : '1'}
                      placeholder={`Cant (${unit || 'Und'})`}
                      value={item.quantity || ''}
                      onChange={(e) => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                      inputClassName="text-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="Costo total $"
                      value={item.totalCostUsd || ''}
                      onChange={(e) => updateItem(idx, 'totalCostUsd', parseFloat(e.target.value) || 0)}
                      inputClassName="text-sm"
                    />
                  </div>
                </div>
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
            inputClassName="text-sm"
          />
        </div>

        <div className="flex justify-between items-center bg-primary/5 border border-primary/10 p-3 rounded-lg">
          <span className="text-sm font-medium text-primary">Total:</span>
          <span className="text-xl font-bold text-primary">$ {totalUsd.toFixed(2)}</span>
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
