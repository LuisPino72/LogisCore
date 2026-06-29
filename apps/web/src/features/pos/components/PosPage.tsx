import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, BottomNav, ModuleOnboarding, Tooltip } from '../../../common/components';
import { useToastStore } from '../../../stores/toastStore';
import { usePosStore } from '../stores/posStore';
import { AlertTriangle, Scan, Package, History as HistoryIcon, ShoppingCart, DollarSign, MessageCircle, Truck } from 'lucide-react';
import { usePos } from '../hooks/usePos';
import { usePosNavigation } from '../hooks/usePosNavigation';
import { usePosModals } from '../hooks/usePosModals';
import { usePosVerification } from '../hooks/usePosVerification';
import { useBarcodeScan } from '../hooks/useBarcodeScan';
import { useKitchenNotifications } from '../hooks/useKitchenNotifications';
import { useWhatsAppShare } from '../hooks/useWhatsAppShare';
import { handleServiceError } from '../../../common/utils/handleServiceError';
import { useAuthStore } from '../../auth/stores/authStore';
import { hasActionPermission } from '../../auth/permissions/rolePermissions';
import { ProductGrid } from './ProductGrid';
import { CartPanel } from './CartPanel';
import { FlyToCart } from './FlyToCart';
import { WeightEntryModal } from './WeightEntryModal';
import { CashRegisterModal } from './CashRegisterModal';
import { RegisterSelectionModal } from './RegisterSelectionModal';
import { CashStatusBadge } from './CashStatusBadge';
import { ParkCartModal } from './ParkCartModal';
import { DeliveryPromptModal } from './DeliveryPromptModal';
import { VoidConfirmModal } from './VoidConfirmModal';
import { PayConfirmModal } from './PayConfirmModal';
import { CompletedSaleModal } from './CompletedSaleModal';
import { VerifyConfirmModal } from './VerifyConfirmModal';
import { OrderPayModal } from './OrderPayModal';
import { OrdersTab } from './OrdersTab';
import { SalesHistory } from './SalesHistory';
import { receiptService, normalizeWaPhone } from '../services/receiptService';
import { TableGrid } from './TableGrid';
import { StockVerificationModal } from './StockVerificationModal';
import { PresentationSelector } from './PresentationSelector';
import { KitchenReadyNotification } from './KitchenReadyNotification';
import { DeliveryDispatchPanel } from './DeliveryDispatchPanel';
import { buildReorderUrl } from '../../../lib/reorderHelper';

import { BarcodeScannerModal } from '../../shared/components/BarcodeScannerModal';
import { CustomerPickerModal } from '../../customers/components/CustomerPickerModal';
import type { Product } from '../../../specs/inventory';
import type { PaymentMethod, ParkedCart, TenantInfo, PresentationSelection } from '../types';
import type { DexieSale } from '../../../services/dexie/types';
import { inventoryService } from '../../inventory/services/inventoryService';
import { useOnlineStatus } from '../../../services/network/useNetworkGuard';
import { logger } from '../../../lib/logger';
import { isSameDayVzla } from '../../../lib/date';
import { preciseRound } from '@logiscore/shared';
import { dashboardService } from '../../dashboard/services/dashboardService';
import { useSettingsStore } from '../../settings/stores/settingsStore';
import { failure, AppError } from '@logiscore/core';
import { confirmOrderPayment, confirmDelivery, generateMapsLink } from '../services/saleService';
import { customerService } from '../../customers/services/customerService';

interface PosPageProps {
  tenantId: string | null;
  userEmail?: string;
}

export function PosPage({ tenantId }: PosPageProps) {
  const {
    products, cart, cashRegister, isOpen, loading, error, searchQuery, parkedCarts, favoriteProductIds, salesHistory, salesHistoryTotal, salesHistoryLoading,
    addToCart, removeFromCart, updateCartItemQuantity, clearCart,
    completeSale, openCashRegister, closeCashRegister, parkCart, loadParkedCart, deleteParkedCart,
    toggleFavorite, fetchSalesHistory, voidSale, getTodaySoldProducts,
    search, userId, role, exchangeRate,
    selectedCustomer, setSelectedCustomer,
    isCreditSale, setIsCreditSale,
    getPresentations,
  } = usePos(tenantId);

  const activeSessionId = usePosStore((s) => s.activeSessionId);
  const registerLoading = usePosStore((s) => s.loading);
  const registerName = usePosStore((s) => s.registerName);
  const clearActiveRegister = usePosStore((s) => s.clearActiveRegister);
  const categories = usePosStore((s) => s.categories);
  const selectedCategory = usePosStore((s) => s.selectedCategory);
  const lowStockAlert = usePosStore((s) => s.lowStockAlert);
  const setSelectedCategory = usePosStore((s) => s.setSelectedCategory);
  const loadCategories = usePosStore((s) => s.loadCategories);
  const loadLowStockAlert = usePosStore((s) => s.loadLowStockAlert);
  const showDeliveryPrompt = usePosStore((s) => s.showDeliveryPrompt);
  const setShowDeliveryPrompt = usePosStore((s) => s.setShowDeliveryPrompt);
  const parkAsDelivery = usePosStore((s) => s.parkAsDelivery);

  const needsKitchenDefault = useSettingsStore((s) => s.needsKitchenDefault);
  const defaultDeliveryFee = useSettingsStore((s) => s.defaultDeliveryFee);

  const { addToast } = useToastStore();

  const session = useAuthStore((s) => s.session);
  const canOpenBox = hasActionPermission(session, 'pos', 'open_box');
  const canCloseBox = hasActionPermission(session, 'pos', 'close_box');
  const canManageRegisters = hasActionPermission(session, 'pos', 'manage_registers');
  const canVoidSale = hasActionPermission(session, 'pos', 'void_sale');

  const { activeTab, mobileCartOpen, switchToSell, switchToHistory, switchToOrders, toggleMobileCart, closeMobileCart } = usePosNavigation();
  const {
    showWeightModal, weightingProduct, weightingQty, setWeightingQty,
    showCashModal, cashMode,
    showParkModal,
    showBarcodeScanner, setShowBarcodeScanner,
    selectedProductForPres,
    voidConfirmId, setVoidConfirmId,
    completedSale, setCompletedSale,
    openWeightModal, closeWeightModal,
    openCashModal, closeCashModal,
    openParkModal, closeParkModal,
    openPresModal, closePresModal,
  } = usePosModals();
  const {
    showVerifyConfirm, showVerifyModal, verifyLoading, setVerifyLoading,
    verifyCounts, cashError, setCashError,
    openVerifyConfirm, closeVerifyConfirm, openVerifyModal, closeVerifyModal,
  } = usePosVerification();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [parkTableNumber, setParkTableNumber] = useState<number | null>(null);
  const { sharing, handleWhatsAppShare } = useWhatsAppShare();
  const [showFullAlert, setShowFullAlert] = useState(false);
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [showRegisterSelection, setShowRegisterSelection] = useState(false);
  const { kitchenReadyNotifs, dismissNotification } = useKitchenNotifications({ tenantId });
  const [showDispatchPanel, setShowDispatchPanel] = useState(false);
  const [dispatchSale, setDispatchSale] = useState<DexieSale | null>(null);
  const [dispatchCustomerName, setDispatchCustomerName] = useState('');
  const [dispatchCustomerPhone, setDispatchCustomerPhone] = useState('');
  const [orderPayModal, setOrderPayModal] = useState<{ sale: DexieSale; method: PaymentMethod | null } | null>(null);

  const { handleBarcodeScan } = useBarcodeScan({
    tenantId,
    onProductFound: async (product) => {
      await addToCart(product, 1);
    },
    onWeightedProduct: (product) => openWeightModal(product),
    onPresentationNeeded: (product) => openPresModal(product),
    onError: (msg) => addToast({ type: 'warning', message: msg, duration: 3000 }),
  });
  const [showPayConfirm, setShowPayConfirm] = useState(false);

  // Bug #6: Re-evaluar isFromPreviousDay al cruzar medianoche
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const exchangeRateBs = exchangeRate ?? 0;
  const isOnline = useOnlineStatus();

  const fetchDispatchCustomer = useCallback(async (customerId: string | undefined, tenantId: string | null) => {
    if (!customerId || !tenantId) return { name: 'Cliente', phone: '' };
    const result = await customerService.getCustomerById(customerId, tenantId);
    if (result.ok && result.data) {
      return { name: result.data.name, phone: result.data.phone ?? '' };
    }
    return { name: 'Cliente', phone: '' };
  }, []);

  const handleOrderPayment = useCallback(async (saleId: string, method: PaymentMethod, deliveryFee?: number) => {
    if (!exchangeRateBs || exchangeRateBs <= 0) {
      addToast({ type: 'error', message: 'No hay tasa de cambio configurada.', duration: 4000 });
      return;
    }
    setProcessing(true);
    try {
      const result = await confirmOrderPayment(saleId, method, exchangeRateBs, activeSessionId ?? undefined, deliveryFee);
      if (result.ok) {
        const saleData = result.data;
        if (!saleData) {
          logger.error('POS', 'confirmOrderPayment returned null data');
          return;
        }
        const sale = saleData as unknown as DexieSale;
        if (sale.orderType === 'delivery') {
          const { name, phone } = await fetchDispatchCustomer(sale.customerId, tenantId);
          setDispatchSale(sale);
          setDispatchCustomerName(name);
          setDispatchCustomerPhone(phone);
          setShowDispatchPanel(true);
        } else {
          addToast({ type: 'success', message: 'Pedido pagado', duration: 3000 });
        }
      } else {
        handleServiceError(result);
      }
    } catch (err) {
      logger.error('POS', 'Error en handleOrderPayment', err);
      addToast({ type: 'error', message: 'Error al procesar el pago.', duration: 5000 });
    } finally {
      setProcessing(false);
      setOrderPayModal(null);
    }
  }, [exchangeRateBs, activeSessionId, tenantId, addToast, fetchDispatchCustomer]);

  const handlePayOrder = useCallback((sale: DexieSale) => {
    setOrderPayModal({ sale, method: null });
  }, []);

  const handleConfirmPayOrder = useCallback((deliveryFee?: number) => {
    if (!orderPayModal?.method || !orderPayModal?.sale) return;
    handleOrderPayment(orderPayModal.sale.id, orderPayModal.method, deliveryFee);
  }, [orderPayModal, handleOrderPayment]);

  const handleDispatchOrder = useCallback((sale: DexieSale) => {
    setDispatchSale(sale);
    setDispatchCustomerName('Cliente');
    setShowDispatchPanel(true);
  }, []);

  const handleSendOrderSummary = useCallback(async (sale: DexieSale) => {
    if (!tenantId) return;
    const db = (await import('../../../services/dexie/db')).getDb();
    const items = await db.saleItems.where({ saleId: sale.id }).filter(i => !i.deletedAt).toArray();
    const customer = sale.customerId ? await db.customers.get(sale.customerId) : null;
    const link = receiptService.generateOrderSummaryLink(
      sale,
      items.map(i => ({ productName: i.productName, quantity: i.quantity, totalPriceUsd: i.totalPriceUsd })),
      customer?.phone ?? '',
      customer?.name,
    );
    if (link) {
      window.open(link, '_blank');
    } else {
      addToast({ type: 'warning', message: 'El cliente no tiene teléfono registrado.', duration: 4000 });
    }
  }, [tenantId, addToast]);

  const handleSendAddressToMotorizado = useCallback(async (sale: DexieSale) => {
    if (!sale.deliveryPersonPhone && !sale.deliveryPersonName) {
      addToast({ type: 'warning', message: 'No hay motorizado asignado a esta orden.', duration: 4000 });
      return;
    }
    const mapsLink = generateMapsLink(sale.deliveryLat, sale.deliveryLng, sale.deliveryAddress);
    const db = (await import('../../../services/dexie/db')).getDb();
    const customer = sale.customerId ? await db.customers.get(sale.customerId) : null;
    const link = receiptService.generateAddressToMotorizadoLink(sale, customer?.name || 'Cliente', customer?.phone || '', mapsLink);
    if (link) {
      window.open(link, '_blank');
    } else {
      addToast({ type: 'warning', message: 'El motorizado no tiene teléfono registrado.', duration: 4000 });
    }
  }, [addToast]);

  const handleNotifyCustomerAfterDispatch = useCallback(async (sale: DexieSale) => {
    if (!sale.customerId) {
      addToast({ type: 'warning', message: 'La orden no tiene cliente asignado.', duration: 4000 });
      return;
    }
    const db = (await import('../../../services/dexie/db')).getDb();
    const customer = await db.customers.get(sale.customerId);
    if (!customer || !customer.phone) {
      addToast({ type: 'warning', message: 'El cliente no tiene teléfono registrado.', duration: 4000 });
      return;
    }
    const personPhone = sale.deliveryPersonPhone ? `+58${sale.deliveryPersonPhone.replace(/\D/g, '')}` : '';
    const lines = [
      `¡Hola ${customer.name}! Tu pedido va en camino con ${sale.deliveryPersonName || 'motorizado'} 🚴`,
      personPhone ? `📞 Contacta al delivery: ${personPhone}` : '',
    ].filter(Boolean).join('\n\n');
    const text = encodeURIComponent(lines);
    const normalizedPhone = normalizeWaPhone(customer.phone);
    if (normalizedPhone) {
      window.open(`https://wa.me/${normalizedPhone}?text=${text}`, '_blank');
    } else {
      addToast({ type: 'warning', message: 'Número de teléfono inválido.', duration: 4000 });
    }
  }, [addToast]);

  const handleConfirmDeliveryOrder = useCallback(async (saleId: string) => {
    const result = await confirmDelivery(saleId);
    if (result.ok) {
      addToast({ type: 'success', message: 'Entrega confirmada', duration: 3000 });
    } else {
      handleServiceError(result);
    }
  }, [addToast]);



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
    loadCategories(tenantId);
    loadLowStockAlert(tenantId);
    dashboardService.getTenantInfo(tenantId).then((res) => {
      if (res.ok && res.data) setTenantInfo(res.data);
    });
  }, [tenantId, loadCategories, loadLowStockAlert]);

  useEffect(() => {
    if (registerLoading) return;
    if (!activeSessionId && tenantId) {
      setShowRegisterSelection(true);
    } else {
      setShowRegisterSelection(false);
    }
  }, [activeSessionId, tenantId, registerLoading]);

  const handleRegisterSelected = useCallback((_registerId: string, _sessionId: string, _name: string) => {
    setShowRegisterSelection(false);
    addToast({ type: 'success', message: `Caja "${_name}" abierta correctamente`, duration: 3000 });
  }, [addToast]);

  const handleChangeRegister = useCallback(() => {
    clearActiveRegister();
    setShowRegisterSelection(true);
  }, [clearActiveRegister]);

  useEffect(() => {
    if (completedSale) {
      const timer = setTimeout(() => setCompletedSale(null), 30000);
      return () => clearTimeout(timer);
    }
  }, [completedSale, setCompletedSale]);

  const navigate = useNavigate();
  const handleReorder = useCallback((product: Product) => {
    navigate(buildReorderUrl(product.id));
  }, [navigate]);

  const handleAddToCart = useCallback(
    async (product: Product) => {
      if (product.isWeighted) {
        openWeightModal(product);
        return;
      }
      const presList = getPresentations(product.id);
      if (presList.length > 0) {
        openPresModal(product);
        return;
      }
      const added = await addToCart(product, 1);
      if (added) {
        addToast({ type: 'success', message: `${product.name} agregado`, duration: 1500 });
      } else {
        const error = usePosStore.getState().error;
        if (error) {
          addToast({ type: 'warning', message: error, duration: 3000 });
        }
      }
    },
    [addToCart, addToast, getPresentations, openWeightModal, openPresModal],
  );

  const handleWeightedConfirm = useCallback(async () => {
    if (!weightingProduct) return;
    const qty = parseFloat(weightingQty);
    if (!qty || qty <= 0) return;
    const added = await addToCart(weightingProduct, qty);
    closeWeightModal();
    if (added) {
      addToast({ type: 'success', message: `${weightingProduct.name} agregado`, duration: 1500 });
    } else {
      const error = usePosStore.getState().error;
      if (error) {
        addToast({ type: 'warning', message: error, duration: 3000 });
      }
    }
  }, [weightingProduct, weightingQty, addToCart, addToast, closeWeightModal]);

  const executePayment = useCallback(async () => {
    if (!tenantId || !userId || !paymentMethod) {
      addToast({ type: 'warning', message: 'Faltan datos para procesar la venta. Verifica sesión y método de pago.', duration: 4000 });
      return;
    }
    setProcessing(true);
    try {
      const saleResult = await completeSale(tenantId, paymentMethod, userId);
      if (saleResult.ok) {
        const saleId = saleResult.data;
        const totalUsd = cart.reduce((sum, item) => sum + item.totalPriceUsd, 0);
        const totalBs = exchangeRateBs > 0 ? preciseRound(totalUsd * exchangeRateBs, 2) : 0;
        const subtotalBs = totalBs;
        const items = cart.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unitPriceUsd: item.unitPriceUsd,
          totalPriceUsd: item.totalPriceUsd,
          presentationName: item.presentationName,
          unit: item.unit,
        }));
        setCompletedSale({ saleId, subtotalBs, totalUsd, totalBs, paymentMethod, items, exchangeRate: exchangeRateBs, customerId: selectedCustomer?.id, customerName: selectedCustomer?.name, customerPhone: selectedCustomer?.phone });
        setPaymentMethod(null);
        clearCart();
        closeMobileCart();
      } else {
        handleServiceError(saleResult);
      }
    } catch (err) {
      logger.error('POS', 'Error inesperado al procesar el pago', err);
      addToast({ type: 'error', message: 'Error al procesar el pago. Verifica tu conexión e intenta de nuevo.', duration: 5000 });
    } finally {
      setProcessing(false);
    }
  }, [tenantId, userId, paymentMethod, completeSale, clearCart, addToast, cart, exchangeRateBs, selectedCustomer, closeMobileCart]);

  const handlePay = useCallback(() => {
    if (!tenantId || !userId || !paymentMethod) {
      addToast({ type: 'warning', message: 'Faltan datos para procesar la venta. Verifica sesión y método de pago.', duration: 4000 });
      return;
    }
    setShowPayConfirm(true);
  }, [tenantId, userId, paymentMethod, addToast]);

  const handleConfirmPay = useCallback(() => {
    setShowPayConfirm(false);
    executePayment();
  }, [executePayment]);

  const handleCancelPay = useCallback(() => {
    setShowPayConfirm(false);
  }, []);



  const isFromPreviousDay = useMemo(() => {
    if (!cashRegister?.isOpen || !cashRegister?.openedAt) return false;
    return !isSameDayVzla(new Date(cashRegister.openedAt), now);
  }, [cashRegister?.isOpen, cashRegister?.openedAt, now]);

  const handleOpenCash = useCallback(async () => {
    setCashError(null);
    openCashModal('open');
  }, [openCashModal, setCashError]);

  const handleCloseCash = useCallback(async () => {
    if (!tenantId) return;
    setCashError(null);
    setVerifyLoading(true);
    openVerifyConfirm({ sold: 0, lowStock: 0 });
    const referenceDate = isFromPreviousDay && cashRegister?.openedAt ? new Date(cashRegister.openedAt) : undefined;
    try {
      const [soldResult, lowStockResult] = await Promise.all([
        getTodaySoldProducts(tenantId, 10, referenceDate),
        inventoryService.getLowStockProducts(tenantId),
      ]);
      const soldCount = soldResult.ok ? soldResult.data.length : 0;
      const lowStockCount = lowStockResult.ok ? lowStockResult.data.length : 0;

      if (soldCount === 0 && lowStockCount === 0) {
        closeVerifyConfirm();
        openCashModal('close');
        return;
      }
      openVerifyConfirm({ sold: soldCount, lowStock: lowStockCount });
    } catch (err) {
      logger.error('POS', 'Error en verificación cierre caja:', err);
      closeVerifyConfirm();
      openCashModal('close');
    } finally {
      setVerifyLoading(false);
    }
  }, [tenantId, getTodaySoldProducts, isFromPreviousDay, cashRegister?.openedAt, openVerifyConfirm, closeVerifyConfirm, openCashModal, setCashError, setVerifyLoading]);

  const handleVerifyYes = useCallback(() => {
    openVerifyModal();
  }, [openVerifyModal]);

  const handleVerifyNo = useCallback(() => {
    closeVerifyConfirm();
    openCashModal('close');
  }, [closeVerifyConfirm, openCashModal]);

  const handleVerifyComplete = useCallback(() => {
    closeVerifyModal();
    openCashModal('close');
  }, [closeVerifyModal, openCashModal]);

  const handleVerifyClose = useCallback(() => {
    closeVerifyModal();
  }, [closeVerifyModal]);

  const handleCashOpenSubmit = useCallback(
    async (balance: number) => {
      if (!tenantId || !userId) return failure(new AppError('SALE_FAILED', 'Sesión incompleta. Recarga la página.'));
      const result = await openCashRegister(tenantId, balance, userId);
      if (!result.ok) {
        handleServiceError(result);
        setCashError(result.error?.message ?? 'Error al abrir la caja.');
        return failure(result.error);
      }
      return { ok: true as const, data: undefined as void };
    },
    [tenantId, userId, openCashRegister],
  );

  const handleCashCloseSubmit = useCallback(
    async (declared: number) => {
      if (!tenantId || !userId) return failure(new AppError('SALE_FAILED', 'Sesión incompleta. Recarga la página.'));
      const result = await closeCashRegister(tenantId, declared, userId);
      if (!result.ok) {
        handleServiceError(result);
        setCashError(result.error?.message ?? 'Error al cerrar la caja.');
        return failure(result.error);
      }
      return { ok: true as const, data: undefined as void };
    },
    [tenantId, userId, closeCashRegister],
  );

  const handlePark = useCallback(() => {
    setShowDeliveryPrompt(true);
  }, [setShowDeliveryPrompt]);

  const handleParkConfirm = useCallback(
    async (name: string) => {
      if (!tenantId) return;
      if (cart.length === 0) {
        addToast({ type: 'warning', message: 'Agrega productos al carrito antes de poner en cola.', duration: 4000 });
        return;
      }
      setProcessing(true);
      const ok = await parkCart(tenantId, name);
      setProcessing(false);
      if (ok.ok) {
        closeParkModal();
        setPaymentMethod(null);
        closeMobileCart();
        setParkTableNumber(null);
      }
    },
    [tenantId, cart.length, parkCart, closeParkModal, closeMobileCart, addToast],
  );

  const handleLoadParked = useCallback(
    (parked: ParkedCart) => {
      loadParkedCart(parked);
      setPaymentMethod(null);
      setParkTableNumber(null);
    },
    [loadParkedCart, setParkTableNumber],
  );

  const handleDeliveryConfirm = useCallback(
    async (needsKitchen: boolean) => {
      if (!tenantId) return;
      if (cart.length === 0) {
        addToast({ type: 'warning', message: 'Agrega productos al carrito antes de poner en cola.', duration: 4000 });
        return;
      }
      const deliveryName = `Delivery #${parkedCarts.length + 1}`;
      setProcessing(true);
      const result = await parkAsDelivery(tenantId, deliveryName, needsKitchen);
      setProcessing(false);
      if (result.ok) {
        addToast({ type: 'success', message: `${deliveryName} pausada${needsKitchen ? ' (requiere cocina)' : ''}.`, duration: 4000 });
        setPaymentMethod(null);
        closeMobileCart();
        setParkTableNumber(null);
      } else {
        addToast({ type: 'error', message: result.error.message, duration: 5000 });
      }
    },
    [tenantId, cart.length, parkAsDelivery, parkedCarts.length, closeMobileCart, addToast],
  );

  const handleJustPark = useCallback(() => {
    setShowDeliveryPrompt(false);
    openParkModal();
  }, [setShowDeliveryPrompt, openParkModal]);

  const handleParkTable = useCallback((tableNumber: number) => {
    if (parkTableNumber === tableNumber) return;
    setParkTableNumber(tableNumber);
    usePosStore.setState({ cart: [], activeParkedCartId: null });
    addToast({ type: 'success', message: `Mesa ${tableNumber} seleccionada. Agrega productos y presiona "Poner en cola" para asignarla.`, duration: 3000 });
  }, [addToast, parkTableNumber]);

  const handleConfirmVoid = useCallback(async () => {
    if (!voidConfirmId || !tenantId || !userId) return;
    const result = await voidSale(voidConfirmId, tenantId, userId);
    setVoidConfirmId(null);
    if (result.ok) {
      addToast({ type: 'success', message: 'Venta anulada. Stock restaurado.', duration: 4000 });
      fetchSalesHistory(tenantId);
    } else {
      handleServiceError(result);
    }
  }, [voidConfirmId, tenantId, userId, addToast, fetchSalesHistory]);

  const handlePresentationSelect = useCallback(async (product: Product, selection: PresentationSelection) => {
    const added = await addToCart(product, 1, selection);
    if (added) {
      addToast({ type: 'success', message: `${product.name} agregado`, duration: 1500 });
    } else {
      const error = usePosStore.getState().error;
      if (error) {
        addToast({ type: 'warning', message: error, duration: 3000 });
      }
    }
  }, [addToCart, addToast]);

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
          <Tooltip content={isOnline ? (isOpen ? 'Haz click para cerrar.' : 'Haz click para abrir.') : 'Necesitas internet para abrir o cerrar caja'} position="bottom">
            <CashStatusBadge isOpen={isOpen} onClick={isOpen ? handleCloseCash : handleOpenCash} role={role} disabled={!isOnline} canInteract={isOpen ? canCloseBox : canOpenBox} />
          </Tooltip>
          {registerName && isOpen && canManageRegisters && (
            <div className="flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-semibold px-2.5 py-1 rounded-full min-h-8">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              {registerName}
              <button
                type="button"
                onClick={handleChangeRegister}
                className="ml-1 text-primary/60 hover:text-primary transition-colors"
                title="Cambiar de caja"
              >
                ✕
              </button>
            </div>
          )}
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
                onClick={() => switchToSell()}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-full transition-all active:scale-[0.98] ${
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
                onClick={() => { switchToHistory(); if (tenantId) fetchSalesHistory(tenantId); }}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-full transition-all active:scale-[0.98] ${
                  activeTab === 'history'
                    ? 'bg-white text-primary shadow-sm'
                    : 'text-text-secondary hover:text-gray-700'
                }`}
              >
                <HistoryIcon size={16} />
                Historial
              </button>
            </Tooltip>
            <Tooltip content="Órdenes activas y delivery" position="bottom">
              <button
                type="button"
                onClick={() => switchToOrders()}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-full transition-all active:scale-[0.98] ${
                  activeTab === 'orders'
                    ? 'bg-white text-primary shadow-sm'
                    : 'text-text-secondary hover:text-gray-700'
                }`}
              >
                <Truck size={16} />
                Pedidos
              </button>
            </Tooltip>
          </div>
        </div>

        {error && !(cashError && showCashModal) && (
          <div className="px-3 pt-1">
            <Alert variant="warning">{error}</Alert>
          </div>
        )}

        {lowStockAlert.length > 0 && (
          <div className="px-3 pt-1">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-warning/10 border border-warning/20">
              <AlertTriangle size={16} className="text-warning shrink-0" />
              <span className={`text-xs text-warning font-medium ${showFullAlert ? '' : 'line-clamp-1 sm:line-clamp-none'}`}>
                Stock bajo: {lowStockAlert.slice(0, 3).map((p) => p.name).join(', ')}{lowStockAlert.length > 3 ? ` +${lowStockAlert.length - 3}` : ''}
              </span>
              {lowStockAlert.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowFullAlert((v) => !v)}
                  className="text-[10px] text-warning font-semibold hover:underline shrink-0 sm:hidden"
                >
                  {showFullAlert ? 'Ver menos' : 'Ver más'}
                </button>
              )}
              <Badge variant="warning" className="ml-auto text-xs shrink-0">{lowStockAlert.length}</Badge>
            </div>
          </div>
        )}

        {activeTab === 'sell' ? (
          <div className="animate-tab-fade">
            <TableGrid
              carts={parkedCarts}
              onLoad={handleLoadParked}
              onDelete={(id) => { if (tenantId) deleteParkedCart(tenantId, id); }}
              onParkTable={handleParkTable}
              selectedTableNumber={parkTableNumber}
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
                onReorder={handleReorder}
                tenantId={tenantId}
              />
            </div>
          </div>
        ) : activeTab === 'orders' ? (
          <div className="flex-1 overflow-hidden animate-tab-fade">
            {tenantId && (
              <div className="flex flex-col h-full">
                {kitchenReadyNotifs.length > 0 && (
                  <div className="flex flex-col gap-2 p-3 pb-0">
                    {kitchenReadyNotifs.map((n) => (
                      <KitchenReadyNotification
                        key={n.saleId}
                        saleId={n.saleId}
                        customerName={n.customerName}
                        orderNumber={n.orderNumber}
                        onDismiss={() => dismissNotification(n.saleId)}
                        onViewOrder={() => dismissNotification(n.saleId)}
                      />
                    ))}
                  </div>
                )}
                <div className="flex-1 overflow-auto">
                  <OrdersTab
                    tenantId={tenantId}
                    onPayOrder={handlePayOrder}
                    onDispatchOrder={handleDispatchOrder}
                    onConfirmDelivery={handleConfirmDeliveryOrder}
                    onSendOrderSummary={handleSendOrderSummary}
                    onSendAddressToMotorizado={handleSendAddressToMotorizado}
                    onNotifyCustomerAfterDispatch={handleNotifyCustomerAfterDispatch}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-hidden animate-tab-fade">
            <SalesHistory
              tenantId={tenantId ?? ''}
              sales={salesHistory}
              total={salesHistoryTotal}
              onVoid={(saleId) => setVoidConfirmId(saleId)}
              loading={salesHistoryLoading}
              canVoid={canVoidSale}
            />
          </div>
        )}
      </div>

      {activeTab === 'sell' && <FlyToCart />}

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
          onMobileToggle={toggleMobileCart}
          selectedCustomer={selectedCustomer}
          onSelectCustomer={() => setShowCustomerPicker(true)}
          onClearCustomer={() => setSelectedCustomer(null)}
          isCreditSale={isCreditSale}
          onSetIsCreditSale={setIsCreditSale}
        />
      )}

      {/* Mobile Bottom Nav */}
      <BottomNav
        activeId={activeTab}
        items={[
          { id: 'sell', label: 'Vender', icon: <Package size={20} />, onClick: () => switchToSell() },
          { id: 'orders', label: 'Pedidos', icon: <Truck size={20} />, onClick: () => switchToOrders() },
          { id: 'history', label: 'Historial', icon: <HistoryIcon size={20} />, onClick: () => { switchToHistory(); if (tenantId) fetchSalesHistory(tenantId); } },
        ]}
      />

      <WeightEntryModal
        isOpen={showWeightModal}
        onClose={closeWeightModal}
        onConfirm={handleWeightedConfirm}
        loading={false}
        product={weightingProduct}
        quantity={weightingQty}
        onQuantityChange={setWeightingQty}
      />

      {tenantId && (
        <RegisterSelectionModal
          tenantId={tenantId}
          isOpen={showRegisterSelection}
          onClose={() => { setShowRegisterSelection(false); }}
          onSuccess={handleRegisterSelected}
        />
      )}

      <CashRegisterModal
        isOpen={showCashModal}
        onClose={() => { closeCashModal(); setCashError(null); }}
        mode={cashMode}
        currentSalesCount={cashRegister?.totalSalesCount ?? 0}
        currentSalesBs={cashRegister?.totalSalesBs ?? 0}
        currentIgtfBs={cashRegister?.totalIgtfBs ?? 0}
        collectedDebtBs={cashRegister?.collectedDebtBs ?? 0}
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
        referenceDate={isFromPreviousDay && cashRegister?.openedAt ? new Date(cashRegister.openedAt) : undefined}
      />

      <VerifyConfirmModal
        isOpen={showVerifyConfirm}
        loading={verifyLoading}
        verifyCounts={verifyCounts}
        isFromPreviousDay={isFromPreviousDay}
        onVerify={handleVerifyYes}
        onSkip={handleVerifyNo}
        onClose={closeVerifyConfirm}
      />

      <ParkCartModal
        isOpen={showParkModal}
        onClose={() => { closeParkModal(); setParkTableNumber(null); }}
        onConfirm={handleParkConfirm}
        loading={processing}
        defaultTableNumber={parkTableNumber ?? undefined}
        existingNames={parkedCarts.map((c) => c.name)}
      />

      <DeliveryPromptModal
        isOpen={showDeliveryPrompt}
        onDelivery={handleDeliveryConfirm}
        onJustPark={handleJustPark}
        onClose={() => setShowDeliveryPrompt(false)}
        loading={processing}
        needsKitchenDefault={needsKitchenDefault}
      />

      <VoidConfirmModal
        isOpen={!!voidConfirmId}
        onConfirm={handleConfirmVoid}
        onCancel={() => setVoidConfirmId(null)}
      />

      <PayConfirmModal
        isOpen={showPayConfirm}
        cart={cart}
        exchangeRateBs={exchangeRateBs}
        paymentMethod={paymentMethod}
        selectedCustomer={selectedCustomer}
        isCreditSale={isCreditSale}
        processing={processing}
        onConfirm={handleConfirmPay}
        onCancel={handleCancelPay}
      />

      <BarcodeScannerModal
        isOpen={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        onScan={handleBarcodeScan}
      />

      {tenantId && (
        <CustomerPickerModal
          isOpen={showCustomerPicker}
          onClose={() => setShowCustomerPicker(false)}
          onSelect={(c) => setSelectedCustomer(c)}
          tenantId={tenantId}
          selectedCustomerId={selectedCustomer?.id ?? null}
        />
      )}

      <CompletedSaleModal
        completedSale={completedSale}
        sharing={sharing}
        onShare={(mode) => handleWhatsAppShare(mode, completedSale, tenantInfo)}
        onClose={() => setCompletedSale(null)}
      />

      <PresentationSelector
        isOpen={selectedProductForPres !== null}
        onClose={closePresModal}
        product={selectedProductForPres}
        presentations={selectedProductForPres ? getPresentations(selectedProductForPres.id) : []}
        onSelect={handlePresentationSelect}
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

      <OrderPayModal
        isOpen={!!orderPayModal}
        sale={orderPayModal}
        processing={processing}
        onConfirm={handleConfirmPayOrder}
        onCancel={() => setOrderPayModal(null)}
        onMethodChange={(m) => setOrderPayModal((prev) => prev ? { ...prev, method: m } : null)}
        defaultDeliveryFee={defaultDeliveryFee}
      />

      {dispatchSale && (
        <DeliveryDispatchPanel
          isOpen={showDispatchPanel}
          onClose={() => { setShowDispatchPanel(false); setDispatchSale(null); }}
          sale={dispatchSale}
          customerName={dispatchCustomerName}
          customerPhone={dispatchCustomerPhone}
        />
      )}

      {sharing && (
        <div className="fixed inset-0 z-99999 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-white shadow-2xl border border-gray-100 animate-slide-down">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
              <MessageCircle size={28} className="text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-900">Enviando por WhatsApp</p>
              <p className="text-xs text-gray-700 mt-1">Generando PDF y abriendo WhatsApp...</p>
            </div>
            <div className="w-48 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full animate-shimmer" style={{ width: '40%', backgroundSize: '200px 100%' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
