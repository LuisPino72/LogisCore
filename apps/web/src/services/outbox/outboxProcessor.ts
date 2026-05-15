import { OUTBOX_POLL_INTERVAL_MS } from '@logiscore/core';
import { outboxService } from './outboxService';

class OutboxProcessor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => this.tick(), OUTBOX_POLL_INTERVAL_MS);
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private MAX_PER_TICK = 50;

  private async tick(): Promise<void> {
    if (!this.running) return;
    try {
      let processed = 0;
      while (processed < this.MAX_PER_TICK) {
        const result = await outboxService.processNext();
        if (!result.ok || result.data !== 'processed') break;
        processed++;
      }
    } catch (err) {
      console.error('[OutboxProcessor] Error en tick:', err);
    }
  }
}

export const outboxProcessor = new OutboxProcessor();
