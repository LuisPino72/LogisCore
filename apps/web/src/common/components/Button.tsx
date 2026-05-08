import { type FC, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth,
  loading,
  disabled,
  icon,
  children,
  className,
  type = 'button',
  ...props
}) => {
  const isIconOnly = !children && !!icon;

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        `btn-${variant}`,
        `btn-${size}`,
        fullWidth && 'btn-full',
        loading && 'btn-loading',
        isIconOnly && 'btn-icon',
        className,
      )}
      {...props}
    >
      {loading ? <span className="spinner spinner-sm" /> : icon}
      {children}
    </button>
  );
};