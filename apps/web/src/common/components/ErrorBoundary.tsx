import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Button } from './Button';
import { Card } from './Card';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  moduleName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.moduleName ? `: ${this.props.moduleName}` : ''}]`, error.message, errorInfo.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-4 flex items-center justify-center min-h-[200px]">
          <Card className="max-w-md w-full p-6">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-danger/10 flex items-center justify-center">
                <AlertTriangle size={24} className="text-danger" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  {this.props.moduleName
                    ? `Error en ${this.props.moduleName}`
                    : 'Algo salió mal'}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Ha ocurrido un error inesperado. Puedes intentar recargar la página.
                </p>
              </div>
              {this.state.error && (
                <details className="w-full text-left">
                  <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                    Ver detalles técnicos
                  </summary>
                  <pre className="mt-2 text-xs text-danger bg-red-50 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">
                    {this.state.error.message}
                  </pre>
                </details>
              )}
              <Button variant="primary" fullWidth onClick={this.handleRetry}>
                <RefreshCw size={16} />
                Recargar página
              </Button>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
