import { AppError, Result, success, failure } from '@logiscore/core';
import { supabase } from '../../../services/supabase/client';

const SESSION_TOKEN_KEY = 'logiscore_session_token';
const HEARTBEAT_MS = 3 * 60 * 1000;

function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('Windows')) return 'Windows PC';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  return 'Desconocido';
}

class SessionGuardService {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private token: string | null = null;
  private heartbeatFailures = 0;
  private static readonly MAX_HEARTBEAT_FAILURES = 3;

  getSessionToken(): string | null {
    if (!this.token) {
      try {
        this.token = localStorage.getItem(SESSION_TOKEN_KEY);
      } catch {
        console.debug('[SessionGuard] localStorage error — non-critical');
      }
    }
    return this.token;
  }

  generateSessionToken(): string {
    this.token = crypto.randomUUID();
    try {
      localStorage.setItem(SESSION_TOKEN_KEY, this.token);
    } catch {
      console.debug('[SessionGuard] localStorage error — non-critical');
    }
    return this.token;
  }

  restoreSessionToken(): string | null {
    try {
      const stored = localStorage.getItem(SESSION_TOKEN_KEY);
      if (stored) {
        this.token = stored;
        return stored;
      }
    } catch {
      console.debug('[SessionGuard] localStorage error — non-critical');
    }
    return null;
  }

  async claim(adminBypass: boolean): Promise<Result<void, AppError>> {
    if (adminBypass) return success(undefined);

    let token = this.getSessionToken();
    if (!token) {
      token = this.generateSessionToken();
    }

    const { error } = await supabase.rpc('claim_active_session', {
      p_session_token: token,
      p_device_label: deviceLabel(),
    });

    if (error) {
      if (error.message === 'SESSION_ALREADY_ACTIVE') {
        this.clearToken();
        return failure(
          new AppError(
            'AUTH_SESSION_ACTIVE',
            'Ya hay una sesión activa en otro dispositivo. Cierra sesión allá primero.',
          ),
        );
      }
      return failure(new AppError('AUTH_SESSION_ERROR', 'Error al validar sesión.'));
    }

    return success(undefined);
  }

  private async sendHeartbeat(): Promise<void> {
    const token = this.getSessionToken();
    if (!token || !navigator.onLine) return;
    try {
      await supabase.rpc('session_heartbeat', { p_session_token: token });
      this.heartbeatFailures = 0;
    } catch {
      this.heartbeatFailures++;
      if (this.heartbeatFailures >= SessionGuardService.MAX_HEARTBEAT_FAILURES) {
        this.clearToken();
        this.stopHeartbeat();
      }
    }
  }

  async release(): Promise<void> {
    const token = this.getSessionToken();
    if (token) {
      await supabase.rpc('release_active_session', { p_session_token: token });
    }
    this.clearToken();
  }

  startHeartbeat(): void {
    this.stopHeartbeat();
    this.sendHeartbeat();
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), HEARTBEAT_MS);
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    document.removeEventListener('visibilitychange', this.handleVisibility);
  }

  private handleVisibility = (): void => {
    if (document.visibilityState === 'visible') {
      this.sendHeartbeat();
    }
  };

  private clearToken(): void {
    this.token = null;
    try {
      localStorage.removeItem(SESSION_TOKEN_KEY);
    } catch {
      console.debug('[SessionGuard] localStorage error — non-critical');
    }
  }
}

export const sessionGuard = new SessionGuardService();
