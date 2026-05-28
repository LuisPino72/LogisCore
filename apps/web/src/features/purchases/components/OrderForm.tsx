import { useState, useEffect } from 'react';
import { Plus, X, Truck, Package, FileText, DollarSign } from 'lucide-react';
import { Button, Input, Modal, SearchableSelect } from '../../../common/components';
import { inventoryService } from '../../inventory/services/inventoryService';
import type { Product, Presentation } from '../../inventory/types';
import type { Supplier, CreatePurchaseOrderInput, PurchaseOrderWithItems } from '../../../specs/purchases';
import { formatUsd } from '@/lib/formatBs';
import { CreatePurchaseOrderInputSchema } from '../../../specs/purchases';

interface OrderFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreatePurchaseOrderInput) => Promise<boolean>;
  suppliers: Supplier[];
  tenantId: string;
  editOrder?: PurchaseOrderWithItems | null;
  preSelectedProducts?: Product[];
  autoSelectSupplierId?: string | null;
  onRequestCreateSupplier?: () => void;
}

interface OrderItemInput {
  productId: string;
  presentationId?: string;
  unitMultiplier?: number;
  quantity: number;
  totalCostUsd: number;
}

const SectionDivider = ({ icon, title }: { icon: React.ReactNode; title: string }) => (
  <div className="flex items-center gap-2 pt-2">
    <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
      {icon}
    </div>
    <h3 className="text-xs font-title font-semibold text-gray-700 uppercase tracking-wide">{title}</h3>
    <div className="flex-1 h-px bg-gray-100" />
  </div>
);

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

export function OrderForm({ isOpen, onClose, onSubmit, suppliers, tenantId, editOrder, preSelectedProducts, autoSelectSupplierId, onRequestCreateSupplier }: OrderFormProps) {
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<OrderItemInput[]>([{ productId: '', quantity: 1, totalCostUsd: 0 }]);
  const [products, setProducts] = useState<Product[]>([]);
  const [presentationsByProduct, setPresentationsByProduct] = useState<Record<string, Presentation[]>>({});
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
      } else if (preSelectedProducts?.length) {
        setSupplierId('');
        setNotes('');
        setItems(preSelectedProducts.map((p) => ({
          productId: p.id,
          quantity: 1,
          totalCostUsd: 0,
        })));
      } else {
        setSupplierId('');
        setNotes('');
        setItems([{ productId: '', quantity: 1, totalCostUsd: 0 }]);
      }
      setError('');
    }
  }, [isOpen, editOrder, tenantId, preSelectedProducts]);

  useEffect(() => {
    if (autoSelectSupplierId && isOpen && !editOrder) {
      setSupplierId(autoSelectSupplierId);
    }
  }, [autoSelectSupplierId, isOpen, editOrder]);

  const addItem = () => {
    setItems([...items, { productId: '', quantity: 1, totalCostUsd: 0 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const loadPresentations = async (productId: string) => {
    if (!productId || presentationsByProduct[productId]) return;
    const result = await inventoryService.getPresentationsForProduct(productId);
    if (result.ok && result.data.length > 0) {
      setPresentationsByProduct(prev => ({ ...prev, [productId]: result.data }));
    }
  };

  const updateItem = (index: number, field: keyof OrderItemInput, value: string | number) => {
    const next = [...items];
    next[index] = { ...next[index], [field]: value };
    if (field === 'productId') {
      const presId = value as string;
      next[index].presentationId = undefined;
      next[index].unitMultiplier = undefined;
      loadPresentations(presId);
    }
    setItems(next);
  };

  const updateItemFields = (index: number, fields: Partial<OrderItemInput>) => {
    const next = [...items];
    next[index] = { ...next[index], ...fields };
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
      setError('Agrega al menos un producto válido');
      return;
    }

    const payload = {
      supplierId,
      notes: notes.trim() || undefined,
      items: validItems.map((i) => ({
        productId: i.productId,
        presentationId: i.presentationId,
        unitMultiplier: i.unitMultiplier,
        quantity: i.quantity,
        totalCostUsd: i.totalCostUsd,
      })),
    };

    const parsed = CreatePurchaseOrderInputSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Revisa los datos ingresados');
      return;
    }

    setSubmitting(true);
    setError('');
    const ok = await onSubmit(payload);
    setSubmitting(false);

    if (ok) {
      setSupplierId('');
      setNotes('');
      setItems([{ productId: '', quantity: 1, totalCostUsd: 0 }]);
      onClose();
    } else {
      setError('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Editar orden de compra' : 'Nueva orden de compra'}
      footer={
        <div className="flex gap-3 w-full">
          <Button variant="ghost" fullWidth onClick={onClose}>Cancelar</Button>
          <Button variant="primary" fullWidth onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear orden'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Section: Proveedor */}
        <SectionDivider icon={<Truck size={14} className="text-primary" />} title="Proveedor" />

        <SearchableSelect
          value={supplierId}
          onChange={setSupplierId}
          options={suppliers.map((s) => ({
            value: s.id,
            label: s.name,
          }))}
          placeholder="Seleccionar proveedor..."
          searchPlaceholder="Buscar proveedor..."
          footer={
            <button
              type="button"
              onClick={() => onRequestCreateSupplier?.()}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-primary hover:bg-primary/5 transition-colors"
            >
              <Plus size={14} />
              Crear nuevo proveedor
            </button>
          }
        />

        {/* Section: Items */}
        <SectionDivider icon={<Package size={14} className="text-primary" />} title={`Productos (${items.length})`} />

        <div className="space-y-2">
          {items.map((item, idx) => {
            const unit = getProductUnit(products, item.productId);
            const sku = getProductSku(products, item.productId);
            const weighted = isWeighted(products, item.productId);
            const hasProduct = !!item.productId;

            return (
              <div key={idx} className="rounded-lg border border-border bg-surface-alt p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <SearchableSelect
                      value={item.productId}
                      onChange={(value) => updateItem(idx, 'productId', value)}
                      options={products.map((p) => ({
                        value: p.id,
                        label: `${p.name} (${p.sku})`,
                      }))}
                      placeholder="Producto"
                      searchPlaceholder="Buscar producto"
                    />
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

                {hasProduct && presentationsByProduct[item.productId] && presentationsByProduct[item.productId].length > 0 && (() => {
                  const pres = presentationsByProduct[item.productId];
                  const allShared = pres.every((p) => p.stockType === 'shared');
                  if (allShared) return null;
                  return (
                  <div className="p-2 bg-gray-50 rounded-lg border border-border">
                    <label className="block text-xs text-gray-500 mb-1">Presentación</label>
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={() => updateItemFields(idx, { presentationId: undefined, unitMultiplier: undefined })}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${
                          !item.presentationId
                            ? 'bg-white text-gray-900 shadow-sm border border-primary/30'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        Producto(1 unidad)
                      </button>
                      {pres.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => updateItemFields(idx, {
                            presentationId: p.id,
                            unitMultiplier: p.unitMultiplier,
                          })}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${
                            item.presentationId === p.id
                              ? 'bg-white text-gray-900 shadow-sm border border-primary/30'
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          {p.name} {p.unitMultiplier > 1 ? `(${p.unitMultiplier} unid.)` : ''}
                          {p.priceUsd > 0 && ` · $${p.priceUsd.toFixed(2)}`}
                        </button>
                      ))}
                    </div>
                  </div>
                  );
                })()}

                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      sanitize="number"
                      decimals={weighted ? 2 : 0}
                      step={weighted ? '0.01' : '1'}
                      placeholder={`Cantidad (${unit})`}
                      value={item.quantity > 1 ? String(item.quantity) : ''}
                      onChange={(e) => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                      validation={{ required: true, min: 0, max: 99999 }}
                      inputClassName="text-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      sanitize="currency"
                      step="0.01"
                      placeholder="Costo($)"
                      value={item.totalCostUsd || ''}
                      onChange={(e) => updateItem(idx, 'totalCostUsd', parseFloat(e.target.value) || 0)}
                      validation={{ required: true, min: 0, max: 999999 }}
                      inputClassName="text-sm"
                    />
                  </div>
                </div>
              </div>
            );
          })}
          <Button variant="outline" size="sm" onClick={addItem} className="w-full border-dashed">
            <Plus size={16} />
            <span className="ml-1">Agregar item</span>
          </Button>
        </div>

        {/* Section: Notas */}
        <SectionDivider icon={<FileText size={14} className="text-primary" />} title="Notas" />

        <Input
          placeholder="Ej: Entrega en 3 días, incluir factura..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          validation={{ maxLength: 25 }}
          inputClassName="text-sm"
        />

        {/* Total */}
        <SectionDivider icon={<DollarSign size={14} className="text-primary" />} title="Total" />

        {error && (
          <div className="p-2 rounded-lg bg-danger/5 border border-danger/20 text-xs text-danger">
            {error}
          </div>
        )}

        <div className="flex justify-between items-center bg-primary/5 border border-primary/10 p-3 rounded-lg">
          <span className="text-sm font-medium text-primary">Total de la orden:</span>
          <span className="text-xl font-bold text-primary">{formatUsd(totalUsd)}</span>
        </div>
      </div>
    </Modal>
  );
}
