import { useState } from 'react';
import { Button, Input, Modal } from '../../../common/components';
import type { Product } from '../types';

interface StockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  selectedProductId?: string;
  onAdjust: (productId: string, quantity: number, reason: string) => Promise<boolean>;
}

export function StockAdjustmentModal({ isOpen, onClose, products, selectedProductId, onAdjust }: StockAdjustmentModalProps) {
  const [productId, setProductId] = useState(selectedProductId || '');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!productId) { setError('Selecciona un producto'); return; }
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty === 0) { setError('Ingresa una cantidad válida (positiva o negativa)'); return; }
    if (!reason.trim()) { setError('El motivo es obligatorio'); return; }

    setSubmitting(true);
    setError('');
    const ok = await onAdjust(productId, qty, reason.trim());
    setSubmitting(false);

    if (ok) {
      setQuantity('');
      setReason('');
      if (!selectedProductId) setProductId('');
      onClose();
    } else {
      setError('Error al ajustar stock. Verifica el stock disponible.');
    }
  };

  const product = products.find((p) => p.id === productId);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ajuste de stock">
      <div className="space-y-4">
        <div className="input-wrapper">
          <label className="input-label">Producto</label>
          <select
            className="select"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">Seleccionar...</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.sku}) — Stock: {p.stock}</option>
            ))}
          </select>
        </div>

         {product && (
           <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
             Stock actual: <strong>{product.stock}</strong> {product.unit}
             {product.isWeighted && product.unit === 'kg' && <span> ({(product.stock / 1000).toFixed(2)} Kg)</span>}
             {product.isWeighted && product.unit === 'lt' && <span> ({(product.stock / 1000).toFixed(2)} Lt)</span>}
           </div>
         )}
 
         <div className="input-wrapper">
           <label className="input-label">
             Cantidad {product?.isWeighted ? `(${product.unit === 'kg' ? 'Kg' : 'Lt'})` : '(unidades)'}
           </label>
           <Input
             type="number"
             step="0.01"
             placeholder="Ej: 10 o -5"
             value={quantity}
             onChange={(e) => setQuantity(e.target.value)}
           />
           {product?.isWeighted && (
             <p className="text-[10px] text-gray-400 mt-0.5">
               Se ajusta en {product.unit === 'kg' ? 'Kg' : 'Lt'} y se guarda en {product.unit === 'kg' ? 'gr' : 'ml'} (x1000)
             </p>
           )}
         </div>

        <div className="input-wrapper">
          <label className="input-label">Motivo (obligatorio)</label>
          <Input
            placeholder="Ej: merma por rotura, stock inicial, devolución"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex gap-3 pt-2">
          <Button variant="ghost" fullWidth onClick={onClose}>Cancelar</Button>
          <Button variant="primary" fullWidth onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Ajustando...' : 'Ajustar stock'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
