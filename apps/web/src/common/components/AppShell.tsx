import { type FC, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface AppShellProps {
  topBar?: ReactNode;
  bottomNav?: ReactNode;
  children: ReactNode;
  className?: string;
}

export const AppShell: FC<AppShellProps> = ({ topBar, bottomNav, children, className }) => {
  return (
    <div className="app-shell">
      {topBar && <div className="app-topbar">{topBar}</div>}
      <main className={cn('app-shell-content', className)}>{children}</main>
      {bottomNav}
    </div>
  );
};