import { logger } from '../../lib/logger';

interface NetworkInformation {
  type: string;
  addEventListener: (event: string, handler: () => void) => void;
  removeEventListener: (event: string, handler: () => void) => void;
}

const SYNC_INTERVAL_MS = 10000;

export interface NetworkState {
  online: boolean;
  isMobileData: boolean;
  syncIntervalMs: number;
}

class NetworkAwareService {
  private state: NetworkState;
  private listeners = new Set<(state: NetworkState) => void>();

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
    window.addEventListener('online', () => {
      logger.info('[NetworkAware]', 'Evento online detectado');
      this.emitChange();
    });
    window.addEventListener('offline', () => {
      logger.info('[NetworkAware]', 'Evento offline detectado');
      this.emitChange();
    });

    const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    if (conn) {
      conn.addEventListener('change', () => {
        logger.info('[NetworkAware]', 'Cambio en Connection API');
        this.emitChange();
      });
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
  }
}

export const networkAware = new NetworkAwareService();
