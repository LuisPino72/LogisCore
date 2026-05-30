import { useState } from 'react';
import { Button } from '../../../common/components';
import { Printer, Share2, Loader2 } from 'lucide-react';
import { generateTicketPdf, shareTicketViaWhatsApp } from '../services/ticketService';

interface TicketButtonProps {
  saleId: string;
  items: Array<{ name: string; quantity: number; unitPriceUsd: number; totalPriceUsd: number; presentationName?: string; unit?: string }>;
  subtotalBs: number;
  totalUsd: number;
  totalBs: number;
  ivaBs: number;
  igtfBs: number;
  discountBs?: number;
  paymentMethod: string;
  exchangeRate: number;
  createdAt: string;
  tenantId: string;
  variant?: 'full' | 'icon';
}

export function TicketButton({ saleId, items, subtotalBs, totalUsd, totalBs, ivaBs, igtfBs, discountBs, paymentMethod, exchangeRate, createdAt, tenantId, variant = 'full' }: TicketButtonProps) {
  const [generating, setGenerating] = useState(false);

  const ticketData = { saleId, items, subtotalBs, totalUsd, totalBs, ivaBs, igtfBs, discountBs, paymentMethod, exchangeRate, createdAt };

  const handleGeneratePdf = async () => {
    setGenerating(true);
    try {
      const blob = await generateTicketPdf(ticketData, tenantId);
      if (blob) {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleShareWhatsApp = async () => {
    setGenerating(true);
    try {
      const blob = await generateTicketPdf(ticketData, tenantId);
      if (blob) {
        await shareTicketViaWhatsApp(blob, ticketData, tenantId);
      }
    } finally {
      setGenerating(false);
    }
  };

  if (variant === 'icon') {
    return (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={handleGeneratePdf} disabled={generating} className="p-1.5" title="Generar ticket">
          {generating ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
        </Button>
        <Button variant="ghost" size="sm" onClick={handleShareWhatsApp} disabled={generating} className="p-1.5" title="Compartir por WhatsApp">
          <Share2 size={16} />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-2 w-full">
      <Button variant="outline" className="flex-1" onClick={handleGeneratePdf} disabled={generating}>
        {generating ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
        Ticket
      </Button>
      <Button variant="outline" className="flex-1" onClick={handleShareWhatsApp} disabled={generating}>
        <Share2 size={16} />
        WhatsApp
      </Button>
    </div>
  );
}
