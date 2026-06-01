import { describe, it, expect, beforeEach } from 'vitest';
import { usePosStore } from '../stores/posStore';
import type { Product } from '../../../specs/inventory';

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Test Product',
  sku: 'T1',
  priceUsd: 10,
  stock: 100,
  isWeighted: false,
  isTaxable: true,
  isSellable: true,
  unit: 'unidad',
  ...overrides,
});

describe('posStore', () => {
  beforeEach(() => {
    usePosStore.getState().reset();
  });

  it('should start with empty cart', () => {
    const { cart } = usePosStore.getState();
    expect(cart).toEqual([]);
  });

  it('should add item to cart', () => {
    usePosStore.getState().addToCart(makeProduct(), 2);
    const { cart } = usePosStore.getState();
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(2);
  });

  it('should update cart item quantity', () => {
    usePosStore.getState().addToCart(makeProduct(), 1);
    usePosStore.getState().updateCartItemQuantity('00000000-0000-0000-0000-000000000001', 5);
    const { cart } = usePosStore.getState();
    expect(cart[0].quantity).toBe(5);
  });

  it('should remove from cart', () => {
    usePosStore.getState().addToCart(makeProduct(), 1);
    usePosStore.getState().removeFromCart('00000000-0000-0000-0000-000000000001');
    const { cart } = usePosStore.getState();
    expect(cart).toEqual([]);
  });

  it('should clear cart', () => {
    usePosStore.getState().addToCart(makeProduct(), 3);
    usePosStore.getState().clearCart();
    const { cart } = usePosStore.getState();
    expect(cart).toEqual([]);
  });

  it('should set discount', () => {
    usePosStore.getState().setDiscount('percentage', 10);
    const { discount } = usePosStore.getState();
    expect(discount).toEqual({ type: 'percentage', value: 10 });
  });

  it('should reject percentage discount > 100', () => {
    usePosStore.getState().setDiscount('percentage', 150);
    const { discount } = usePosStore.getState();
    expect(discount).toBeNull();
  });

  it('should reject percentage discount <= 0', () => {
    usePosStore.getState().setDiscount('percentage', 0);
    const { discount } = usePosStore.getState();
    expect(discount).toBeNull();
  });

  it('should reject fixed discount exceeding cart subtotal', () => {
    usePosStore.getState().setDiscount('fixed', 50);
    const { discount } = usePosStore.getState();
    expect(discount).toBeNull();
  });

  it('should clear discount', () => {
    usePosStore.getState().setDiscount('percentage', 10);
    usePosStore.getState().clearDiscount();
    const { discount } = usePosStore.getState();
    expect(discount).toBeNull();
  });

  it('should reset to initial state', () => {
    usePosStore.getState().addToCart(makeProduct(), 2);
    usePosStore.getState().setDiscount('percentage', 10);
    usePosStore.getState().reset();
    const { cart, discount, cashRegister } = usePosStore.getState();
    expect(cart).toEqual([]);
    expect(discount).toBeNull();
    expect(cashRegister).toBeNull();
  });

  it('should not add item exceeding stock', () => {
    usePosStore.getState().addToCart(makeProduct({ stock: 5 }), 10);
    const { cart, error } = usePosStore.getState();
    expect(cart).toHaveLength(0);
    expect(error).toBeTruthy();
  });

  it('should accumulate quantity for same product', () => {
    usePosStore.getState().addToCart(makeProduct(), 2);
    usePosStore.getState().addToCart(makeProduct(), 3);
    const { cart } = usePosStore.getState();
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(5);
  });
});
