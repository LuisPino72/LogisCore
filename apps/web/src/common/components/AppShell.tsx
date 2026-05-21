import { memo, useEffect, type ReactNode } from 'react';
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
  const collapsedWidth = '2.5rem';
  const sidebarWidth = sidebar && sidebarOpen ? collapsedWidth : '0px';
  const sidebarWidthMd = sidebar && sidebarOpen ? (sidebarExpanded ? '12rem' : collapsedWidth) : '0px';
  const sidebarActual = sidebar && sidebarOpen ? collapsedWidth : '0px';

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--sidebar-width', sidebarWidth);
    root.style.setProperty('--sidebar-width-md', sidebarWidthMd);
    root.style.setProperty('--sidebar-actual', sidebarActual);
    return () => {
      root.style.removeProperty('--sidebar-width');
      root.style.removeProperty('--sidebar-width-md');
      root.style.removeProperty('--sidebar-actual');
    };
  }, [sidebarWidth, sidebarWidthMd, sidebarActual]);

  return (
    <div className={cn('app-shell', className)} style={{ '--sidebar-width': sidebarWidth, '--sidebar-width-md': sidebarWidthMd, '--sidebar-actual': sidebarActual } as React.CSSProperties}>
      {sidebar}
        <div className={cn('app-shell-main', sidebar && 'app-shell-main--with-sidebar')}>
        <header className="app-topbar">
          {topBar}
        </header>
        <main className={cn('app-shell-content', bottomNav && 'app-shell-content--with-bottom-nav')}>
          {children}
        </main>
        {bottomNav && <footer>{bottomNav}</footer>}
      </div>
    </div>
  );
});
