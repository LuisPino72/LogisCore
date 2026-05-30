import { logger } from '../../lib/logger';

interface NetworkInformation {
  type: string;
  addEventListener: (event: string, handler: () => void) => void;
  removeEventListener: (event: string, handler: () => void) => void;
}

export const SYNC_INTERVAL_MS = 5000;

export interface NetworkState {
  online: boolean;
  isMobileData: boolean;
  syncIntervalMs: number;
}

class NetworkAwareService {
  private state: NetworkState;
  private listeners = new Set<(state: NetworkState) => void>();
  private boundOnlineHandler: (() => void) | null = null;
  private boundOfflineHandler: (() => void) | null = null;
  private boundConnectionHandler: (() => void) | null = null;

  constructor() {
    this.state = this.detectNetwork();
    this.setupListeners();
    logger.info('[NetworkAware]', `Inicializado: online=${this.state.online}, mobile=${this.state.isMobileData}`);
  }

  private detectNetwork(): NetworkState {
    const online = navigator.onLine;
    let isMobileData = false;

    const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    if (conn) {
      isMobileData = conn.type === 'cellular';
    }

    return { online, isMobileData, syncIntervalMs: SYNC_INTERVAL_MS };
  }

  private setupListeners(): void {
    this.boundOnlineHandler = () => {
      logger.info('[NetworkAware]', 'Evento online detectado');
      this.emitChange();
    };
    this.boundOfflineHandler = () => {
      logger.info('[NetworkAware]', 'Evento offline detectado');
      this.emitChange();
    };

    window.addEventListener('online', this.boundOnlineHandler);
    window.addEventListener('offline', this.boundOfflineHandler);

    const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    if (conn) {
      this.boundConnectionHandler = () => {
        logger.info('[NetworkAware]', 'Cambio en Connection API');
        this.emitChange();
      };
      conn.addEventListener('change', this.boundConnectionHandler);
    }
  }

  private emitChange(): void {
    const newState = this.detectNetwork();
    const wasOnline = this.state.online;
    this.state = newState;

    if (!wasOnline && newState.online) {
      logger.info('[NetworkAware]', 'Reconectado');
    }

    this.listeners.forEach((cb) => cb(this.state));
  }

  getState(): NetworkState {
    return { ...this.state };
  }

  getSyncInterval(): number {
    return SYNC_INTERVAL_MS;
  }

  isOnline(): boolean {
    return this.state.online;
  }

  isWifi(): boolean {
    const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    if (conn) {
      return conn.type === 'wifi' || conn.type === 'ethernet';
    }
    return this.state.online;
  }

  isMobileData(): boolean {
    return this.state.isMobileData;
  }

  shouldPreloadImages(): boolean {
    return this.isWifi() && this.state.online;
  }

  onChange(callback: (state: NetworkState) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  destroy(): void {
    this.listeners.clear();
    if (this.boundOnlineHandler) {
      window.removeEventListener('online', this.boundOnlineHandler);
    }
    if (this.boundOfflineHandler) {
      window.removeEventListener('offline', this.boundOfflineHandler);
    }
    if (this.boundConnectionHandler) {
      const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
      if (conn) {
        conn.removeEventListener('change', this.boundConnectionHandler);
      }
    }
  }
}

export const networkAware = new NetworkAwareService();
