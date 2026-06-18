import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'ghost-success' | 'ghost-danger' | 'ghost-primary' | 'ghost-accent' | 'outline' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary',
  size = 'md',
  fullWidth,
  loading,
  disabled,
  icon,
  iconLeft,
  iconRight,
  children,
  className,
  type = 'button',
  ...props
}, ref) => {
  const isIconOnly = !children && !!icon;

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        `btn btn-${variant}`,
        `btn-${size}`,
        fullWidth && 'btn-full',
        loading && 'btn-loading',
        isIconOnly && 'btn-icon',
        className,
      )}
      {...props}
    >
      {loading ? (
        <span className="spinner spinner-sm" />
      ) : isIconOnly ? (
        icon
      ) : (
        <>
          {iconLeft}
          {children}
          {iconRight}
        </>
      )}
    </button>
  );
});
Button.displayName = 'Button';
