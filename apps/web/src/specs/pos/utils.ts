import { preciseRound, IGTF_RATE, IVA_RATE } from '@logiscore/shared';

interface CartItemInput {
  unitPriceUsd: number;
  quantity: number;
  isTaxable?: boolean;
}

export interface SaleTotals {
  subtotalUsd: number;
  subtotalBs: number;
  igtfBs: number;
  ivaBase: number;
  discountBs: number;
  discountUsd: number;
  ivaBs: number;
  ivaUsd: number;
  totalBs: number;
  totalUsd: number;
}

export function calculateSaleTotals(
  items: CartItemInput[],
  exchangeRateBs: number,
  paymentMethod: string,
  discount: { type: 'percentage' | 'fixed'; value: number } | null,
): SaleTotals {
  // AUDIT-FLOW-10-010B: subtotalUsd redondeado a 2 decimales (Regla #6).
  const subtotalUsd = preciseRound(
    items.reduce((sum, item) => sum + item.unitPriceUsd * item.quantity, 0),
    2,
  );
  const subtotalBs = exchangeRateBs > 0 ? preciseRound(subtotalUsd * exchangeRateBs, 2) : 0;

  const igtfBs = paymentMethod === 'efectivo_usd' && IGTF_RATE > 0
    ? preciseRound(subtotalBs * IGTF_RATE, 2)
    : 0;

  // AUDIT-FLOW-10-010C: subtotalTaxableBs redondeado en cada iteración (Regla #6).
  const subtotalTaxableBs = items.reduce((sum, item) => {
    if (item.isTaxable === false) return sum;
    return preciseRound(sum + item.unitPriceUsd * item.quantity * exchangeRateBs, 2);
  }, 0);

  let discountBs = 0;
  let discountUsd = 0;
  let ivaBase = subtotalTaxableBs;

  if (discount) {
    if (discount.type === 'percentage') {
      const pct = Math.min(discount.value, 100);
      discountBs = preciseRound(subtotalBs * pct / 100, 2);
      const taxableDiscount = preciseRound(subtotalTaxableBs * pct / 100, 2);
      ivaBase = subtotalTaxableBs - taxableDiscount;
    } else {
      discountBs = preciseRound(discount.value * exchangeRateBs, 2);
      if (subtotalBs > 0) {
        const taxableRatio = subtotalTaxableBs / subtotalBs;
        const taxableDiscount = preciseRound(discountBs * taxableRatio, 2);
        ivaBase = subtotalTaxableBs - taxableDiscount;
      }
    }
    discountBs = Math.min(discountBs, subtotalBs);
    ivaBase = Math.max(0, ivaBase);
    discountUsd = exchangeRateBs > 0 ? preciseRound(discountBs / exchangeRateBs, 2) : 0;
  }

  const ivaBs = preciseRound(ivaBase * IVA_RATE, 2);
  const ivaUsd = exchangeRateBs > 0 ? preciseRound(ivaBs / exchangeRateBs, 2) : 0;
  const totalBs = preciseRound(subtotalBs + igtfBs + ivaBs - discountBs, 2);
  const totalUsd = exchangeRateBs > 0 ? preciseRound(totalBs / exchangeRateBs, 2) : (subtotalUsd - discountUsd);

  return { subtotalUsd, subtotalBs, igtfBs, ivaBase, discountBs, discountUsd, ivaBs, ivaUsd, totalBs, totalUsd };
}
