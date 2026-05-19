const GRACE_KEY = 'logiscore_offline_grace';
const GRACE_HOURS = 6;
const GRACE_MS = GRACE_HOURS * 60 * 60 * 1000;

interface GraceState {
  lastServerValidatedAt: number;
  tenantSlug: string;
}

class OfflineGraceService {
  private state: GraceState | null = null;

  private load(): void {
    if (this.state) return;
    try {
      const raw = localStorage.getItem(GRACE_KEY);
      if (raw) {
        this.state = JSON.parse(raw) as GraceState;
      }
    } catch {
      this.state = null;
    }
  }

  private save(): void {
    if (!this.state) return;
    localStorage.setItem(GRACE_KEY, JSON.stringify(this.state));
  }

  extend(tenantSlug: string): void {
    this.state = { lastServerValidatedAt: Date.now(), tenantSlug };
    this.save();
  }

  isExpired(): boolean {
    this.load();
    if (!this.state) return true;
    return Date.now() - this.state.lastServerValidatedAt > GRACE_MS;
  }

  getTenantSlug(): string | null {
    this.load();
    return this.state?.tenantSlug ?? null;
  }

  getRemainingMinutes(): number {
    this.load();
    if (!this.state) return 0;
    const elapsed = Date.now() - this.state.lastServerValidatedAt;
    const remaining = GRACE_MS - elapsed;
    return Math.max(0, Math.floor(remaining / 60000));
  }

  clear(): void {
    this.state = null;
    localStorage.removeItem(GRACE_KEY);
  }
}

export const offlineGrace = new OfflineGraceService();
