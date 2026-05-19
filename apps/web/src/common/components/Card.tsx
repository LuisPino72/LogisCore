import { type FC, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface CardProps {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  interactive?: boolean;
  onClick?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  role?: string;
  tabIndex?: number;
  'aria-label'?: string;
}

export const Card: FC<CardProps> = ({ children, header, footer, className, bodyClassName, interactive, onClick, onKeyDown, role, tabIndex, 'aria-label': ariaLabel }) => {
  return (
    <div 
      className={cn(
        'card transition-all duration-150', 
        interactive && 'card-interactive', 
        className
      )}
      onClick={interactive ? onClick : undefined}
      onKeyDown={interactive ? onKeyDown : undefined}
      role={role}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
    >
      {header && <div className="card-header">{header}</div>}
      <div className={cn('card-body', bodyClassName)}>
        {children}
      </div>
      {footer && <div className="card-footer">{footer}</div>}
    </div>
  );
};
