import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { OpenWAAdapter } from '../../src/infrastructure/whatsapp/openwa/OpenWAAdapter.js';

function makeReq(body: unknown): Request {
  return { body } as Request;
}

describe('OpenWAAdapter — parseIncoming', () => {
  const adapter = new OpenWAAdapter();

  it('extracts phone from @c.us JID', () => {
    const req = makeReq({
      event: 'message.received',
      data: {
        messageId: 'abc',
        chatId: '573123456789@c.us',
        from: '573123456789@c.us',
        body: 'Hola',
        type: 'text',
      },
    });
    const res = adapter.parseIncoming(req);
    expect(res).toHaveLength(1);
    expect(res[0].from).toBe('573123456789');
    expect(res[0].chatId).toBe('573123456789@c.us');
  });

  it('uses senderPhone when available (RESOLVE_LID_TO_PHONE)', () => {
    const req = makeReq({
      event: 'message.received',
      data: {
        messageId: 'abc',
        chatId: '178327646171353@lid',
        from: '178327646171353@lid',
        body: 'Hola',
        type: 'text',
        isLidSender: true,
        senderPhone: '573123456789',
      },
    });
    const res = adapter.parseIncoming(req);
    expect(res).toHaveLength(1);
    expect(res[0].from).toBe('573123456789');
    expect(res[0].chatId).toBe('178327646171353@lid');
  });

  it('falls back to LID when senderPhone is null', () => {
    const req = makeReq({
      event: 'message.received',
      data: {
        messageId: 'abc',
        chatId: '178327646171353@lid',
        from: '178327646171353@lid',
        body: 'Hola',
        type: 'text',
        isLidSender: true,
        senderPhone: null,
      },
    });
    const res = adapter.parseIncoming(req);
    expect(res).toHaveLength(1);
    expect(res[0].from).toBe('178327646171353');
  });

  it('ignores fromMe messages', () => {
    const req = makeReq({
      event: 'message.received',
      data: { fromMe: true, body: 'X' },
    });
    const res = adapter.parseIncoming(req);
    expect(res).toHaveLength(0);
  });

  it('ignores non-message.received events', () => {
    const req = makeReq({ event: 'session.status', data: {} });
    const res = adapter.parseIncoming(req);
    expect(res).toHaveLength(0);
  });
});
