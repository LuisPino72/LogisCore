import { type FC, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface CardProps {
  header?: ReactNode;
  footer?: ReactNode;
  interactive?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

export const Card: FC<CardProps> = ({
  header,
  footer,
  interactive,
  onClick,
  children,
  className,
}) => {
  return (
    <div
      className={cn('card', interactive && 'card-interactive', className)}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive && onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); } : undefined}
    >
      {header && <div className="card-header">{header}</div>}
      <div className="card-body">{children}</div>
      {footer && <div className="card-footer">{footer}</div>}
    </div>
  );
};