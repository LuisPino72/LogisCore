import { TenantTranslator } from '../../../services/tenantTranslator';
import { formatBs, formatUsd } from '@/lib/formatBs';

interface TicketItem {
  name: string;
  quantity: number;
  unitPriceUsd: number;
  totalPriceUsd: number;
  presentationName?: string;
  unit?: string;
}

interface TicketData {
  saleId: string;
  items: TicketItem[];
  subtotalBs: number;
  ivaBs: number;
  igtfBs: number;
  discountBs?: number;
  totalBs: number;
  totalUsd: number;
  paymentMethod: string;
  exchangeRate: number;
  createdAt: string;
}

function getPaymentLabel(method: string): string {
  const labels: Record<string, string> = {
    efectivo_bs: 'Efectivo Bs',
    pago_movil: 'Pago Móvil',
    tarjeta_bs: 'Tarjeta',
    efectivo_usd: 'Efectivo $',
  };
  return labels[method] ?? method;
}

function buildTicketHtml(data: TicketData, tenantName: string): string {
  const fecha = new Date(data.createdAt).toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const itemsHtml = data.items
    .map(
      (item) => `
      <tr>
        <td style="padding:4px 0;font-size:13px;">${item.quantity}x ${item.name}</td>
        <td style="padding:4px 0;font-size:13px;text-align:right;">${formatUsd(item.totalPriceUsd)}</td>
      </tr>`
    )
    .join('');

  return `
    <div style="font-family:monospace;width:300px;padding:16px;color:#111;">
      <div style="text-align:center;margin-bottom:12px;">
        <div style="font-size:18px;font-weight:bold;">${tenantName}</div>
        <div style="font-size:11px;color:#666;">Ticket de Venta</div>
      </div>

      <div style="border-top:1px dashed #ccc;padding-top:8px;margin-top:8px;">
        <div style="font-size:11px;color:#666;">Fecha: ${fecha}</div>
        <div style="font-size:11px;color:#666;">Ticket #: ${data.saleId.slice(0, 8).toUpperCase()}</div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-top:12px;">
        <thead>
          <tr style="border-bottom:1px dashed #ccc;">
            <th style="text-align:left;font-size:11px;color:#666;padding:4px 0;">Producto</th>
            <th style="text-align:right;font-size:11px;color:#666;padding:4px 0;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div style="border-top:1px dashed #ccc;margin-top:8px;padding-top:8px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;">
          <span>Subtotal</span>
          <span>${formatBs(data.subtotalBs)}</span>
        </div>
        ${data.ivaBs > 0 ? `
        <div style="display:flex;justify-content:space-between;font-size:12px;">
          <span>IVA (16%)</span>
          <span>${formatBs(data.ivaBs)}</span>
        </div>` : ''}
        ${data.igtfBs > 0 ? `
        <div style="display:flex;justify-content:space-between;font-size:12px;">
          <span>IGTF (3%)</span>
          <span>${formatBs(data.igtfBs)}</span>
        </div>` : ''}
        ${data.discountBs && data.discountBs > 0 ? `
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#16a34a;">
          <span>Descuento</span>
          <span>-${formatBs(data.discountBs)}</span>
        </div>` : ''}
        <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:bold;margin-top:4px;border-top:1px solid #333;padding-top:4px;">
          <span>TOTAL</span>
          <span>${formatBs(data.totalBs)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#666;">
          <span>En USD</span>
          <span>${formatUsd(data.totalUsd)}</span>
        </div>
      </div>

      <div style="border-top:1px dashed #ccc;margin-top:8px;padding-top:8px;">
        <div style="font-size:12px;">
          <span style="color:#666;">Pago: </span>
          <span style="font-weight:bold;">${getPaymentLabel(data.paymentMethod)}</span>
        </div>
        <div style="font-size:11px;color:#666;">
          Tasa: ${data.exchangeRate.toFixed(2)} Bs/$
        </div>
      </div>

      <div style="text-align:center;margin-top:16px;font-size:10px;color:#999;">
        ¡Gracias por su compra!<br/>
        powered by Sasa ERP
      </div>
    </div>
  `;
}

export async function generateTicketPdf(data: TicketData, tenantId: string): Promise<Blob | null> {
  try {
    const tenantInfo = await TenantTranslator.getTenantInfo(tenantId);
    const tenantName = tenantInfo?.name ?? 'Mi Negocio';

    const html = buildTicketHtml(data, tenantName);

    const container = document.createElement('div');
    container.innerHTML = html;
    container.style.position = 'fixed';
    container.style.top = '-9999px';
    container.style.left = '-9999px';
    container.style.width = '300px';
    container.style.background = '#ffffff';
    document.body.appendChild(container);

    try {
      const html2pdf = (await import('html2pdf.js')).default;

      const opt = {
        margin: [5, 5, 5, 5] as [number, number, number, number],
        filename: `ticket-${data.saleId.slice(0, 8)}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
        },
        jsPDF: {
          unit: 'mm' as const,
          format: [80, 297] as [number, number],
          orientation: 'portrait' as const,
        },
      };

      const pdfBlob = await html2pdf().set(opt).from(container).outputPdf('blob');
      return pdfBlob;
    } finally {
      document.body.removeChild(container);
    }
  } catch (err) {
    console.error('Error generando ticket PDF:', err);
    return null;
  }
}

export async function shareTicketViaWhatsApp(pdfBlob: Blob, data: TicketData, tenantId: string): Promise<void> {
  const tenantInfo = await TenantTranslator.getTenantInfo(tenantId);
  const tenantName = tenantInfo?.name ?? 'Mi Negocio';
  const message = encodeURIComponent(`Gracias por tu compra en ${tenantName} 🛒`);

  if (navigator.share && navigator.canShare) {
    try {
      const file = new File([pdfBlob], `ticket-${data.saleId.slice(0, 8)}.pdf`, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: message });
        return;
      }
    } catch {
      // fallback a WhatsApp web
    }
  }

  // Fallback: descargar el PDF
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ticket-${data.saleId.slice(0, 8)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
