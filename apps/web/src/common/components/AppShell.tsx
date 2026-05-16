import { memo, type ReactNode } from 'react';
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

export const AppShell = memo(function AppShell({ children, topBar, bottomNav, sidebar, sidebarOpen = true, sidebarExpanded = false, className }: AppShellProps) {
  const sidebarWidth = sidebar && sidebarOpen ? (sidebarExpanded ? '12rem' : '3.5rem') : '0px';
  const sidebarWidthMd = sidebar && sidebarOpen ? (sidebarExpanded ? '12rem' : '3.5rem') : '0px';
  return (
    <div className={cn('app-shell', className)} style={{ '--sidebar-width': sidebarWidth, '--sidebar-width-md': sidebarWidthMd } as React.CSSProperties}>
      {sidebar}
        <div className={cn('app-shell-main', sidebar && 'app-shell-main--with-sidebar')} style={{ paddingLeft: `var(--sidebar-width)` }}>
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
});
