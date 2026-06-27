import { useState, useCallback } from 'react';
import { receiptService } from '../services/receiptService';
import { useSettingsStore } from '../../settings/stores/settingsStore';
import { logger } from '../../../lib/logger';
import type { CompletedSaleData, TenantInfo } from '../types';

export function useWhatsAppShare() {
  const [sharing, setSharing] = useState(false);

  const handleWhatsAppShare = useCallback(async (mode: 'ticket' | 'text', completedSale: CompletedSaleData | null, tenantInfo: TenantInfo | null) => {
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
          const win = window.open(link, '_blank');
          if (!win || win.closed) {
            logger.warn('useWhatsAppShare', 'Popup bloqueado por el navegador');
            // Toast warning handled by caller
          }
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
          // error handled via callback
        }
      }
    } catch (err) {
      logger.error('POS', 'Error al compartir por WhatsApp', err);
    } finally {
      setSharing(false);
    }
  }, []);

  return { sharing, handleWhatsAppShare };
}
