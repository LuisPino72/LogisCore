import { useState, useCallback, useEffect, useMemo } from 'react';
import { Alert, Badge, Button, BottomNav, ModuleOnboarding, Tooltip, Modal } from '../../../common/components';
import { useToastStore } from '../../../stores/toastStore';
import { AlertTriangle, Scan, Package, History as HistoryIcon, ShoppingCart, DollarSign } from 'lucide-react';
import { usePos } from '../hooks/usePos';
import { usePosStore } from '../stores/posStore';
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
import { logger } from '../../../lib/logger';

interface PosPageProps {
  tenantId: string | null;
  userEmail?: string;
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear()
    && d1.getMonth() === d2.getMonth()
    && d1.getDate() === d2.getDate();
}

export function PosPage({ tenantId }: PosPageProps) {
  const {
    products, cart, cashRegister, loading, error, searchQuery, parkedCarts, favoriteProductIds, salesHistory, salesHistoryTotal, salesHistoryLoading,
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
  const [voidConfirmId, setVoidConfirmId] = useState<string | null>(null);
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
      addToast({ type: 'success', message: `${product.name} agregado`, duration: 1500 });
    },
    [addToCart, addToast],
  );

  const handleWeightedConfirm = useCallback(() => {
    if (!weightedProduct) return;
    const qty = parseFloat(weightedQty);
    if (!qty || qty <= 0) return;
    addToCart(weightedProduct, qty);
    setShowPaymentModal(false);
    setWeightedProduct(null);
    setWeightedQty('');
    addToast({ type: 'success', message: `${weightedProduct.name} agregado`, duration: 1500 });
  }, [weightedProduct, weightedQty, addToCart, addToast]);

  const handlePay = useCallback(async () => {
    if (!tenantId || !userId || !paymentMethod) return;
    setProcessing(true);
    try {
      const ok = await completeSale(tenantId, paymentMethod, userId);
      if (ok) {
        setPaymentMethod(null);
        clearCart();
        setMobileCartOpen(false);
        addToast({ type: 'success', message: 'Venta completada exitosamente.', duration: 4000 });
      } else {
        const store = usePosStore.getState();
        addToast({ type: 'error', message: store.error || 'Error al completar la venta.', duration: 5000 });
      }
    } catch (err) {
      logger.error('POS', 'Error inesperado al procesar el pago', err);
      addToast({ type: 'error', message: 'Error inesperado al procesar el pago.', duration: 5000 });
    } finally {
      setProcessing(false);
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
        if (result.data.isWeighted) {
          addToast({ type: 'info', message: `${result.data.name} es pesable. Agrégalo manualmente.`, duration: 3000 });
          return;
        }
        addToCart(result.data, 1);
        addToast({ type: 'success', message: `${result.data.name} agregado`, duration: 2000 });
      } else {
        addToast({ type: 'error', message: `Producto con código "${code}" no encontrado.`, duration: 4000 });
      }
    },
    [tenantId, addToCart, addToast],
  );

  const handleConfirmVoid = useCallback(async () => {
    if (!voidConfirmId || !tenantId || !userId) return;
    const result = await posService.voidSale(voidConfirmId, tenantId, userId);
    setVoidConfirmId(null);
    if (result.ok) {
      addToast({ type: 'success', message: 'Venta anulada. Stock restaurado.', duration: 4000 });
      fetchSalesHistory(tenantId);
    } else {
      addToast({ type: 'error', message: result.error?.message ?? 'Error al anular la venta.', duration: 4000 });
    }
  }, [voidConfirmId, tenantId, userId, addToast, fetchSalesHistory]);

  if (!tenantId) {
    return (
      <div className="p-4 flex items-center justify-center h-full">
        <Alert variant="info">Selecciona un local para usar el POS.</Alert>
      </div>
    );
  }

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const isFromPreviousDay = useMemo(() => {
    if (!cashRegister?.isOpen || !cashRegister?.openedAt) return false;
    return !isSameDay(new Date(cashRegister.openedAt), new Date());
  }, [cashRegister?.isOpen, cashRegister?.openedAt]);

  return (
    <div className="flex flex-row h-full w-full min-w-0">
      <div className="flex-1 min-w-0 h-full flex flex-col">
        <div className="flex items-center gap-2 px-3 pt-2 pb-1">
          <CashStatusBadge isOpen={isOpen} onClick={isOpen ? handleCloseCash : handleOpenCash} role={role} />
          <Tooltip content="Escanear código de barras" position="bottom">
            <Button variant="ghost" size="sm" onClick={() => setShowBarcodeScanner(true)} className="p-1 min-w-11 min-h-11">
              <Scan size={18} />
              <span className="text-xs">Escanear</span>
            </Button>
          </Tooltip>
          <div className="flex-1" />
          <div className="hidden md:flex items-center gap-1.5 bg-surface-alt/80 rounded-full p-1 shadow-sm">
            <Tooltip content="Registrar ventas" position="bottom">
              <button
                type="button"
                onClick={() => setActiveTab('sell')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-full transition-all ${
                  activeTab === 'sell'
                    ? 'bg-white text-primary shadow-sm'
                    : 'text-text-secondary hover:text-gray-700'
                }`}
              >
                <Package size={16} />
                Vender
              </button>
            </Tooltip>
            <Tooltip content="Ventas realizadas y anulaciones" position="bottom">
              <button
                type="button"
                onClick={() => { setActiveTab('history'); if (tenantId) fetchSalesHistory(tenantId); }}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-full transition-all ${
                  activeTab === 'history'
                    ? 'bg-white text-primary shadow-sm'
                    : 'text-text-secondary hover:text-gray-700'
                }`}
              >
                <HistoryIcon size={16} />
                Historial
              </button>
            </Tooltip>
          </div>
        </div>

        {error && (
          <div className="px-3 pt-1">
            <Alert variant="warning">{error}</Alert>
          </div>
        )}

        {isFromPreviousDay && (
          <div className="px-3 pt-1">
            <Alert variant="warning">
              La caja quedó abierta desde el día anterior. Al abrir una nueva, la anterior se cerrará automáticamente (sin diferencias).
            </Alert>
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
                role={role}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-hidden">
            <SalesHistory
              tenantId={tenantId ?? ''}
              sales={salesHistory}
              total={salesHistoryTotal}
              onVoid={(saleId) => setVoidConfirmId(saleId)}
              loading={salesHistoryLoading}
              canVoid={role === 'owner' || role === 'admin'}
            />
          </div>
        )}
      </div>

      {activeTab === 'sell' && (
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
      )}

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

      <Modal
        isOpen={!!voidConfirmId}
        onClose={() => setVoidConfirmId(null)}
        title="¿Anular venta?"
        size="sm"
        footer={
          <div className="flex gap-2 w-full">
            <Button variant="ghost" className="flex-1" onClick={() => setVoidConfirmId(null)}>Cancelar</Button>
            <Button variant="danger" className="flex-1" onClick={handleConfirmVoid}>Sí, anular</Button>
          </div>
        }
      >
        <p className="text-sm text-gray-600">
          Se restaurará el stock de todos los productos de esta venta. Esta acción no se puede deshacer.
        </p>
      </Modal>

      <BarcodeScannerModal
        isOpen={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        onScan={handleBarcodeScan}
      />

      <ModuleOnboarding
        moduleId="pos"
        steps={[
          {
            title: 'Bienvenido al Punto de Venta',
            description: 'Aquí es donde registras tus ventas. Toca un producto para agregarlo al carrito. Puedes buscar por nombre o código SKU.',
            icon: <ShoppingCart size={24} className="text-white" />,
          },
          {
            title: 'Abrir Caja Primero',
            description: 'Antes de vender, debes abrir la caja tocando el indicador de estado. Ingresa el monto inicial con el que inicias tu jornada.',
            icon: <DollarSign size={24} className="text-white" />,
          },
          {
            title: 'Productos Pesables',
            description: 'Los productos que se venden por peso (kg, lt) te pedirán la cantidad antes de agregarlos al carrito. Los demás se agregan directamente.',
            icon: <Package size={24} className="text-white" />,
          },
          {
            title: 'Cobrar y Pausar',
            description: 'Cuando estés listo, selecciona el método de pago y toca "Pagar". Si un cliente se va sin pagar, puedes "Pausar" el carrito y retomarlo después.',
            icon: <Scan size={24} className="text-white" />,
          },
        ]}
        onComplete={() => {}}
      />
    </div>
  );
}
