import { useState, useCallback, useEffect } from 'react';
import { Alert, Badge, Button, BottomNav } from '../../../common/components';
import { useToastStore } from '../../../stores/toastStore';
import { AlertTriangle, Scan, Package, History as HistoryIcon } from 'lucide-react';
import { usePos } from '../hooks/usePos';
import { useCashRegister } from '../hooks/useCashRegister';
import { ProductGrid } from './ProductGrid';
import { CartPanel } from './CartPanel';
import { PaymentModal } from './PaymentModal';
import { CashRegisterModal } from './CashRegisterModal';
import { CashStatusBadge } from './CashStatusBadge';
import { ParkCartModal } from './ParkCartModal';
import { ParkedCartsList } from './ParkedCartsList';
import { SalesHistory } from './SalesHistory';
import { BarcodeScannerModal } from '../../shared/components/BarcodeScannerModal';
import type { Product, Category } from '../../../specs/inventory';
import type { PaymentMethod, ParkedCart } from '../types';
import { posService } from '../services/posService';
import { inventoryService } from '../../inventory/services/inventoryService';

interface PosPageProps {
  tenantId: string | null;
  userEmail?: string;
}

export function PosPage({ tenantId }: PosPageProps) {
  const {
    products, cart, cashRegister, loading, error, searchQuery, parkedCarts, favoriteProductIds, salesHistory,
    addToCart, removeFromCart, updateCartItemQuantity, clearCart,
    completeSale, openCashRegister, closeCashRegister, parkCart, loadParkedCart, deleteParkedCart,
    toggleFavorite, fetchSalesHistory, search, userId, role, exchangeRate,
  } = usePos(tenantId);

  const { addToast } = useToastStore();

  const { isOpen } = useCashRegister();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  const [showParkModal, setShowParkModal] = useState(false);
  const [cashMode, setCashMode] = useState<'open' | 'close'>('open');
  const [weightedProduct, setWeightedProduct] = useState<Product | null>(null);
  const [weightedQty, setWeightedQty] = useState('');
  const [processing, setProcessing] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [lowStockAlert, setLowStockAlert] = useState<Product[]>([]);
  const [activeTab, setActiveTab] = useState<'sell' | 'history'>('sell');
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);

  const exchangeRateBs = exchangeRate ?? 0;

  useEffect(() => {
    if (!tenantId) return;
    inventoryService.getCategories(tenantId).then((res) => {
      if (res.ok) setCategories(res.data);
    });
    inventoryService.getLowStockProducts(tenantId).then((res) => {
      if (res.ok) setLowStockAlert(res.data);
    });
  }, [tenantId]);

  const handleAddToCart = useCallback(
    (product: Product) => {
      if (product.isWeighted) {
        setWeightedProduct(product);
        setWeightedQty('');
        setShowPaymentModal(true);
        return;
      }
      addToCart(product, 1);
    },
    [addToCart],
  );

  const handleWeightedConfirm = useCallback(() => {
    if (!weightedProduct) return;
    const qty = parseFloat(weightedQty);
    if (!qty || qty <= 0) return;
    addToCart(weightedProduct, qty);
    setShowPaymentModal(false);
    setWeightedProduct(null);
    setWeightedQty('');
  }, [weightedProduct, weightedQty, addToCart]);

  const handlePay = useCallback(async () => {
    if (!tenantId || !userId || !paymentMethod) return;
    setProcessing(true);
    const ok = await completeSale(tenantId, paymentMethod, userId);
    setProcessing(false);
    if (ok) {
      setPaymentMethod(null);
      clearCart();
      setMobileCartOpen(false);
      addToast({ type: 'success', message: 'Venta completada exitosamente.', duration: 4000 });
    }
  }, [tenantId, userId, paymentMethod, completeSale, clearCart, addToast]);

  const handleOpenCash = useCallback(async () => {
    setCashMode('open');
    setShowCashModal(true);
  }, []);

  const handleCloseCash = useCallback(async () => {
    setCashMode('close');
    setShowCashModal(true);
  }, []);

  const handleCashOpenSubmit = useCallback(
    async (balance: number) => {
      if (!tenantId || !userId) return false;
      return openCashRegister(tenantId, balance, userId);
    },
    [tenantId, userId, openCashRegister],
  );

  const handleCashCloseSubmit = useCallback(
    async (declared: number) => {
      if (!tenantId || !userId) return false;
      return closeCashRegister(tenantId, declared, userId);
    },
    [tenantId, userId, closeCashRegister],
  );

  const handlePark = useCallback(() => {
    setShowParkModal(true);
  }, []);

  const handleParkConfirm = useCallback(
    async (name: string) => {
      if (!tenantId) return;
      setProcessing(true);
      const ok = await parkCart(tenantId, name);
      setProcessing(false);
      if (ok) {
        setShowParkModal(false);
        setPaymentMethod(null);
      }
    },
    [tenantId, parkCart],
  );

  const handleLoadParked = useCallback(
    (parked: ParkedCart) => {
      loadParkedCart(parked);
      setPaymentMethod(null);
    },
    [loadParkedCart],
  );

  const handleBarcodeScan = useCallback(
    async (code: string) => {
      if (!tenantId) return;
      const result = await inventoryService.getProductBySku(code, tenantId);
      if (result.ok && result.data) {
        addToCart(result.data, result.data.isWeighted ? 0 : 1);
        addToast({ type: 'success', message: `${result.data.name} agregado`, duration: 2000 });
      } else {
        addToast({ type: 'error', message: `Producto con código "${code}" no encontrado.`, duration: 4000 });
      }
    },
    [tenantId, addToCart, addToast],
  );

  if (!tenantId) {
    return (
      <div className="p-4 flex items-center justify-center h-full">
        <Alert variant="info">Selecciona un local para usar el POS.</Alert>
      </div>
    );
  }

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="flex flex-row h-full w-full pl-14 md:pl-0">
      <div className="flex-1 min-w-0 h-full flex flex-col">
        <div className="flex items-center gap-2 px-3 pt-2 pb-1">
          <CashStatusBadge isOpen={isOpen} onClick={isOpen ? handleCloseCash : handleOpenCash} role={role} />
          <Button variant="ghost" size="sm" onClick={() => setShowBarcodeScanner(true)} className="p-1 min-w-[44px] min-h-[44px]" title="Escanear código de barras">
            <Scan size={18} />
          </Button>
          <div className="flex-1" />
          <div className="hidden md:flex bg-surface-alt rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('sell')}
              className={`min-h-[44px] px-3 py-2 text-xs font-medium rounded-md transition-colors ${activeTab === 'sell' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Vender
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('history'); if (tenantId) fetchSalesHistory(tenantId); }}
              className={`min-h-[44px] px-3 py-2 text-xs font-medium rounded-md transition-colors ${activeTab === 'history' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Historial
            </button>
          </div>
        </div>

        {error && (
          <div className="px-3 pt-1">
            <Alert variant="warning">{error}</Alert>
          </div>
        )}

        {lowStockAlert.length > 0 && (
          <div className="px-3 pt-1">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-warning/10 border border-warning/20">
              <AlertTriangle size={16} className="text-warning shrink-0" />
              <span className="text-xs text-warning font-medium truncate">
                Stock bajo: {lowStockAlert.slice(0, 3).map((p) => p.name).join(', ')}{lowStockAlert.length > 3 ? ` +${lowStockAlert.length - 3}` : ''}
              </span>
              <Badge variant="warning" className="ml-auto text-[10px] shrink-0">{lowStockAlert.length}</Badge>
            </div>
          </div>
        )}

        {activeTab === 'sell' ? (
          <>
            <ParkedCartsList
              carts={parkedCarts}
              onLoad={handleLoadParked}
              onDelete={deleteParkedCart}
            />
            <div className="flex-1 overflow-hidden">
              <ProductGrid
                products={products}
                categories={categories}
                selectedCategory={selectedCategory}
                onCategoryChange={setSelectedCategory}
                loading={loading}
                searchQuery={searchQuery}
                onSearchChange={search}
                onAddToCart={handleAddToCart}
                onToggleFavorite={(id) => { if (tenantId) toggleFavorite(tenantId, id); }}
                favoriteIds={favoriteProductIds}
                exchangeRateBs={exchangeRateBs}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-hidden">
            <SalesHistory
              tenantId={tenantId ?? ''}
              sales={salesHistory}
              onVoid={async (saleId) => {
                if (!tenantId || !userId) return;
                const result = await posService.voidSale(saleId, tenantId, userId);
                if (result.ok) {
                  addToast({ type: 'success', message: 'Venta anulada. Stock restaurado.', duration: 4000 });
                  fetchSalesHistory(tenantId);
                } else {
                  addToast({ type: 'error', message: result.error?.message ?? 'Error al anular la venta.', duration: 4000 });
                }
              }}
              loading={loading}
            />
          </div>
        )}
      </div>

      <CartPanel
        cart={cart}
        exchangeRateBs={exchangeRateBs}
        paymentMethod={paymentMethod}
        onPaymentMethodChange={setPaymentMethod}
        onRemoveFromCart={removeFromCart}
        onUpdateQuantity={updateCartItemQuantity}
        onPay={handlePay}
        onPark={handlePark}
        isOpen={isOpen}
        loading={processing}
        isMobileOpen={mobileCartOpen}
        itemCount={cartItemCount}
        onMobileToggle={() => setMobileCartOpen((v) => !v)}
      />

      {/* Mobile Bottom Nav */}
      <BottomNav
        activeId={activeTab}
        items={[
          { id: 'sell', label: 'Vender', icon: <Package size={20} />, onClick: () => setActiveTab('sell') },
          { id: 'history', label: 'Historial', icon: <HistoryIcon size={20} />, onClick: () => { setActiveTab('history'); if (tenantId) fetchSalesHistory(tenantId); } },
        ]}
      />

      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          setWeightedProduct(null);
        }}
        onConfirm={handleWeightedConfirm}
        loading={false}
        product={weightedProduct}
        quantity={weightedQty}
        onQuantityChange={setWeightedQty}
      />

      <CashRegisterModal
        isOpen={showCashModal}
        onClose={() => setShowCashModal(false)}
        mode={cashMode}
        currentSalesCount={cashRegister?.totalSalesCount ?? 0}
        currentSalesBs={cashRegister?.totalSalesBs ?? 0}
        currentIgtfBs={cashRegister?.totalIgtfBs ?? 0}
        openingBalanceBs={cashRegister?.openingBalanceBs ?? 0}
        onOpenCash={handleCashOpenSubmit}
        onCloseCash={handleCashCloseSubmit}
        loading={loading}
      />

      <ParkCartModal
        isOpen={showParkModal}
        onClose={() => setShowParkModal(false)}
        onConfirm={handleParkConfirm}
        loading={processing}
      />

      <BarcodeScannerModal
        isOpen={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        onScan={handleBarcodeScan}
      />
    </div>
  );
}
