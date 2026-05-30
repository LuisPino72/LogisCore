import { useState, useCallback, useEffect, useMemo } from 'react';
import { Alert, Badge, Button, BottomNav, ModuleOnboarding, Tooltip, Modal, Spinner } from '../../../common/components';
import { useToastStore } from '../../../stores/toastStore';
import { AlertTriangle, CheckCircle2, Scan, Package, History as HistoryIcon, ShoppingCart, DollarSign } from 'lucide-react';
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
import { StockVerificationModal } from './StockVerificationModal';
import { PresentationSelector } from './PresentationSelector';

import { BarcodeScannerModal } from '../../shared/components/BarcodeScannerModal';
import type { Product, Category } from '../../../specs/inventory';
import type { PaymentMethod, ParkedCart } from '../types';
import { posService } from '../services/posService';
import { inventoryService } from '../../inventory/services/inventoryService';
import { useOnlineStatus } from '../../../services/network/useNetworkGuard';
import { logger } from '../../../lib/logger';
import { isSameDayVzla } from '../../../lib/date';
import { preciseRound } from '@logiscore/shared';
import { METADATA_PAGOS } from '../../../specs/sales';
import { formatBs, formatUsd } from '@/lib/formatBs';

interface PosPageProps {
  tenantId: string | null;
  userEmail?: string;
}

export function PosPage({ tenantId }: PosPageProps) {
  const {
    products, cart, cashRegister, loading, error, searchQuery, parkedCarts, favoriteProductIds, salesHistory, salesHistoryTotal, salesHistoryLoading,
    addToCart, removeFromCart, updateCartItemQuantity, clearCart,
    completeSale, openCashRegister, closeCashRegister, parkCart, loadParkedCart, deleteParkedCart,
    toggleFavorite, fetchSalesHistory, search, userId, role, exchangeRate,
    getPresentations,
  } = usePos(tenantId);

  const { addToast } = useToastStore();

  const { isOpen } = useCashRegister();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  const [showParkModal, setShowParkModal] = useState(false);
  const [cashMode, setCashMode] = useState<'open' | 'close'>('open');
  const [weightingProduct, setWeightingProduct] = useState<Product | null>(null);
  const [weightingQty, setWeightingQty] = useState('');
  const [processing, setProcessing] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [lowStockAlert, setLowStockAlert] = useState<Product[]>([]);
  const [voidConfirmId, setVoidConfirmId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'sell' | 'history'>('sell');
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showVerifyConfirm, setShowVerifyConfirm] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyCounts, setVerifyCounts] = useState({ sold: 0, lowStock: 0 });
  const [cashError, setCashError] = useState<string | null>(null);
  const [selectedProductForPres, setSelectedProductForPres] = useState<Product | null>(null);
  const [completedSale, setCompletedSale] = useState<{ saleId: string; subtotalBs: number; totalUsd: number; totalBs: number; paymentMethod: PaymentMethod; items: Array<{ name: string; quantity: number; unitPriceUsd: number; totalPriceUsd: number; presentationName?: string; unit?: string }>; exchangeRate: number } | null>(null);

  const exchangeRateBs = exchangeRate ?? 0;
  const isOnline = useOnlineStatus();

  // Confirmar si el usuario intenta recargar con productos en el carrito
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (cart.length > 0) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [cart.length]);

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
        setWeightingProduct(product);
        setWeightingQty('');
        setShowWeightModal(true);
        return;
      }
      const presList = getPresentations(product.id);
      if (presList.length > 0) {
        setSelectedProductForPres(product);
        return;
      }
      addToCart(product, 1);
      addToast({ type: 'success', message: `${product.name} agregado`, duration: 1500 });
    },
    [addToCart, addToast, getPresentations],
  );

  const handleWeightedConfirm = useCallback(() => {
    if (!weightingProduct) return;
    const qty = parseFloat(weightingQty);
    if (!qty || qty <= 0) return;
    addToCart(weightingProduct, qty);
    setShowWeightModal(false);
    setWeightingProduct(null);
    setWeightingQty('');
    addToast({ type: 'success', message: `${weightingProduct.name} agregado`, duration: 1500 });
  }, [weightingProduct, weightingQty, addToCart, addToast]);

  const handlePay = useCallback(async () => {
    if (!tenantId || !userId || !paymentMethod) return;
    setProcessing(true);
    try {
      const saleId = await completeSale(tenantId, paymentMethod, userId);
      if (saleId) {
        const totalUsd = cart.reduce((sum, item) => sum + item.totalPriceUsd, 0);
        const totalBs = exchangeRateBs > 0 ? preciseRound(totalUsd * exchangeRateBs, 2) : 0;
        const subtotalBs = totalBs;
        const items = cart.map((item) => ({
          name: item.presentationName ? `${item.name} - ${item.presentationName}` : item.name,
          quantity: item.quantity,
          unitPriceUsd: item.unitPriceUsd,
          totalPriceUsd: item.totalPriceUsd,
          presentationName: item.presentationName,
          unit: item.unit,
        }));
        setCompletedSale({ saleId, subtotalBs, totalUsd, totalBs, paymentMethod, items, exchangeRate: exchangeRateBs });
        setPaymentMethod(null);
        clearCart();
        setMobileCartOpen(false);
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
  }, [tenantId, userId, paymentMethod, completeSale, clearCart, addToast, cart, exchangeRateBs]);

  const handleOpenCash = useCallback(async () => {
    setCashMode('open');
    setCashError(null);
    setShowCashModal(true);
  }, []);

  const handleCloseCash = useCallback(async () => {
    if (!tenantId) return;
    setCashError(null);
    setVerifyLoading(true);
    setShowVerifyConfirm(true);
    try {
      const [soldResult, lowStockResult] = await Promise.all([
        posService.getTodaySoldProducts(tenantId, 10),
        inventoryService.getLowStockProducts(tenantId),
      ]);
      const soldCount = soldResult.ok ? soldResult.data.length : 0;
      const lowStockCount = lowStockResult.ok ? lowStockResult.data.length : 0;
      setVerifyCounts({ sold: soldCount, lowStock: lowStockCount });

      if (soldCount === 0 && lowStockCount === 0) {
        setShowVerifyConfirm(false);
        setCashMode('close');
        setShowCashModal(true);
        return;
      }
    } catch {
      setVerifyCounts({ sold: 0, lowStock: 0 });
      setShowVerifyConfirm(false);
      setCashMode('close');
      setShowCashModal(true);
    } finally {
      setVerifyLoading(false);
    }
  }, [tenantId]);

  const handleVerifyYes = useCallback(() => {
    setShowVerifyConfirm(false);
    setShowVerifyModal(true);
  }, []);

  const handleVerifyNo = useCallback(() => {
    setShowVerifyConfirm(false);
    setCashMode('close');
    setShowCashModal(true);
  }, []);

  const handleVerifyComplete = useCallback(() => {
    setShowVerifyModal(false);
    setCashMode('close');
    setShowCashModal(true);
  }, []);

  const handleVerifyClose = useCallback(() => {
    setShowVerifyModal(false);
  }, []);

  const handleCashOpenSubmit = useCallback(
    async (balance: number) => {
      if (!tenantId || !userId) return false;
      const ok = await openCashRegister(tenantId, balance, userId);
      if (!ok) {
        setCashError(usePosStore.getState().error);
      }
      return ok;
    },
    [tenantId, userId, openCashRegister],
  );

  const handleCashCloseSubmit = useCallback(
    async (declared: number) => {
      if (!tenantId || !userId) return false;
      const ok = await closeCashRegister(tenantId, declared, userId);
      if (!ok) {
        setCashError(usePosStore.getState().error);
      }
      return ok;
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
        setMobileCartOpen(false);
      }
    },
    [tenantId, parkCart],
  );

  const handleLoadParked = useCallback(
    (parked: ParkedCart) => {
      loadParkedCart(parked);
      setPaymentMethod(null);
      setMobileCartOpen(true);
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
        const presentation = await inventoryService.getPresentationByBarcode(code, tenantId);
        if (presentation?.id) {
          addToCart(result.data, 1, { id: presentation.id, name: presentation.name, priceUsd: presentation.priceUsd, unitMultiplier: presentation.unitMultiplier });
        } else {
          addToCart(result.data, 1);
        }
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

  const isFromPreviousDay = useMemo(() => {
    if (!cashRegister?.isOpen || !cashRegister?.openedAt) return false;
    return !isSameDayVzla(new Date(cashRegister.openedAt), new Date());
  }, [cashRegister?.isOpen, cashRegister?.openedAt]);

  if (!tenantId) {
    return (
      <div className="p-4 flex items-center justify-center h-full">
        <Alert variant="info">Selecciona un local para usar el POS.</Alert>
      </div>
    );
  }

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="flex flex-row h-full w-full min-w-0">
      <div className="flex-1 min-w-0 h-full flex flex-col">
        <div className="flex items-center gap-2 px-3 pt-2 pb-1">
          <CashStatusBadge isOpen={isOpen} onClick={isOpen ? handleCloseCash : handleOpenCash} role={role} disabled={!isOnline} />
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
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-full transition-all active:scale-95 ${
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
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-full transition-all active:scale-95 ${
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

        {error && !(cashError && showCashModal) && (
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
            <div className="flex-1 overflow-hidden relative">
              {(!isOpen || isFromPreviousDay) && (
                <div className="absolute inset-0 z-30 bg-linear-to-br from-white/90 via-white/95 to-gray-100/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
                  <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-2xl border border-white/50 max-w-xs flex flex-col items-center gap-3">
                    <div className="p-3 bg-warning/10 rounded-full text-warning">
                      <AlertTriangle size={32} />
                    </div>
                    <h3 className="font-bold text-gray-900">
                      {isFromPreviousDay ? 'Caja del Día Anterior' : 'Caja Cerrada'}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {isFromPreviousDay 
                        ? 'La caja quedó abierta desde ayer. Debes realizar el cierre para poder continuar hoy.'
                        : 'Debes abrir la caja del día para poder agregar productos y realizar ventas.'}
                    </p>
                    <Button 
                      variant={isFromPreviousDay ? 'danger' : 'primary'} 
                      className="w-full mt-2" 
                      onClick={isFromPreviousDay ? handleCloseCash : handleOpenCash}
                    >
                      {isFromPreviousDay ? 'Cerrar Caja de Ayer' : 'Abrir Caja'}
                    </Button>
                  </div>
                </div>
              )}
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
        isOpen={showWeightModal}
        onClose={() => {
          setShowWeightModal(false);
          setWeightingProduct(null);
        }}
        onConfirm={handleWeightedConfirm}
        loading={false}
        product={weightingProduct}
        quantity={weightingQty}
        onQuantityChange={setWeightingQty}
      />

      <CashRegisterModal
        isOpen={showCashModal}
        onClose={() => { setShowCashModal(false); setCashError(null); }}
        mode={cashMode}
        currentSalesCount={cashRegister?.totalSalesCount ?? 0}
        currentSalesBs={cashRegister?.totalSalesBs ?? 0}
        currentIgtfBs={cashRegister?.totalIgtfBs ?? 0}
        openingBalanceBs={cashRegister?.openingBalanceBs ?? 0}
        exchangeRate={exchangeRate}
        onOpenCash={handleCashOpenSubmit}
        onCloseCash={handleCashCloseSubmit}
        error={cashError}
        loading={loading}
        disabled={!isOnline}
      />

      <StockVerificationModal
        isOpen={showVerifyModal}
        onClose={handleVerifyClose}
        onComplete={handleVerifyComplete}
        tenantId={tenantId ?? ''}
        userId={userId ?? ''}
      />

      <Modal
        isOpen={showVerifyConfirm}
        onClose={() => setShowVerifyConfirm(false)}
        title="Verificar inventario"
        size="sm"
      >
        {verifyLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <div className="flex flex-col gap-4 animate-slide-down">
            <div className="flex flex-col items-center gap-3 pt-2">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center ring-1 ring-primary/20 bg-primary/10">
                <Package size={24} className="text-primary" />
              </div>
              <p className="text-sm text-gray-600 text-center">
                Hay <strong>{verifyCounts.sold + verifyCounts.lowStock}</strong> producto{(verifyCounts.sold + verifyCounts.lowStock) > 1 ? 's' : ''} para verificar
                {verifyCounts.sold > 0 && <> (<strong>{verifyCounts.sold}</strong> vendido{verifyCounts.sold > 1 ? 's' : ''} hoy</>}
                {verifyCounts.sold > 0 && verifyCounts.lowStock > 0 ? <>, </> : null}
                {verifyCounts.lowStock > 0 ? <><strong>{verifyCounts.lowStock}</strong> con bajo stock</> : null}
                {verifyCounts.sold > 0 ? <> )</> : null}.
                ¿Deseas verificar el stock físico antes de cerrar caja?
              </p>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" onClick={handleVerifyNo}>Solo cerrar</Button>
              <Button variant="primary" onClick={handleVerifyYes}>Verificar</Button>
            </div>
          </div>
        )}
      </Modal>

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
        <div className="flex flex-col items-center gap-3 pt-2 animate-slide-down">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center ring-1 ring-danger/20 bg-danger/10">
            <AlertTriangle size={24} className="text-danger" />
          </div>
          <p className="text-sm text-gray-600 text-center">
            Se restaurará el stock de todos los productos de esta venta. Esta acción no se puede deshacer.
          </p>
        </div>
      </Modal>

      <BarcodeScannerModal
        isOpen={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        onScan={handleBarcodeScan}
      />

      <Modal
        isOpen={completedSale !== null}
        onClose={() => setCompletedSale(null)}
        title="Venta completada"
        size="sm"
      >
        {completedSale && (
          <div className="flex flex-col items-center gap-4 py-2 animate-slide-down">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center animate-check-pop">
              <CheckCircle2 size={32} className="text-success" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatUsd(completedSale.totalUsd)}</p>
            <p className="text-sm text-text-secondary -mt-2">{formatBs(completedSale.totalBs)}</p>
            <Badge variant="success" className="text-xs">
              {METADATA_PAGOS[completedSale.paymentMethod]?.label ?? completedSale.paymentMethod}
            </Badge>
            <Button variant="ghost" fullWidth onClick={() => setCompletedSale(null)}>
              Nueva venta
            </Button>
          </div>
        )}
      </Modal>

      <PresentationSelector
        isOpen={selectedProductForPres !== null}
        onClose={() => setSelectedProductForPres(null)}
        product={selectedProductForPres}
        presentations={selectedProductForPres ? getPresentations(selectedProductForPres.id) : []}
        onSelect={(_product, selection) => {
          handleAddToCart(_product);
          addToCart(_product, 1, selection);
        }}
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
