import { logger } from '../../lib/logger';

type ConnectionType = 'wifi' | 'cellular' | 'ethernet' | 'unknown';
type EffectiveType = 'slow-2g' | '2g' | '3g' | '4g' | '5g' | 'unknown';

interface NetworkInformation {
  type: string;
  effectiveType: string;
  addEventListener: (event: string, handler: () => void) => void;
  removeEventListener: (event: string, handler: () => void) => void;
}

export type SyncProfile = 'realtime' | 'normal' | 'conservative' | 'minimal';

export interface NetworkState {
  online: boolean;
  connectionType: ConnectionType;
  effectiveType: EffectiveType;
  syncProfile: SyncProfile;
  syncIntervalMs: number;
  isMobileData: boolean;
}

class NetworkAwareService {
  private state: NetworkState;
  private listeners = new Set<(state: NetworkState) => void>();

  private readonly WIFI_INTERVAL = 5000;
  private readonly CELLULAR_4G_INTERVAL = 15000;
  private readonly CELLULAR_3G_INTERVAL = 30000;
  private readonly CELLULAR_2G_INTERVAL = 60000;

  constructor() {
    this.state = this.detectNetwork();
    this.setupListeners();
    logger.info('[NetworkAware]', `Inicializado: ${this.state.connectionType}, ${this.state.effectiveType}, perfil: ${this.state.syncProfile}`);
  }

  private detectNetwork(): NetworkState {
    const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    const online = navigator.onLine;

    let connectionType: ConnectionType = 'unknown';
    let effectiveType: EffectiveType = 'unknown';

    if (conn) {
      switch (conn.type) {
        case 'wifi': connectionType = 'wifi'; break;
        case 'cellular': connectionType = 'cellular'; break;
        case 'ethernet': connectionType = 'ethernet'; break;
        default: if (online) connectionType = 'wifi';
      }
      effectiveType = (conn.effectiveType as EffectiveType) || 'unknown';
    } else if (online) {
      connectionType = 'wifi';
    }

    const isMobileData = connectionType === 'cellular';
    const syncProfile = this.getSyncProfile(connectionType, effectiveType, online);
    const syncIntervalMs = this.getIntervalForProfile(syncProfile);

    return { online, connectionType, effectiveType, syncProfile, syncIntervalMs, isMobileData };
  }

  private getSyncProfile(type: ConnectionType, effective: EffectiveType, online: boolean): SyncProfile {
    if (!online) return 'minimal';
    if (type === 'wifi' || type === 'ethernet') return 'realtime';
    if (type === 'cellular') {
      if (effective === '4g' || effective === '5g') return 'normal';
      if (effective === '3g') return 'conservative';
      return 'minimal';
    }
    return 'normal';
  }

  private getIntervalForProfile(profile: SyncProfile): number {
    switch (profile) {
      case 'realtime': return this.WIFI_INTERVAL;
      case 'normal': return this.CELLULAR_4G_INTERVAL;
      case 'conservative': return this.CELLULAR_3G_INTERVAL;
      case 'minimal': return this.CELLULAR_2G_INTERVAL;
    }
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
    const prevProfile = this.state.syncProfile;
    this.state = newState;
    if (newState.syncProfile !== prevProfile) {
      logger.info('[NetworkAware]', `Perfil cambió: ${prevProfile} → ${newState.syncProfile} (${newState.isMobileData ? 'datos' : 'wifi'}, intervalo: ${newState.syncIntervalMs}ms)`);
    }
    this.listeners.forEach((cb) => cb(this.state));
  }

  getState(): NetworkState {
    return { ...this.state };
  }

  getSyncInterval(): number {
    return this.state.syncIntervalMs;
  }

  isOnline(): boolean {
    return this.state.online;
  }

  isWifi(): boolean {
    return this.state.connectionType === 'wifi' || this.state.connectionType === 'ethernet';
  }

  isMobileData(): boolean {
    return this.state.isMobileData;
  }

  shouldPreloadImages(): boolean {
    return this.isWifi() && this.state.online;
  }

  getCurrentSyncProfile(): SyncProfile {
    return this.state.syncProfile;
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
