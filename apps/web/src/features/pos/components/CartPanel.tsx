import { useCallback, memo } from 'react';
import { Button, EmptyState, Modal } from '../../../common/components';
import { ShoppingCart } from 'lucide-react';
import { CartItemRow } from './CartItem';
import { CartSummary } from './CartSummary';
import { usePosStore } from '../stores/posStore';
import type { CartItem, PaymentMethod } from '../types';

interface CartPanelProps {
  cart: CartItem[];
  exchangeRateBs: number;
  paymentMethod: PaymentMethod | null;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  onRemoveFromCart: (productId: string, presentationId?: string) => void;
  onUpdateQuantity: (productId: string, quantity: number, presentationId?: string) => void;
  onPay: () => void;
  onPark: () => void;
  isOpen: boolean;
  loading: boolean;
  isMobileOpen: boolean;
  itemCount: number;
  onMobileToggle: () => void;
  selectedCustomer?: { id: string; name: string; cedula?: string; phone?: string; address?: string; creditLimit: number; balance: number; notes?: string; createdAt: string; updatedAt: string; deletedAt?: string } | null;
  onSelectCustomer?: () => void;
  isCreditSale: boolean;
  onSetIsCreditSale: (isCredit: boolean) => void;
  onClearCustomer?: () => void;
}

export const CartPanel = memo(function CartPanel({
  cart,
  exchangeRateBs,
  paymentMethod,
  onPaymentMethodChange,
  onRemoveFromCart,
  onUpdateQuantity,
  onPay,
  onPark,
  isOpen,
  loading,
  isMobileOpen,
  itemCount,
  onMobileToggle,
  selectedCustomer,
  onSelectCustomer,
  onClearCustomer,
  isCreditSale,
  onSetIsCreditSale,
}: CartPanelProps) {
  const discount = usePosStore((s) => s.discount);
  const setDiscount = usePosStore((s) => s.setDiscount);
  const clearDiscount = usePosStore((s) => s.clearDiscount);

  const renderContent = useCallback(
    () => (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="hidden md:block px-3 py-2 border-b border-border">
          <h3 className="text-sm font-semibold text-gray-700">Carrito ({itemCount})</h3>
        </div>

        <div className="flex-1 overflow-y-auto px-3">
          {cart.length === 0 ? (
            <div className="py-8">
              <EmptyState
                icon={
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" strokeDasharray="4 2" />
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <path d="M16 10a4 4 0 01-8 0" />
                  </svg>
                }
                title="Carrito vacío"
                description="Selecciona productos para agregar al carrito."
              />
            </div>
          ) : (
            cart.map((item) => (
              <CartItemRow
                key={item.productId}
                item={item}
                onRemove={onRemoveFromCart}
                onUpdateQuantity={onUpdateQuantity}
              />
            ))
          )}
        </div>

        {cart.length > 0 && (
          <div className="px-3 pb-3 shrink-0">
            <CartSummary
              items={cart}
              exchangeRateBs={exchangeRateBs}
              paymentMethod={paymentMethod}
              onPaymentMethodChange={onPaymentMethodChange}
              onPay={onPay}
              onPark={onPark}
              isOpen={isOpen}
              loading={loading}
              discount={discount}
              onSetDiscount={setDiscount}
              onClearDiscount={clearDiscount}
              selectedCustomer={selectedCustomer ?? null}
              onSelectCustomer={onSelectCustomer ?? (() => {})}
              onClearCustomer={onClearCustomer ?? (() => {})}
              isCreditSale={isCreditSale}
              onSetIsCreditSale={onSetIsCreditSale}
            />
          </div>
        )}
      </div>
    ),
    [cart, exchangeRateBs, paymentMethod, onPaymentMethodChange, onRemoveFromCart, onUpdateQuantity, onPay, isOpen, loading, itemCount, discount, setDiscount, clearDiscount, selectedCustomer, onSelectCustomer, isCreditSale, onSetIsCreditSale],
  );

  return (
    <>
      {/* Desktop: fixed sidebar */}
      <div className="hidden md:flex w-80 xl:w-96 shrink-0 h-full border-l border-border bg-white flex-col overflow-hidden animate-slide-in-right">
        {renderContent()}
      </div>

      {/* Mobile: floating button */}
      <div className="md:hidden">
        <Button
          variant={cart.length > 0 ? 'primary' : 'secondary'}
          size="lg"
          className="fixed bottom-20 right-4 z-40 shadow-lg rounded-full px-4"
          onClick={onMobileToggle}
        >
          <ShoppingCart size={20} />
          {cart.length > 0 && (
            <>
              <span className={`ml-1 font-bold ${cart.length > 0 ? 'animate-badge-bounce' : ''}`}>{itemCount}</span>
              <span className="ml-1 text-xs opacity-80">
                ${cart.reduce((sum, item) => sum + item.totalPriceUsd, 0).toFixed(2)}
              </span>
            </>
          )}
        </Button>

        <Modal
          isOpen={isMobileOpen}
          onClose={onMobileToggle}
          title={`Carrito (${itemCount})`}
          className="max-w-none! m-0! modal-cart"
        >
          {renderContent()}
        </Modal>
      </div>
    </>
  );
});
