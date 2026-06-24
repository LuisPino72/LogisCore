import { type Result, success, failure, AppError } from '@logiscore/core';
import { formatBs, formatUsd } from '@/lib/formatBs';
import { logger } from '../../../lib/logger';

const RECEIPT_TIMEOUT = 15000;

export interface ReceiptSaleData {
  id: string;
  createdAt: string;
  paymentMethod: string;
  exchangeRate: number;
  subtotalBs: number;
  igtfBs: number;
  ivaBs: number;
  totalBs: number;
  subtotalUsd: number;
  igtfUsd: number;
  ivaUsd: number;
  totalUsd: number;
}

export interface ReceiptItemData {
  productName: string;
  presentationName?: string;
  quantity: number;
  unitPriceUsd: number;
  totalPriceUsd: number;
}

export interface ReceiptCustomerData {
  name: string;
  phone?: string;
  cedula?: string;
}

export interface ReceiptTenantInfo {
  name: string;
  rif: string;
  direccion?: string;
  telefono?: string;
  logoUrl?: string;
  footerMessage?: string;
  ivaRate?: number;
  igtfRate?: number;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
}

function getPaymentLabel(method: string): string {
  const labels: Record<string, string> = {
    efectivo_bs: 'Efectivo',
    pago_movil: 'Pago Móvil',
    tarjeta_bs: 'Tarjeta',
    efectivo_usd: 'Efectivo $',
    credito: 'A crédito',
  };
  return labels[method] ?? method;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildTicketHtml(sale: ReceiptSaleData, items: ReceiptItemData[], customer: ReceiptCustomerData | null, tenant: ReceiptTenantInfo): string {
  const itemsHtml = items
    .map(
      (item) => {
        const displayName = item.presentationName
          ? `${escapeHtml(item.productName)} - ${escapeHtml(item.presentationName)}`
          : escapeHtml(item.productName);
        return `<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:10pt;">
          <span>${item.quantity}x ${displayName}</span>
          <span>${formatUsd(item.totalPriceUsd)}</span>
        </div>`;
      },
    )
    .join('');

  const logoSection = tenant.logoUrl
    ? `<img src="${escapeHtml(tenant.logoUrl)}" style="width:60px;height:60px;object-fit:contain;border-radius:4px;" />`
    : `<div style="width:60px;height:60px;border-radius:50%;background:#0D9488;color:white;display:flex;align-items:center;justify-content:center;font-size:18pt;font-weight:700;">${getInitials(tenant.name)}</div>`;

  const customerSection = customer
    ? `<div style="padding:4px 0;font-size:9pt;">Cliente: ${escapeHtml(customer.name)}</div>`
    : '';

  return `
    <div style="width:80mm;font-family:'Courier New',monospace;padding:4mm;background:white;color:#111;">
      <div style="text-align:center;margin-bottom:8px;">
        ${logoSection}
        <div style="font-size:12pt;font-weight:700;margin-top:4px;">${escapeHtml(tenant.name)}</div>
        <div style="font-size:8pt;color:#555;">RIF: ${escapeHtml(tenant.rif)}</div>
        ${tenant.direccion ? `<div style="font-size:8pt;color:#555;">${escapeHtml(tenant.direccion)}</div>` : ''}
        ${tenant.telefono ? `<div style="font-size:8pt;color:#555;">Tel: ${escapeHtml(tenant.telefono)}</div>` : ''}
      </div>
      <div style="border-top:1px dashed #999;margin:8px 0;padding-top:6px;font-size:8pt;">
        <div>Factura: #${sale.id.slice(0, 8)}</div>
        <div>Fecha: ${formatDate(sale.createdAt)} ${formatTime(sale.createdAt)}</div>
        ${customerSection}
        <div>Método: ${getPaymentLabel(sale.paymentMethod)}</div>
      </div>
      <div style="border-top:1px dashed #999;margin:8px 0;padding-top:6px;">
        ${itemsHtml}
      </div>
      <div style="border-top:1px dashed #999;margin:8px 0;padding-top:6px;font-size:9pt;">
        <div style="display:flex;justify-content:space-between;"><span>Subtotal:</span><span>${formatUsd(sale.subtotalUsd)}</span></div>
        ${sale.ivaUsd > 0 ? `<div style="display:flex;justify-content:space-between;"><span>IVA ${((tenant.ivaRate ?? 0.16) * 100).toFixed(0)}%:</span><span>${formatUsd(sale.ivaUsd)}</span></div>` : ''}
        ${sale.igtfUsd > 0 ? `<div style="display:flex;justify-content:space-between;"><span>IGTF ${((tenant.igtfRate ?? 0.03) * 100).toFixed(0)}%:</span><span>${formatUsd(sale.igtfUsd)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;font-weight:700;font-size:11pt;"><span>TOTAL:</span><span>${formatUsd(sale.totalUsd)}</span></div>
        ${sale.exchangeRate > 0 ? `<div style="font-size:8pt;color:#555;">Tasa: ${sale.exchangeRate.toFixed(2)} Bs/$</div>` : ''}
        ${sale.totalBs > 0 ? `<div style="display:flex;justify-content:space-between;font-weight:700;font-size:10pt;"><span>TOTAL:</span><span>${formatBs(sale.totalBs)}</span></div>` : ''}
      </div>
      <div style="text-align:center;margin-top:12px;padding-top:8px;border-top:1px dashed #999;font-size:8pt;color:#777;">
        ${escapeHtml(tenant.footerMessage || '¡Gracias por su compra!')}<br/>Sasa ERP
      </div>
    </div>`;
}

async function renderAndDownload(
  html: string,
  fileName: string,
): Promise<Result<void, AppError>> {
  const widthMm = '80mm';

  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.top = '0';
  container.style.left = '-10000px';
  container.style.width = widthMm;
  container.style.visibility = 'visible';
  container.style.opacity = '1';
  container.style.pointerEvents = 'none';
  container.innerHTML = html;
  document.body.appendChild(container);

  const originalStyles = {
    position: container.style.position,
    left: container.style.left,
    top: container.style.top,
    zIndex: container.style.zIndex,
  };

  try {
    container.style.position = 'fixed';
    container.style.left = '-99999px';
    container.style.top = '-99999px';
    container.style.zIndex = '-1';

    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 150));

    const element = (container.firstElementChild || container) as HTMLElement;
    const html2pdf = (await import('html2pdf.js')).default;
    const opt = {
      margin: [2, 2, 2, 2] as [number, number, number, number],
      filename: fileName,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        letterRendering: true,
        backgroundColor: '#ffffff',
      },
      jsPDF: {
        unit: 'mm' as const,
        format: [80, 297] as [number, number],
        orientation: 'portrait' as const,
      },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    };

    const task = html2pdf().set(opt).from(element).save();
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('PDF_TIMEOUT')), RECEIPT_TIMEOUT),
    );
    await Promise.race([task, timeout]);
    return success(undefined);
  } catch (err) {
    logger.error('receiptService', 'PDF generation error:', err);
    if (err instanceof Error && err.message === 'PDF_TIMEOUT') {
      return failure(new AppError('RECEIPT_GENERATION_TIMEOUT', 'La generación está tardando mucho. Intenta desde un dispositivo más rápido.'));
    }
    return failure(new AppError('RECEIPT_GENERATION_FAILED', 'Error al generar el PDF. Intenta nuevamente.'));
  } finally {
    container.style.position = originalStyles.position;
    container.style.left = originalStyles.left;
    container.style.top = originalStyles.top;
    container.style.zIndex = originalStyles.zIndex;
    document.body.removeChild(container);
  }
}

function buildWhatsAppText(
  sale: ReceiptSaleData,
  items: ReceiptItemData[],
  tenantInfo: ReceiptTenantInfo,
): string {
  const lines = [
    `*${tenantInfo.name}*`,
    `RIF: ${tenantInfo.rif}`,
    '',
    `Factura: #${sale.id.slice(0, 8)}`,
    `Fecha: ${formatDate(sale.createdAt)} ${formatTime(sale.createdAt)}`,
    `Método: ${getPaymentLabel(sale.paymentMethod)}`,
    '',
    '--- Productos ---',
  ];

  for (const item of items) {
    const name = item.productName;
    lines.push(`${item.quantity}x ${name}  ${formatUsd(item.totalPriceUsd)}`);
  }

  lines.push('');
  lines.push(`Total: ${formatUsd(sale.totalUsd)}`);
  if (sale.totalBs > 0) {
    lines.push(`Total: ${formatBs(sale.totalBs)}`);
  }
  lines.push('');
  lines.push(tenantInfo.footerMessage || '¡Gracias por su compra!');

  return lines.join('\n');
}

function normalizeWaPhone(phone: string): string | null {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/[^0-9]/g, '');
  if (!digits) return null;
  return digits.startsWith('58') ? digits
    : digits.startsWith('0') ? `58${digits.slice(1)}`
      : `58${digits}`;
}

async function renderToBlob(
  html: string,
): Promise<Blob> {
  const widthMm = '80mm';

  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.top = '0';
  container.style.left = '-10000px';
  container.style.width = widthMm;
  container.style.visibility = 'visible';
  container.style.opacity = '1';
  container.style.pointerEvents = 'none';
  container.innerHTML = html;
  document.body.appendChild(container);

  const originalStyles = {
    position: container.style.position,
    left: container.style.left,
    top: container.style.top,
    zIndex: container.style.zIndex,
  };

  try {
    container.style.position = 'fixed';
    container.style.left = '-99999px';
    container.style.top = '-99999px';
    container.style.zIndex = '-1';

    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 150));

    const element = (container.firstElementChild || container) as HTMLElement;
    const html2pdf = (await import('html2pdf.js')).default;
    const opt = {
      margin: [2, 2, 2, 2] as [number, number, number, number],
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        letterRendering: true,
        backgroundColor: '#ffffff',
      },
      jsPDF: {
        unit: 'mm' as const,
        format: [80, 297] as [number, number],
        orientation: 'portrait' as const,
      },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    };

    const task = html2pdf().set(opt).from(element).outputPdf('blob');
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('PDF_TIMEOUT')), RECEIPT_TIMEOUT),
    );
    return await Promise.race([task, timeout]);
  } finally {
    container.style.position = originalStyles.position;
    container.style.left = originalStyles.left;
    container.style.top = originalStyles.top;
    container.style.zIndex = originalStyles.zIndex;
    document.body.removeChild(container);
  }
}

export const receiptService = {
  async generatePdf(
    sale: ReceiptSaleData,
    items: ReceiptItemData[],
    customer: ReceiptCustomerData | null,
    tenantInfo: ReceiptTenantInfo,
  ): Promise<Result<void, AppError>> {
    const html = buildTicketHtml(sale, items, customer, tenantInfo);
    const fileName = `Sasa-Ticket-${sale.id.slice(0, 8)}.pdf`;
    return renderAndDownload(html, fileName);
  },

  generateWhatsAppLink(
    sale: ReceiptSaleData,
    items: ReceiptItemData[],
    customer: ReceiptCustomerData | null,
    tenantInfo: ReceiptTenantInfo,
  ): string | null {
    const waPhone = normalizeWaPhone(customer?.phone ?? '');
    if (!waPhone) return null;
    const text = encodeURIComponent(buildWhatsAppText(sale, items, tenantInfo));
    return `https://wa.me/${waPhone}?text=${text}`;
  },

  async sharePdfViaWhatsApp(
    sale: ReceiptSaleData,
    items: ReceiptItemData[],
    customer: ReceiptCustomerData | null,
    tenantInfo: ReceiptTenantInfo,
  ): Promise<Result<void, AppError>> {
    const waPhone = normalizeWaPhone(customer?.phone ?? '');
    if (!waPhone) {
      return failure(new AppError('NO_PHONE', 'El cliente no tiene teléfono registrado'));
    }

    try {
      const html = buildTicketHtml(sale, items, customer, tenantInfo);
      const fileName = `Sasa-Ticket-${sale.id.slice(0, 8)}.pdf`;

      const blob = await renderToBlob(html);
      const file = new File([blob], fileName, { type: 'application/pdf' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: fileName,
        });
        return success(undefined);
      }

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);

      const text = encodeURIComponent(
        `📄 *${fileName}* descargado. Adjúntalo en este chat para enviárselo al cliente.\n\n${buildWhatsAppText(sale, items, tenantInfo)}`,
      );
      window.open(`https://wa.me/${waPhone}?text=${text}`, '_blank');
      return success(undefined);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return success(undefined);
      }
      logger.error('receiptService', 'WhatsApp share error:', err);
      return failure(new AppError('WHATSAPP_SHARE_FAILED', 'Error al compartir. Intenta nuevamente.'));
    }
  },
};
