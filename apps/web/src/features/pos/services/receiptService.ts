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
}

export type ReceiptFormat = 'ticket' | 'a4';

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
    cash: 'Efectivo',
    usd: 'USD',
    card: 'Tarjeta',
    transfer: 'Transferencia',
    credit: 'Crédito',
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
        const name = item.presentationName ? `${escapeHtml(item.productName)} - ${escapeHtml(item.presentationName)}` : escapeHtml(item.productName);
        return `<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:10pt;">
          <span>${item.quantity}x ${name}</span>
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
        ${sale.ivaUsd > 0 ? `<div style="display:flex;justify-content:space-between;"><span>IVA 16%:</span><span>${formatUsd(sale.ivaUsd)}</span></div>` : ''}
        ${sale.igtfUsd > 0 ? `<div style="display:flex;justify-content:space-between;"><span>IGTF 3%:</span><span>${formatUsd(sale.igtfUsd)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;font-weight:700;font-size:11pt;"><span>TOTAL:</span><span>${formatUsd(sale.totalUsd)}</span></div>
        ${sale.exchangeRate > 0 ? `<div style="font-size:8pt;color:#555;">Tasa: ${sale.exchangeRate.toFixed(2)} Bs/$</div>` : ''}
        ${sale.totalBs > 0 ? `<div style="display:flex;justify-content:space-between;font-weight:700;font-size:10pt;"><span>TOTAL:</span><span>${formatBs(sale.totalBs)}</span></div>` : ''}
      </div>
      <div style="text-align:center;margin-top:12px;padding-top:8px;border-top:1px dashed #999;font-size:8pt;color:#777;">
        ¡Gracias por su compra!<br/>Sasa ERP
      </div>
    </div>`;
}

function buildA4Html(sale: ReceiptSaleData, items: ReceiptItemData[], customer: ReceiptCustomerData | null, tenant: ReceiptTenantInfo): string {
  const itemsRows = items
    .map(
      (item) => {
        const name = item.presentationName ? `${escapeHtml(item.productName)} - ${escapeHtml(item.presentationName)}` : escapeHtml(item.productName);
        return `<tr>
          <td style="padding:6px 8px;border:1px solid #d0d0d0;text-align:center;width:8%;">${item.quantity}</td>
          <td style="padding:6px 8px;border:1px solid #d0d0d0;width:52%;word-wrap:break-word;">${name}</td>
          <td style="padding:6px 8px;border:1px solid #d0d0d0;text-align:right;width:20%;">${formatUsd(item.unitPriceUsd)}</td>
          <td style="padding:6px 8px;border:1px solid #d0d0d0;text-align:right;width:20%;">${formatUsd(item.totalPriceUsd)}</td>
        </tr>`;
      },
    )
    .join('');

  const logoSection = tenant.logoUrl
    ? `<img src="${escapeHtml(tenant.logoUrl)}" style="width:80px;height:80px;object-fit:contain;border-radius:6px;" />`
    : `<div style="width:80px;height:80px;border-radius:50%;background:#0D9488;color:white;display:flex;align-items:center;justify-content:center;font-size:24pt;font-weight:700;">${getInitials(tenant.name)}</div>`;

  return `
    <div style="width:210mm;font-family:'Segoe UI',Arial,Helvetica,sans-serif;padding:15mm;background:white;color:#1a1a1a;box-sizing:border-box;">
      <div style="text-align:center;margin-bottom:20px;padding-bottom:12px;border-bottom:3px solid #0D9488;">
        ${logoSection}
        <h1 style="font-size:18pt;font-weight:800;margin:8px 0 4px;color:#111;">${escapeHtml(tenant.name)}</h1>
        <div style="font-size:9pt;color:#555;">RIF: ${escapeHtml(tenant.rif)}</div>
        ${tenant.direccion ? `<div style="font-size:9pt;color:#555;">${escapeHtml(tenant.direccion)}</div>` : ''}
        ${tenant.telefono ? `<div style="font-size:9pt;color:#555;">Tel: ${escapeHtml(tenant.telefono)}</div>` : ''}
      </div>

      <div style="text-align:center;margin-bottom:16px;">
        <h2 style="font-size:14pt;font-weight:700;margin:0;color:#0D9488;">FACTURA / NOTA DE VENTA</h2>
      </div>

      <div style="display:flex;justify-content:space-between;margin-bottom:16px;font-size:9pt;">
        <div>
          <div><strong>Factura:</strong> #${sale.id.slice(0, 8)}</div>
          <div><strong>Fecha:</strong> ${formatDate(sale.createdAt)} ${formatTime(sale.createdAt)}</div>
        </div>
        <div style="text-align:right;">
          <div><strong>Método:</strong> ${getPaymentLabel(sale.paymentMethod)}</div>
          ${customer ? `<div><strong>Cliente:</strong> ${escapeHtml(customer.name)}</div>` : ''}
        </div>
      </div>

      <table style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:9pt;margin-bottom:16px;">
        <colgroup>
          <col style="width:8%;" />
          <col style="width:52%;" />
          <col style="width:20%;" />
          <col style="width:20%;" />
        </colgroup>
        <thead>
          <tr>
            <th style="background:#0D9488;color:white;padding:6px 8px;border:1px solid #0F766E;text-align:center;font-size:8pt;">Cant</th>
            <th style="background:#0D9488;color:white;padding:6px 8px;border:1px solid #0F766E;text-align:left;font-size:8pt;">Descripción</th>
            <th style="background:#0D9488;color:white;padding:6px 8px;border:1px solid #0F766E;text-align:right;font-size:8pt;">P. Unit</th>
            <th style="background:#0D9488;color:white;padding:6px 8px;border:1px solid #0F766E;text-align:right;font-size:8pt;">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>

      <div style="display:flex;justify-content:flex-end;">
        <div style="width:250px;font-size:9pt;">
          <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Subtotal:</span><span>${formatUsd(sale.subtotalUsd)}</span></div>
          ${sale.ivaUsd > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;"><span>IVA 16%:</span><span>${formatUsd(sale.ivaUsd)}</span></div>` : ''}
          ${sale.igtfUsd > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;"><span>IGTF 3%:</span><span>${formatUsd(sale.igtfUsd)}</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-top:2px solid #0D9488;font-weight:700;font-size:12pt;"><span>TOTAL USD:</span><span>${formatUsd(sale.totalUsd)}</span></div>
          ${sale.exchangeRate > 0 ? `<div style="font-size:8pt;color:#555;text-align:right;">Tasa: ${sale.exchangeRate.toFixed(2)} Bs/$</div>` : ''}
          ${sale.totalBs > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;font-weight:700;font-size:11pt;"><span>TOTAL Bs:</span><span>${formatBs(sale.totalBs)}</span></div>` : ''}
        </div>
      </div>

      <div style="text-align:center;margin-top:24px;padding-top:12px;border-top:2px solid #e0e0e0;font-size:8pt;color:#999;">
        ¡Gracias por su compra! — Sasa ERP
      </div>
    </div>`;
}

async function renderAndDownload(
  html: string,
  fileName: string,
  format: ReceiptFormat,
): Promise<Result<void, AppError>> {
  const widthMm = format === 'ticket' ? '80mm' : '210mm';

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
    container.style.left = '0';
    container.style.top = '0';
    container.style.zIndex = '9999';

    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 150));

    const element = (container.firstElementChild || container) as HTMLElement;
    const html2pdf = (await import('html2pdf.js')).default;
    const opt = {
      margin: format === 'ticket' ? [2, 2, 2, 2] as [number, number, number, number] : [10, 10, 10, 10] as [number, number, number, number],
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
        format: format === 'ticket' ? [80, 297] as [number, number] : 'a4' as const,
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

export const receiptService = {
  async generatePdf(
    sale: ReceiptSaleData,
    items: ReceiptItemData[],
    customer: ReceiptCustomerData | null,
    tenantInfo: ReceiptTenantInfo,
    format: ReceiptFormat,
  ): Promise<Result<void, AppError>> {
    const html = format === 'ticket'
      ? buildTicketHtml(sale, items, customer, tenantInfo)
      : buildA4Html(sale, items, customer, tenantInfo);
    const fileName = `Sasa-${format === 'ticket' ? 'Ticket' : 'Factura'}-${sale.id.slice(0, 8)}.pdf`;
    return renderAndDownload(html, fileName, format);
  },

  generateWhatsAppLink(
    sale: ReceiptSaleData,
    items: ReceiptItemData[],
    customer: ReceiptCustomerData | null,
    tenantInfo: ReceiptTenantInfo,
  ): string | null {
    if (!customer?.phone || typeof customer.phone !== 'string') return null;
    const digits = customer.phone.replace(/[^0-9]/g, '');
    const waPhone = digits.startsWith('58') ? digits
      : digits.startsWith('0') ? `58${digits.slice(1)}`
        : `58${digits}`;

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
      const name = item.presentationName ? `${item.productName} - ${item.presentationName}` : item.productName;
      lines.push(`${item.quantity}x ${name}  ${formatUsd(item.totalPriceUsd)}`);
    }

    lines.push('');
    lines.push(`Total: ${formatUsd(sale.totalUsd)}`);
    if (sale.totalBs > 0) {
      lines.push(`Total: ${formatBs(sale.totalBs)}`);
    }
    lines.push('');
    lines.push('¡Gracias por su compra!');

    const text = encodeURIComponent(lines.join('\n'));
    return `https://wa.me/${waPhone}?text=${text}`;
  },
};
