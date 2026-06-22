import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { WebhookService } from '../../src/application/WebhookService.js';
import { WhatsAppBot } from '../../src/bot/WhatsAppBot.js';
import type { WhatsAppAdapter } from '../../src/infrastructure/whatsapp/adapter.js';

function makeAdapter(overrides: Partial<WhatsAppAdapter> = {}): WhatsAppAdapter {
  return {
    name: 'test',
    parseIncoming: vi.fn().mockReturnValue([]),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    verifyRequest: vi.fn().mockReturnValue(true),
    ...overrides,
  };
}

function makeBot(): WhatsAppBot {
  const orderRepo = {
    save: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(undefined),
    findAll: vi.fn().mockResolvedValue([]),
    findByCustomerPhone: vi.fn().mockResolvedValue([]),
    findPendingByCustomer: vi.fn().mockResolvedValue(undefined),
    getCustomerNameByPhone: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(false),
    getStats: vi.fn().mockResolvedValue({}),
    findLastDeliveryAddress: vi.fn().mockResolvedValue(null),
    findAllPendingByCustomer: vi.fn().mockResolvedValue([]),
    getSalesReport: vi.fn().mockResolvedValue({ summary: {}, orders: [], pagination: {} }),
  };
  const productRepo = {
    findAll: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(undefined),
    findByCategory: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  return new WhatsAppBot(orderRepo as unknown as ConstructorParameters<typeof WhatsAppBot>[0], productRepo as unknown as ConstructorParameters<typeof WhatsAppBot>[1]);
}

function makeReq(body: unknown): Request {
  return { body } as Request;
}

describe('WebhookService', () => {
  it('returns early if verifyRequest fails', async () => {
    const adapter = makeAdapter({
      verifyRequest: vi.fn().mockReturnValue(false),
      parseIncoming: vi.fn().mockReturnValue([{ from: '3001234567', messageId: '1', type: 'text', text: { body: 'hola' } }]),
    });
    const bot = makeBot();
    vi.spyOn(bot, 'handleMessage').mockResolvedValue('');
    const service = new WebhookService(adapter, bot);

    await service.process(makeReq({}));

    expect(adapter.parseIncoming).not.toHaveBeenCalled();
    expect(bot.handleMessage).not.toHaveBeenCalled();
  });

  it('processes incoming messages and sends replies', async () => {
    const adapter = makeAdapter({
      parseIncoming: vi.fn().mockReturnValue([
        { from: '3001234567', messageId: 'msg-1', type: 'text', text: { body: 'hola' }, chatId: '3001234567@c.us' },
      ]),
    });
    const bot = makeBot();
    vi.spyOn(bot, 'handleMessage').mockResolvedValue('Welcome!');
    const service = new WebhookService(adapter, bot);

    await service.process(makeReq({}));

    expect(adapter.parseIncoming).toHaveBeenCalled();
    expect(bot.handleMessage).toHaveBeenCalledWith(
      '3001234567',
      { type: 'text', text: { body: 'hola' }, interactive: undefined },
      '3001234567@c.us'
    );
    expect(adapter.sendMessage).toHaveBeenCalledWith('3001234567', 'Welcome!', { chatId: '3001234567@c.us' });
  });
});
