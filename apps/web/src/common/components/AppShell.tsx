import { type FC, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface AppShellProps {
  children: ReactNode;
  topBar: ReactNode;
  bottomNav?: ReactNode;
  sidebar?: ReactNode;
  sidebarOpen?: boolean;
  sidebarExpanded?: boolean;
  className?: string;
}

export const AppShell: FC<AppShellProps> = ({ children, topBar, bottomNav, sidebar, sidebarOpen: _sidebarOpen = true, sidebarExpanded = false, className }) => {
  const sidebarWidth = sidebar ? (sidebarExpanded ? '12rem' : '3.5rem') : '0px';
  return (
    <div className={cn('app-shell', className)} style={{ ['--sidebar-width' as unknown as string]: sidebarWidth } as React.CSSProperties}>
      {sidebar}
      <div className={cn('app-shell-main') }>
        <header className="app-topbar">
          {topBar}
        </header>
        <main className="app-shell-content">
          {children}
        </main>
        {bottomNav && <footer>{bottomNav}</footer>}
      </div>
    </div>
  );
};
