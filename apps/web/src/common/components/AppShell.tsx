import { type FC, type ReactNode } from 'react';

interface AppShellProps {
  children: ReactNode;
  topBar: ReactNode;
  bottomNav?: ReactNode;
  className?: string;
}

export const AppShell: FC<AppShellProps> = ({ children, topBar, bottomNav, className }) => {
  return (
    <div className={`app-shell ${className}`}>
      <header className="app-topbar">
        {topBar}
      </header>
      <main className="app-shell-content">
        {children}
      </main>
      {bottomNav && <footer>{bottomNav}</footer>}
    </div>
  );
};
