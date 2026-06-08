import { useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '@/common/components';
import type { TopProductData, TopCategoryData } from '@/features/reports/types';
import { formatBs, formatUsd } from '@/lib/formatBs';

interface SlideView {
  id: string;
  title: string;
  type: 'category' | 'product' | 'volume';
  emptyMessage: string;
}

const SLIDES: SlideView[] = [
  { id: 'top-cats', title: 'Top 5 Categorías', type: 'category', emptyMessage: 'Aún no hay categorías con ventas en este período.' },
  { id: 'worst-cats', title: 'Peores 5 Categorías', type: 'category', emptyMessage: 'Todas las categorías dieron ganancia.' },
  { id: 'top-prods', title: 'Top 5 Productos', type: 'product', emptyMessage: 'Aún no hay productos con ventas en este período.' },
  { id: 'worst-prods', title: 'Peores 5 Productos', type: 'product', emptyMessage: 'Todos los productos dieron ganancia.' },
  { id: 'by-volume', title: 'Top 5 por Volumen', type: 'volume', emptyMessage: 'Aún no hay ventas en este período.' },
];

interface InsightsCarouselProps {
  topCategories: TopCategoryData[] | null;
  worstCategories: TopCategoryData[] | null;
  topProducts: TopProductData[] | null;
  worstProducts: TopProductData[] | null;
  topByVolume: TopProductData[] | null;
  loading: boolean;
}

function getSlideData(
  slide: SlideView,
  topCategories: TopCategoryData[] | null,
  worstCategories: TopCategoryData[] | null,
  topProducts: TopProductData[] | null,
  worstProducts: TopProductData[] | null,
  topByVolume: TopProductData[] | null,
): { name: string; value: number; secondary: string; color: string }[] {
  switch (slide.id) {
    case 'top-cats':
      return (topCategories ?? []).slice(0, 5).map((c) => ({
        name: c.categoryName, value: c.profitBs,
        secondary: `${c.productCount} prod · ${formatUsd(c.profitUsd)}`,
        color: '#0D9488',
      }));
    case 'worst-cats':
      return (worstCategories ?? []).slice(0, 5).map((c) => ({
        name: c.categoryName, value: c.profitBs,
        secondary: `${c.productCount} prod · ${formatUsd(c.profitUsd)}`,
        color: '#ef4444',
      }));
    case 'top-prods':
      return (topProducts ?? []).slice(0, 5).map((p) => ({
        name: p.name, value: p.profitBs,
        secondary: `${p.quantitySold.toFixed(p.quantitySold % 1 !== 0 ? 2 : 0)} u · ${formatUsd(p.profitUsd)}`,
        color: '#0D9488',
      }));
    case 'worst-prods':
      return (worstProducts ?? []).slice(0, 5).map((p) => ({
        name: p.name, value: p.profitBs,
        secondary: `${p.quantitySold.toFixed(p.quantitySold % 1 !== 0 ? 2 : 0)} u · ${formatUsd(p.profitUsd)}`,
        color: '#ef4444',
      }));
    case 'by-volume':
      return (topByVolume ?? []).slice(0, 5).map((p) => ({
        name: p.name, value: p.quantitySold,
        secondary: `${formatBs(p.revenueBs)} · ${formatUsd(p.revenueUsd)}`,
        color: '#F59E0B',
      }));
    default:
      return [];
  }
}

function getValueLabel(slide: SlideView): string {
  if (slide.id === 'by-volume') return 'Cantidad';
  return 'Ganancia';
}

function formatValue(slide: SlideView, value: number): string {
  if (slide.id === 'by-volume') return `${value.toFixed(value % 1 !== 0 ? 2 : 0)}`;
  return formatBs(value);
}

export function InsightsCarousel({
  topCategories, worstCategories, topProducts, worstProducts, topByVolume,
  loading,
}: InsightsCarouselProps) {
  const [current, setCurrent] = useState(0);

  const allSlides = SLIDES.map((slide) => ({
    slide,
    data: getSlideData(slide, topCategories, worstCategories, topProducts, worstProducts, topByVolume),
  }));

  const hasData = allSlides.some((s) => s.data.length > 0);

  const goTo = useCallback((idx: number) => {
    setCurrent(Math.max(0, Math.min(idx, allSlides.length - 1)));
  }, [allSlides.length]);

  if (loading) {
    return (
      <Card className="p-4">
        <div className="space-y-3">
          <div className="skeleton h-5 w-44 rounded" />
          <div className="skeleton h-4 w-64 rounded" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-10 rounded" />
          ))}
        </div>
      </Card>
    );
  }

  if (!hasData) {
    return (
      <Card className="p-4 sm:p-6">
        <p className="text-sm text-text-secondary text-center">Aún no hay suficientes datos para mostrar análisis en este período.</p>
      </Card>
    );
  }

  const active = allSlides[current];
  if (!active) return null;

  const maxValue = active.data.length > 0 ? Math.max(...active.data.map((d) => d.value), 1) : 1;

  return (
    <Card className="p-3 sm:p-5">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h3 className="text-sm font-title font-bold text-gray-900">{active.slide.title}</h3>
        <span className="text-[10px] sm:text-[11px] text-text-secondary font-medium">{getValueLabel(active.slide)}</span>
      </div>

      <div className="space-y-3 sm:space-y-2.5 min-h-[200px] sm:min-h-[220px]">
        {active.data.length === 0 ? (
          <p className="text-sm text-text-secondary py-6 text-center">{active.slide.emptyMessage}</p>
        ) : (
          active.data.map((item, idx) => {
            const pct = maxValue > 0 ? (Math.abs(item.value) / maxValue) * 100 : 0;
            return (
              <div key={idx}>
                <div className="flex items-start gap-2 sm:gap-3 mb-0.5">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] sm:text-[10px] font-bold text-white shrink-0 mt-0.5 ${
                    idx === 0 && active.slide.id !== 'worst-cats' && active.slide.id !== 'worst-prods'
                      ? 'bg-amber-400'
                      : idx === 1 && active.slide.id !== 'worst-cats' && active.slide.id !== 'worst-prods'
                      ? 'bg-gray-400'
                      : idx === 2 && active.slide.id !== 'worst-cats' && active.slide.id !== 'worst-prods'
                      ? 'bg-amber-700'
                      : 'bg-gray-300'
                  }`}>
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-700 wrap-break-word text-xs sm:text-sm leading-tight">{item.name}</p>
                    <p className="text-[10px] sm:text-[11px] text-text-secondary">{item.secondary}</p>
                  </div>
                  <span className={`text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 ${
                    item.value >= 0 ? 'text-gray-900' : 'text-danger'
                  }`}>
                    {formatValue(active.slide, item.value)}
                  </span>
                </div>
                <div className="h-1.5 sm:h-2 bg-gray-100 rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(pct, 100)}%`,
                      backgroundColor: item.value >= 0 ? item.color : '#ef4444',
                      opacity: idx === 0 ? 1 : Math.max(0.35, 1 - idx * 0.12),
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-center gap-3 sm:gap-4 mt-4 sm:mt-5 pt-3 border-t border-gray-100">
        <button
          onClick={() => goTo(current - 1)}
          disabled={current === 0}
          className="p-2 sm:p-2.5 rounded-xl border-2 border-gray-200 hover:border-primary/40 hover:bg-primary/5 disabled:opacity-30 disabled:cursor-not-allowed disabled:border-gray-100 transition-all"
          aria-label="Anterior"
        >
          <ChevronLeft size={20} className="text-gray-700" />
        </button>

        <div className="flex items-center gap-2 sm:gap-2.5">
          {allSlides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => goTo(idx)}
              className={`rounded-full transition-all duration-300 ${
                idx === current
                  ? 'w-6 sm:w-8 h-2 sm:h-2.5 bg-primary'
                  : 'w-2 sm:w-2.5 h-2 sm:h-2.5 bg-gray-300 hover:bg-gray-400'
              }`}
              aria-label={`Ir a slide ${idx + 1}`}
            />
          ))}
        </div>

        <button
          onClick={() => goTo(current + 1)}
          disabled={current === allSlides.length - 1}
          className="p-2 sm:p-2.5 rounded-xl border-2 border-gray-200 hover:border-primary/40 hover:bg-primary/5 disabled:opacity-30 disabled:cursor-not-allowed disabled:border-gray-100 transition-all"
          aria-label="Siguiente"
        >
          <ChevronRight size={20} className="text-gray-700" />
        </button>
      </div>
    </Card>
  );
}
