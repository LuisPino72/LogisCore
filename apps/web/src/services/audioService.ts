type OscillatorType = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'custom';

interface BeepConfig {
  freq: number;
  duration: number;
  type?: OscillatorType;
  volume?: number;
}

class AudioService {
  private ctx: AudioContext | null = null;
  private _enabled = true;

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(v: boolean) {
    this._enabled = v;
  }

  private getContext(): AudioContext | null {
    if (!this._enabled) return null;
    const AudioCtx = window.AudioContext || (window as unknown as Record<string, unknown>)['webkitAudioContext'];
    if (!AudioCtx) return null;
    if (!this.ctx || this.ctx.state === 'closed') {
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playBeep(config: BeepConfig): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = config.type || 'sine';
      osc.frequency.value = config.freq;
      gain.gain.value = config.volume ?? 0.3;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + config.duration);
    } catch {
      // AudioContext no disponible — silencioso
    }
  }

  saleComplete(): void {
    this.playBeep({ freq: 660, duration: 0.15 });
  }

  scanSuccess(): void {
    this.playBeep({ freq: 1200, duration: 0.08, volume: 0.2 });
  }

  lowStock(): void {
    this.playBeep({ freq: 400, duration: 0.3, type: 'triangle', volume: 0.25 });
  }

  rateFailed(): void {
    this.playBeep({ freq: 300, duration: 0.5, type: 'sawtooth', volume: 0.25 });
  }

  kitchenNewOrder(): void {
    this.playBeep({ freq: 800, duration: 0.15, type: 'square', volume: 0.25 });
  }

  kitchenReady(): void {
    this.playBeep({ freq: 880, duration: 0.2, volume: 0.3 });
  }

  resume(): void {
    const ctx = this.getContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  get isSuspended(): boolean {
    return this.ctx?.state === 'suspended';
  }
}

export const audioService = new AudioService();
