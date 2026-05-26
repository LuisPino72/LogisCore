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
}: CartPanelProps) {
  const discount = usePosStore((s) => s.discount);
  const setDiscount = usePosStore((s) => s.setDiscount);
  const clearDiscount = usePosStore((s) => s.clearDiscount);

  const renderContent = useCallback(
    () => (
      <div className="flex flex-col h-full">
        <div className="hidden md:block px-3 py-2 border-b border-border">
          <h3 className="text-sm font-semibold text-gray-700">Carrito ({itemCount})</h3>
        </div>

        <div className="flex-1 overflow-y-auto px-3">
          {cart.length === 0 ? (
            <div className="py-8">
              <EmptyState
                icon={<ShoppingCart size={32} />}
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
              discount={discount}
              onSetDiscount={setDiscount}
              onClearDiscount={clearDiscount}
            />
          </div>
        )}
      </div>
    ),
    [cart, exchangeRateBs, paymentMethod, onPaymentMethodChange, onRemoveFromCart, onUpdateQuantity, onPay, isOpen, loading, itemCount, discount, setDiscount, clearDiscount],
  );

  return (
    <>
      {/* Desktop: fixed sidebar */}
      <div className="hidden md:flex w-80 xl:w-96 shrink-0 h-full border-l border-border bg-white flex-col overflow-hidden">
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
            <span className="ml-1 font-bold">{itemCount}</span>
          )}
        </Button>

        <Modal
          isOpen={isMobileOpen}
          onClose={onMobileToggle}
          title={`Carrito (${itemCount})`}
          className="max-w-none! m-0! modal-cart"
        >
          <div className="flex flex-col h-dvh">
            <div className="flex-1 overflow-y-auto">
              {renderContent()}
            </div>
          </div>
        </Modal>
      </div>
    </>
  );
});
