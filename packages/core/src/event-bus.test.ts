import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus, SystemEvents } from './event-bus';

describe('EventBus', () => {
  beforeEach(() => {
    EventBus.clear();
  });

  afterEach(() => {
    EventBus.clear();
  });

  describe('on(event, handler)', () => {
    it('subscribes handler to event', () => {
      const handler = vi.fn();
      const sub = EventBus.on('TEST.EVENT', handler);
      expect(sub.event).toBe('TEST.EVENT');
      expect(sub.listener).toBe(handler);
    });
  });

  describe('emit(event, payload)', () => {
    it('notifies subscribed handlers', () => {
      const handler = vi.fn();
      EventBus.on('TEST.EVENT', handler);
      EventBus.emit('TEST.EVENT', { data: 'test' });
      expect(handler).toHaveBeenCalledWith({ data: 'test' });
    });

    it('does not fail if no listeners', () => {
      expect(() => EventBus.emit('NO.LISTENERS', {})).not.toThrow();
    });

    it('Handler receives the payload correctly', () => {
      const handler = vi.fn();
      EventBus.on('TEST.EVENT', handler);
      EventBus.emit('TEST.EVENT', { key: 'value', number: 42 });
      expect(handler).toHaveBeenCalledWith({ key: 'value', number: 42 });
    });
  });

  describe('off(subscription)', () => {
    it('unsubscribes specific handler', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const sub1 = EventBus.on('TEST.EVENT', handler1);
      EventBus.on('TEST.EVENT', handler2);
      
      EventBus.off(sub1);
      EventBus.emit('TEST.EVENT', {});
      
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('clears event when no listeners remain', () => {
      const handler = vi.fn();
      const sub = EventBus.on('TEST.EVENT', handler);
      EventBus.off(sub);
      // No error when emitting after removal
      expect(() => EventBus.emit('TEST.EVENT', {})).not.toThrow();
    });

    it('Handler is not called after off()', () => {
      const handler = vi.fn();
      const sub = EventBus.on('TEST.EVENT', handler);
      EventBus.off(sub);
      EventBus.emit('TEST.EVENT', {});
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('clear()', () => {
    it('clears all listeners', () => {
      EventBus.on('EVENT.1', vi.fn());
      EventBus.on('EVENT.2', vi.fn());
      EventBus.clear();
      expect(() => EventBus.emit('EVENT.1', {})).not.toThrow();
      expect(() => EventBus.emit('EVENT.2', {})).not.toThrow();
    });
  });

  describe('Multiple handlers for same event', () => {
    it('notifies all handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      EventBus.on('TEST.EVENT', handler1);
      EventBus.on('TEST.EVENT', handler2);
      EventBus.emit('TEST.EVENT', {});
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('SystemEvents', () => {
    it('SALE_COMPLETED event exists', () => {
      expect(SystemEvents.SALE_COMPLETED).toBe('SALE.COMPLETED');
    });

    it('BOX_OPENED event exists', () => {
      expect(SystemEvents.BOX_OPENED).toBe('POS.BOX_OPENED');
    });

    it('SYNC_REFRESH_TABLE event exists', () => {
      expect(SystemEvents.SYNC_REFRESH_TABLE).toBe('SYNC.REFRESH_TABLE');
    });
  });
});