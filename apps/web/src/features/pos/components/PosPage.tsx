import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, BottomNav, ModuleOnboarding, Tooltip, Modal, Spinner } from '../../../common/components';
import { useToastStore } from '../../../stores/toastStore';
import { usePosStore } from '../stores/posStore';
import { AlertTriangle, CheckCircle2, Scan, Package, History as HistoryIcon, ShoppingCart, DollarSign, FileText, MessageCircle, User, Truck } from 'lucide-react';
import { usePos } from '../hooks/usePos';
import { usePosNavigation } from '../hooks/usePosNavigation';
import { usePosModals } from '../hooks/usePosModals';
import { usePosVerification } from '../hooks/usePosVerification';
import { ProductGrid } from './ProductGrid';
import { CartPanel } from './CartPanel';
import { FlyToCart } from './FlyToCart';
import { WeightEntryModal } from './WeightEntryModal';
import { CashRegisterModal } from './CashRegisterModal';
import { RegisterSelectionModal } from './RegisterSelectionModal';
import { CashStatusBadge } from './CashStatusBadge';
import { ParkCartModal } from './ParkCartModal';
import { DeliveryPromptModal } from './DeliveryPromptModal';
import { OrdersTab } from './OrdersTab';
import { SalesHistory } from './SalesHistory';
import { TableGrid } from './TableGrid';
import { StockVerificationModal } from './StockVerificationModal';
import { PresentationSelector } from './PresentationSelector';
import { KitchenReadyNotification } from './KitchenReadyNotification';
import { DeliveryDispatchPanel } from './DeliveryDispatchPanel';
import { buildReorderUrl } from '../../../lib/reorderHelper';

import { BarcodeScannerModal } from '../../shared/components/BarcodeScannerModal';
import { CustomerPickerModal } from '../../customers/components/CustomerPickerModal';
import type { Product } from '../../../specs/inventory';
import type { PaymentMethod, ParkedCart } from '../types';
import type { DexieSale } from '../../../services/dexie/types';
import { inventoryService } from '../../inventory/services/inventoryService';
import { useOnlineStatus } from '../../../services/network/useNetworkGuard';
import { logger } from '../../../lib/logger';
import { isSameDayVzla } from '../../../lib/date';
import { preciseRound } from '@logiscore/shared';
import { receiptService } from '../services/receiptService';
import { dashboardService } from '../../dashboard/services/dashboardService';
import { useSettingsStore } from '../../settings/stores/settingsStore';
import { METADATA_PAGOS } from '../../../specs/pos';
import { formatBs, formatUsd } from '@/lib/formatBs';
import { failure, AppError, SystemEvents, EventBus } from '@logiscore/core';
import { confirmOrderPayment } from '../services/saleService';
import { confirmDelivery } from '../services/saleService';
import { getDb } from '../../../services/dexie/db';

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

  const { addToast } = useToastStore();

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
  const [sharing, setSharing] = useState(false);
  const [showFullAlert, setShowFullAlert] = useState(false);
  const [tenantInfo, setTenantInfo] = useState<{ name: string; rif: string; direccion?: string; telefono?: string; logoUrl?: string } | null>(null);
  const [showRegisterSelection, setShowRegisterSelection] = useState(false);
  const [kitchenReadyNotifs, setKitchenReadyNotifs] = useState<Array<{ saleId: string; customerName: string; orderNumber: string }>>([]);
  const [showDispatchPanel, setShowDispatchPanel] = useState(false);
  const [dispatchSale, setDispatchSale] = useState<DexieSale | null>(null);
  const [dispatchCustomerName, setDispatchCustomerName] = useState('');
  const [orderPayModal, setOrderPayModal] = useState<{ sale: DexieSale; method: PaymentMethod | null } | null>(null);

  // Global Barcode Listener State
  const SCAN_TIMEOUT_MS = 120;
  const MAX_BARCODE_LENGTH = 50;
  const barcodeBuffer = useRef('');
  const lastKeyTime = useRef(0);
  const [showPayConfirm, setShowPayConfirm] = useState(false);

  // Bug #6: Re-evaluar isFromPreviousDay al cruzar medianoche
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const exchangeRateBs = exchangeRate ?? 0;
  const isOnline = useOnlineStatus();

  const handleOrderPayment = useCallback(async (saleId: string, method: PaymentMethod) => {
    if (!exchangeRateBs || exchangeRateBs <= 0) {
      addToast({ type: 'error', message: 'No hay tasa de cambio configurada.', duration: 4000 });
      return;
    }
    setProcessing(true);
    try {
      const result = await confirmOrderPayment(saleId, method, exchangeRateBs, activeSessionId ?? undefined);
      if (result.ok) {
        const sale = result.data as unknown as DexieSale;
        if (sale.orderType === 'delivery') {
          const db = getDb();
          const customer = sale.customerId ? await db.customers.get(sale.customerId) : null;
          setDispatchSale(sale);
          setDispatchCustomerName(customer?.name || 'Cliente');
          setShowDispatchPanel(true);
        } else {
          addToast({ type: 'success', message: 'Pedido pagado', duration: 3000 });
        }
      } else {
        addToast({ type: 'error', message: result.error?.message || 'Error al cobrar', duration: 5000 });
      }
    } catch (err) {
      logger.error('POS', 'Error en handleOrderPayment', err);
      addToast({ type: 'error', message: 'Error al procesar el pago.', duration: 5000 });
    } finally {
      setProcessing(false);
      setOrderPayModal(null);
    }
  }, [exchangeRateBs, activeSessionId, addToast]);

  const handlePayOrder = useCallback((sale: DexieSale) => {
    setOrderPayModal({ sale, method: null });
  }, []);

  const handleConfirmPayOrder = useCallback(() => {
    if (!orderPayModal?.method || !orderPayModal?.sale) return;
    handleOrderPayment(orderPayModal.sale.id, orderPayModal.method);
  }, [orderPayModal, handleOrderPayment]);

  const handleDispatchOrder = useCallback((sale: DexieSale) => {
    setDispatchSale(sale);
    setDispatchCustomerName('Cliente');
    setShowDispatchPanel(true);
  }, []);

  const handleConfirmDeliveryOrder = useCallback(async (saleId: string) => {
    const result = await confirmDelivery(saleId);
    if (result.ok) {
      addToast({ type: 'success', message: 'Entrega confirmada', duration: 3000 });
    } else {
      addToast({ type: 'error', message: result.error?.message || 'Error al confirmar entrega', duration: 4000 });
    }
  }, [addToast]);

  useEffect(() => {
    const sub = EventBus.on(
      SystemEvents.ORDER_STATUS_CHANGED,
      (payload: unknown) => {
        const data = payload as { saleId?: string; newStatus?: string };
        if (data?.newStatus === 'lista' && data?.saleId) {
          const db = getDb();
          db.sales.get(data.saleId).then((sale) => {
            if (!sale) return;
            db.customers.get(sale.customerId ?? '').then((customer) => {
              setKitchenReadyNotifs((prev) => {
                const next = [...prev, {
                  saleId: data.saleId!,
                  customerName: customer?.name || 'Cliente',
                  orderNumber: sale.orderNumber ?? data.saleId!.slice(0, 8),
                }];
                return next.slice(-3);
              });
              if (activeTab !== 'orders') {
                try {
                  const ctx = new AudioContext();
                  const osc = ctx.createOscillator();
                  const gain = ctx.createGain();
                  osc.connect(gain);
                  gain.connect(ctx.destination);
                  osc.frequency.value = 400;
                  gain.gain.value = 0.1;
                  osc.start();
                  osc.stop(ctx.currentTime + 0.4);
                } catch { /* ignore */ }
              }
            });
          });
        }
      },
    );
    return () => { EventBus.off(sub); };
  }, [activeTab]);

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

  const handleBarcodeScan = useCallback(
    async (code: string) => {
      if (!tenantId) return;
      const cleaned = code.replace(/^\]\w{1,2}\d?/, '').split('').filter((c) => c >= ' ').join('').trim();
      if (!cleaned) return;
      const result = await inventoryService.getProductBySku(cleaned, tenantId);
      if (result.ok && result.data) {
        if (result.data.isWeighted) {
          addToast({ type: 'info', message: `${result.data.name} es pesable. Agrégalo manualmente.`, duration: 3000 });
          return;
        }
        if (navigator.vibrate) {
          navigator.vibrate(100);
        }
        const presentation = await inventoryService.getPresentationByBarcode(cleaned, tenantId);
        if (presentation?.id) {
          addToCart(result.data, 1, { id: presentation.id, name: presentation.name, priceUsd: presentation.priceUsd, unitMultiplier: presentation.unitMultiplier });
        } else {
          addToCart(result.data, 1);
        }
        addToast({ type: 'success', message: `${result.data.name} agregado`, duration: 2000 });
      } else {
        addToast({ type: 'error', message: `Producto con código "${cleaned}" no encontrado.`, duration: 4000 });
      }
    },
    [tenantId, addToCart, addToast],
  );

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement || 
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const now = Date.now();
      if (now - lastKeyTime.current > SCAN_TIMEOUT_MS) {
        barcodeBuffer.current = '';
      }
      lastKeyTime.current = now;

      if (e.key === 'Enter') {
        if (barcodeBuffer.current.length > 2) {
          handleBarcodeScan(barcodeBuffer.current);
        }
        barcodeBuffer.current = '';
      } else if (e.key.length === 1) {
        if (e.key < ' ') return;
        barcodeBuffer.current += e.key;
        if (barcodeBuffer.current.length > MAX_BARCODE_LENGTH) {
          barcodeBuffer.current = '';
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleBarcodeScan]);

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
        addToast({ type: 'error', message: saleResult.error?.message || 'Error al completar la venta.', duration: 5000 });
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

  const handleWhatsAppShare = useCallback(async (mode: 'ticket' | 'text') => {
    if (!completedSale || !tenantInfo) return;
    setSharing(true);
    await new Promise((r) => setTimeout(r, 300));
    try {
      const enrichedTenantInfo = {
        ...tenantInfo,
        footerMessage: useSettingsStore.getState().ticketFooterMessage,
        ivaRate: useSettingsStore.getState().ivaRate,
        igtfRate: useSettingsStore.getState().igtfRate,
      };
      if (mode === 'text') {
        const link = receiptService.generateWhatsAppLink(
          {
            id: completedSale.saleId,
            createdAt: new Date().toISOString(),
            paymentMethod: completedSale.paymentMethod,
            exchangeRate: completedSale.exchangeRate,
            subtotalBs: completedSale.subtotalBs,
            igtfBs: 0,
            ivaBs: 0,
            totalBs: completedSale.totalBs,
            subtotalUsd: completedSale.exchangeRate > 0 ? completedSale.subtotalBs / completedSale.exchangeRate : 0,
            igtfUsd: 0,
            ivaUsd: 0,
            totalUsd: completedSale.totalUsd,
          },
          completedSale.items.map((i) => ({
            productName: i.name,
            presentationName: i.presentationName,
            quantity: i.quantity,
            unitPriceUsd: i.unitPriceUsd,
            totalPriceUsd: i.totalPriceUsd,
          })),
          completedSale.customerName ? { name: completedSale.customerName, phone: completedSale.customerPhone } : null,
          enrichedTenantInfo,
        );
        if (link) {
          window.open(link, '_blank');
        } else {
          addToast({ type: 'warning', message: 'El cliente no tiene teléfono registrado', duration: 4000 });
        }
      } else {
        const result = await receiptService.sharePdfViaWhatsApp(
          {
            id: completedSale.saleId,
            createdAt: new Date().toISOString(),
            paymentMethod: completedSale.paymentMethod,
            exchangeRate: completedSale.exchangeRate,
            subtotalBs: completedSale.subtotalBs,
            igtfBs: 0,
            ivaBs: 0,
            totalBs: completedSale.totalBs,
            subtotalUsd: completedSale.exchangeRate > 0 ? completedSale.subtotalBs / completedSale.exchangeRate : 0,
            igtfUsd: 0,
            ivaUsd: 0,
            totalUsd: completedSale.totalUsd,
          },
          completedSale.items.map((i) => ({
            productName: i.name,
            presentationName: i.presentationName,
            quantity: i.quantity,
            unitPriceUsd: i.unitPriceUsd,
            totalPriceUsd: i.totalPriceUsd,
          })),
          completedSale.customerName ? { name: completedSale.customerName, phone: completedSale.customerPhone } : null,
          enrichedTenantInfo,
        );
        if (!result.ok) {
          addToast({ type: 'warning', message: result.error.message, duration: 4000 });
        }
      }
    } catch {
      addToast({ type: 'error', message: 'Error al enviar por WhatsApp', duration: 5000 });
    } finally {
      setSharing(false);
    }
  }, [completedSale, tenantInfo, addToast]);

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
    } catch {
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
        setCashError(result.error?.message ?? 'Error al cerrar la caja.');
        return failure(result.error);
      }
      return { ok: true as const, data: undefined as void };
    },
    [tenantId, userId, closeCashRegister],
  );

  const handlePark = useCallback(() => {
    if (selectedCustomer) {
      setShowDeliveryPrompt(true);
    } else {
      openParkModal();
    }
  }, [selectedCustomer, openParkModal, setShowDeliveryPrompt]);

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
      if (ok) {
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
      const ok = await parkAsDelivery(tenantId, deliveryName, needsKitchen);
      setProcessing(false);
      if (ok) {
        setPaymentMethod(null);
        closeMobileCart();
        setParkTableNumber(null);
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
      addToast({ type: 'error', message: result.error?.message ?? 'Error al anular la venta. Verifica tu conexión e intenta de nuevo.', duration: 4000 });
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

  return (
    <div className="flex flex-row h-full w-full min-w-0">
      <div className="flex-1 min-w-0 h-full flex flex-col">
        <div className="flex items-center gap-2 px-3 pt-2 pb-1">
          <Tooltip content={isOnline ? (isOpen ? 'Haz click para cerrar.' : 'Haz click para abrir.') : 'Necesitas internet para abrir o cerrar caja'} position="bottom">
            <CashStatusBadge isOpen={isOpen} onClick={isOpen ? handleCloseCash : handleOpenCash} role={role} disabled={!isOnline} />
          </Tooltip>
          {registerName && isOpen && (
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
                        onDismiss={() => setKitchenReadyNotifs((prev) => prev.filter((x) => x.saleId !== n.saleId))}
                        onViewOrder={() => setKitchenReadyNotifs((prev) => prev.filter((x) => x.saleId !== n.saleId))}
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
              canVoid={role === 'owner' || role === 'admin'}
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

      <Modal
        isOpen={showVerifyConfirm}
        onClose={closeVerifyConfirm}
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
                {verifyCounts.sold > 0 && <> (<strong>{verifyCounts.sold}</strong> vendido{verifyCounts.sold > 1 ? 's' : ''} {isFromPreviousDay ? 'ayer' : 'hoy'}</>}
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

      <Modal
        isOpen={showPayConfirm}
        onClose={handleCancelPay}
        title="Confirmar venta"
        size="sm"
        footer={
          <div className="flex gap-2 w-full">
            <Button variant="ghost" className="flex-1" onClick={handleCancelPay}>Cancelar</Button>
            <Button variant="primary" className="flex-1" onClick={handleConfirmPay} loading={processing}>Confirmar venta</Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3 pt-2 animate-slide-down">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <ShoppingCart size={20} className="text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{formatUsd(cart.reduce((s, i) => s + i.totalPriceUsd, 0))}</p>
              <p className="text-xs text-text-secondary">{formatBs(preciseRound(cart.reduce((s, i) => s + i.totalPriceUsd, 0) * exchangeRateBs, 2))}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-surface-alt rounded-lg p-2.5">
              <p className="text-xs text-text-secondary">Productos</p>
              <p className="font-semibold text-gray-900">{cart.reduce((s, i) => s + i.quantity, 0)} unidades</p>
            </div>
            <div className="bg-surface-alt rounded-lg p-2.5">
              <p className="text-xs text-text-secondary">Método de pago</p>
              <p className="font-semibold text-gray-900">{paymentMethod ? METADATA_PAGOS[paymentMethod]?.label ?? paymentMethod : '-'}</p>
            </div>
          </div>
          {selectedCustomer && (
            <div className="flex items-center gap-2 bg-primary/5 rounded-lg p-2.5 text-sm">
              <User size={14} className="text-primary shrink-0" />
              <span className="font-medium text-gray-900 truncate">{selectedCustomer.name}</span>
              {isCreditSale && <Badge variant="warning" className="text-[10px]">Fiado</Badge>}
            </div>
          )}
        </div>
      </Modal>

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
            <p className="text-(length:--text-fluid-2xl) font-bold text-gray-900">{formatUsd(completedSale.totalUsd)}</p>
            <p className="text-sm text-text-secondary -mt-2">{formatBs(completedSale.totalBs)}</p>
            <Badge variant="success" className="text-xs">
              {METADATA_PAGOS[completedSale.paymentMethod]?.label ?? completedSale.paymentMethod}
            </Badge>

            <div className="flex flex-col gap-2 w-full pt-2">
              <Button
                variant="primary"
                fullWidth
                onClick={() => handleWhatsAppShare('ticket')}
                disabled={sharing}
                className="min-h-11"
                style={{ backgroundColor: '#25D366', borderColor: '#25D366', color: 'white' }}
              >
                <FileText size={16} />
                {sharing ? 'Enviando...' : 'Ticket por WhatsApp'}
              </Button>
              {completedSale.customerPhone && (
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => handleWhatsAppShare('text')}
                  disabled={sharing}
                  className="min-h-11"
                  style={{ backgroundColor: '#25D366', borderColor: '#25D366', color: 'white' }}
                >
                  <MessageCircle size={16} />
                  {sharing ? 'Enviando...' : 'Solo texto por WhatsApp'}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <PresentationSelector
        isOpen={selectedProductForPres !== null}
        onClose={closePresModal}
        product={selectedProductForPres}
        presentations={selectedProductForPres ? getPresentations(selectedProductForPres.id) : []}
        onSelect={async (_product, selection) => {
          const added = await addToCart(_product, 1, selection);
          if (added) {
            addToast({ type: 'success', message: `${_product.name} agregado`, duration: 1500 });
          } else {
            const error = usePosStore.getState().error;
            if (error) {
              addToast({ type: 'warning', message: error, duration: 3000 });
            }
          }
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

      <Modal
        isOpen={!!orderPayModal}
        onClose={() => setOrderPayModal(null)}
        title="Cobrar Pedido"
        size="sm"
        footer={
          <div className="flex gap-2 w-full">
            <Button variant="ghost" className="flex-1" onClick={() => setOrderPayModal(null)}>Cancelar</Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={handleConfirmPayOrder}
              disabled={!orderPayModal?.method}
              loading={processing}
            >
              Confirmar cobro
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3 pt-2 animate-slide-down">
          {orderPayModal?.sale && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <ShoppingCart size={20} className="text-primary" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{formatUsd(orderPayModal.sale.totalUsd)}</p>
                <p className="text-xs text-text-secondary">{orderPayModal.sale.orderNumber}</p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {(['efectivo_bs', 'efectivo_usd', 'pago_movil', 'transferencia', 'zelle', 'credito'] as PaymentMethod[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setOrderPayModal((prev) => prev ? { ...prev, method: m } : null)}
                className={`p-2.5 rounded-xl border text-xs font-medium transition-all min-h-11 ${
                  orderPayModal?.method === m
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-white text-gray-700 hover:border-primary/30'
                }`}
              >
                {METADATA_PAGOS[m]?.label ?? m}
              </button>
            ))}
          </div>
        </div>
      </Modal>

      {dispatchSale && (
        <DeliveryDispatchPanel
          isOpen={showDispatchPanel}
          onClose={() => { setShowDispatchPanel(false); setDispatchSale(null); }}
          sale={dispatchSale}
          customerName={dispatchCustomerName}
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
