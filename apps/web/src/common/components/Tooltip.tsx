import { useState, useRef, useEffect, useId, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface TooltipProps {
  content: string;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  variant?: 'info' | 'warning' | 'help';
  className?: string;
  delay?: number;
}

export function Tooltip({
  content,
  children,
  position = 'top',
  variant = 'info',
  className,
  delay = 200,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const tooltipId = useId();

  useEffect(() => {
    setIsMobile(window.matchMedia('(hover: none)').matches);
  }, []);

  const show = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(true), delay);
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setClosing(true);
    closingTimerRef.current = setTimeout(() => {
      setVisible(false);
      setClosing(false);
    }, 150);
  };

  const toggle = () => {
    if (isMobile) {
      setVisible((v) => !v);
    }
  };

  useEffect(() => {
    if (!isMobile) return;
    if (!visible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isMobile, visible]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
    };
  }, []);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 -mt-1',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 -mb-1',
    left: 'left-full top-1/2 -translate-y-1/2 -ml-1',
    right: 'right-full top-1/2 -translate-y-1/2 -mr-1',
  };

  const variantClasses = {
    info: 'bg-gray-900 text-white',
    warning: 'bg-amber-600 text-white',
    help: 'bg-primary text-white',
  };

  return (
    <div
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={!isMobile ? show : undefined}
      onMouseLeave={!isMobile ? hide : undefined}
      onFocus={!isMobile ? show : undefined}
      onBlur={!isMobile ? hide : undefined}
      onClick={isMobile ? toggle : undefined}
      role={isMobile ? 'button' : undefined}
      tabIndex={isMobile ? 0 : undefined}
      aria-describedby={visible ? tooltipId : undefined}
    >
      {children}
      {(visible || closing) && content && (
        <div
          id={tooltipId}
          role="tooltip"
          className={cn(
            'absolute z-100 px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap max-w-[200px] text-center pointer-events-none shadow-lg',
            closing ? 'animate-fade-out' : 'animate-fade-in',
            positionClasses[position],
            variantClasses[variant],
            className,
          )}
        >
          {content}
          <div
            className={cn(
              'absolute w-2 h-2 rotate-45',
              arrowClasses[position],
              variantClasses[variant],
            )}
          />
        </div>
      )}
    </div>
  );
}
