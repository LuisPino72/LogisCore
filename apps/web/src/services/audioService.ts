type OscillatorType = 'sine' | 'square' | 'sawtooth' | 'triangle';

interface BeepConfig {
  freq: number;
  duration: number;
  type?: OscillatorType;
  volume?: number;
}

interface NoteConfig extends BeepConfig {
  delay?: number;
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
    if (!this.ctx || this.ctx.state === 'closed') return null;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playSequence(notes: NoteConfig[]): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      let time = ctx.currentTime;
      for (const note of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = note.type || 'sine';
        osc.frequency.value = note.freq;
        gain.gain.value = note.volume ?? 0.3;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + note.duration);
        time += note.duration + (note.delay ?? 0.04);
      }
    } catch {
      // AudioContext no disponible — silencioso
    }
  }

  saleComplete(): void {
    this.playSequence([
      { freq: 523, duration: 0.08, volume: 0.25 },
      { freq: 659, duration: 0.08, volume: 0.25 },
      { freq: 784, duration: 0.12, volume: 0.3 },
    ]);
  }

  scanSuccess(): void {
    this.playSequence([
      { freq: 1000, duration: 0.05, volume: 0.2 },
      { freq: 1200, duration: 0.05, volume: 0.2 },
    ]);
  }

  lowStock(): void {
    this.playSequence([
      { freq: 440, duration: 0.2, type: 'triangle', volume: 0.25 },
      { freq: 330, duration: 0.25, type: 'triangle', volume: 0.2 },
    ]);
  }

  rateFailed(): void {
    this.playSequence([
      { freq: 392, duration: 0.15, type: 'sawtooth', volume: 0.2 },
      { freq: 330, duration: 0.15, type: 'sawtooth', volume: 0.2 },
      { freq: 262, duration: 0.2, type: 'sawtooth', volume: 0.25 },
    ]);
  }

  kitchenNewOrder(): void {
    this.playSequence([
      { freq: 660, duration: 0.1, type: 'square', volume: 0.2 },
      { freq: 880, duration: 0.1, type: 'square', volume: 0.2 },
      { delay: 0.12, freq: 1046, duration: 0.1, type: 'square', volume: 0.25 },
    ]);
  }

  kitchenReady(): void {
    this.playSequence([
      { freq: 660, duration: 0.12, volume: 0.25 },
      { freq: 784, duration: 0.12, volume: 0.25 },
      { freq: 880, duration: 0.15, volume: 0.3 },
    ]);
  }

  resume(): void {
    const AudioCtx = window.AudioContext || (window as unknown as Record<string, unknown>)['webkitAudioContext'];
    if (!AudioCtx) return;
    if (!this.ctx || this.ctx.state === 'closed') {
      try {
        this.ctx = new AudioCtx();
      } catch {
        return;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  get isSuspended(): boolean {
    return this.ctx?.state === 'suspended';
  }
}

export const audioService = new AudioService();
