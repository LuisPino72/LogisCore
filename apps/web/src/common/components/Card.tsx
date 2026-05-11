import { type FC, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface CardProps {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
  interactive?: boolean;
  onClick?: () => void;
}

export const Card: FC<CardProps> = ({ children, header, footer, className, interactive, onClick }) => {
  return (
    <div 
      className={cn(
        'card transition-all duration-150', 
        interactive && 'card-interactive', 
        className
      )}
      onClick={interactive ? onClick : undefined}
    >
      {header && <div className="card-header">{header}</div>}
      <div className="card-body">
        {children}
      </div>
      {footer && <div className="card-footer">{footer}</div>}
    </div>
  );
};
