import { useCallback } from 'react';
import { Button, EmptyState, Modal } from '../../../common/components';
import { ShoppingCart } from 'lucide-react';
import { CartItemRow } from './CartItem';
import { CartSummary } from './CartSummary';
import type { CartItem, PaymentMethod } from '../types';

interface CartPanelProps {
  cart: CartItem[];
  exchangeRateBs: number;
  paymentMethod: PaymentMethod | null;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  onRemoveFromCart: (productId: string) => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onPay: () => void;
  onPark: () => void;
  isOpen: boolean;
  loading: boolean;
  isMobileOpen: boolean;
  itemCount: number;
  onMobileToggle: () => void;
}

export function CartPanel({
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
}: CartPanelProps) {
  const renderContent = useCallback(
    () => (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2 border-b border-border">
          <h3 className="text-sm font-semibold text-gray-700">Carrito ({itemCount})</h3>
        </div>

        <div className="flex-1 overflow-y-auto px-3">
          {cart.length === 0 ? (
            <div className="py-8">
              <EmptyState
                icon={<ShoppingCart size={32} />}
                title="Carrito vacío"
                description="Toca un producto para agregarlo."
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
          <div className="px-3 pb-3">
            <CartSummary
              items={cart}
              exchangeRateBs={exchangeRateBs}
              paymentMethod={paymentMethod}
              onPaymentMethodChange={onPaymentMethodChange}
              onPay={onPay}
              onPark={onPark}
              isOpen={isOpen}
              loading={loading}
            />
          </div>
        )}
      </div>
    ),
    [cart, exchangeRateBs, paymentMethod, onPaymentMethodChange, onRemoveFromCart, onUpdateQuantity, onPay, isOpen, loading, itemCount],
  );

  return (
    <>
      {/* Desktop: fixed sidebar */}
      <div className="hidden md:flex w-96 shrink-0 h-full border-l border-border bg-white flex-col overflow-hidden">
        {renderContent()}
      </div>

      {/* Mobile: floating button */}
      <div className="md:hidden">
        <Button
          variant={cart.length > 0 ? 'primary' : 'secondary'}
          size="lg"
          className="fixed bottom-4 right-4 z-40 shadow-lg rounded-full px-4"
          onClick={onMobileToggle}
        >
          <ShoppingCart size={20} />
          {cart.length > 0 && (
            <span className="ml-1 font-bold">{itemCount}</span>
          )}
        </Button>

        <Modal
          isOpen={isMobileOpen}
          onClose={onMobileToggle}
          title={`Carrito (${itemCount})`}
          size="full"
          className="pb-safe"
        >
          <div className="pb-4" style={{ paddingBottom: 'env(safe-area-inset-bottom, 1rem)' }}>
            {renderContent()}
          </div>
        </Modal>
      </div>
    </>
  );
}
