import { describe, expect, it, vi } from 'vitest';
import { SSEService } from '../../src/application/SSEService.js';

describe('SSEService', () => {
  it('has zero subscribers on init', () => {
    const service = new SSEService();
    expect(service.subscriberCount).toBe(0);
  });

  it('adds a subscriber and returns an unsubscribe function', () => {
    const service = new SSEService();
    const cb = vi.fn();

    const unsubscribe = service.subscribe(cb);

    expect(service.subscriberCount).toBe(1);
    expect(typeof unsubscribe).toBe('function');
  });

  it('removes a subscriber when unsubscribe is called', () => {
    const service = new SSEService();
    const cb = vi.fn();

    const unsubscribe = service.subscribe(cb);
    unsubscribe();

    expect(service.subscriberCount).toBe(0);
  });

  it('broadcasts events to all subscribers', () => {
    const service = new SSEService();
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    service.subscribe(cb1);
    service.subscribe(cb2);

    const event = { type: 'orderUpdated' as const, data: { id: 'SH-001', status: 'confirmed' } };
    service.broadcast(event);

    expect(cb1).toHaveBeenCalledWith(event);
    expect(cb2).toHaveBeenCalledWith(event);
  });

  it('does not fail when a subscriber throws', () => {
    const service = new SSEService();
    const badCb = vi.fn().mockImplementation(() => { throw new Error('boom'); });
    const goodCb = vi.fn();

    service.subscribe(badCb);
    service.subscribe(goodCb);

    const event = { type: 'orderCreated' as const, data: { id: 'SH-002' } };
    expect(() => service.broadcast(event)).not.toThrow();
    expect(goodCb).toHaveBeenCalledWith(event);
  });

  it('does not broadcast to unsubscribed listeners', () => {
    const service = new SSEService();
    const cb = vi.fn();

    const unsubscribe = service.subscribe(cb);
    unsubscribe();

    service.broadcast({ type: 'orderDeleted' as const, data: { id: 'SH-003' } });

    expect(cb).not.toHaveBeenCalled();
  });

  it('allows multiple events to be broadcasted sequentially', () => {
    const service = new SSEService();
    const cb = vi.fn();

    service.subscribe(cb);

    service.broadcast({ type: 'orderCreated' as const, data: { id: '1' } });
    service.broadcast({ type: 'orderUpdated' as const, data: { id: '1', status: 'confirmed' } });

    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenNthCalledWith(1, { type: 'orderCreated', data: { id: '1' } });
    expect(cb).toHaveBeenNthCalledWith(2, { type: 'orderUpdated', data: { id: '1', status: 'confirmed' } });
  });
});
