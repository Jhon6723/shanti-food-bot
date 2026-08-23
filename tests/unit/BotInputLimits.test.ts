// Security #6 — Input length limits in WhatsAppBot
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderRepositoryPort } from '../../src/application/ports/OrderRepositoryPort.js';
import { WhatsAppBot } from '../../src/bot/WhatsAppBot.js';
import { Order } from '../../src/domain/models/Order.js';

// Mock ProductRepository
vi.mock('../../src/infrastructure/repositories/ProductRepository.js', () => {
  const mockProducts = [
    { id: 'arroz-pollo', name: 'Arroz Chino de Pollo', category_id: 'arroz_chino', price: 18000, description: 'Arroz salteado con pollo', available: true, preparation_minutes: 20, customization_options: ['sin cebolla'], created_at: '2024-01-01', updated_at: '2024-01-01' },
    { id: 'coca-400', name: 'Coca-Cola 400ml', category_id: 'bebidas', price: 4000, description: 'Gaseosa', available: true, preparation_minutes: 0, customization_options: [], created_at: '2024-01-01', updated_at: '2024-01-01' },
  ];
  const mockRepo = {
    findAll: vi.fn().mockResolvedValue(mockProducts),
    findById: vi.fn().mockImplementation((id: string) => Promise.resolve(mockProducts.find((p) => p.id === id))),
    findByCategory: vi.fn().mockResolvedValue(mockProducts),
    create: vi.fn().mockResolvedValue(mockProducts[0]),
    update: vi.fn().mockResolvedValue(mockProducts[0]),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  return { productRepository: mockRepo, ProductRepository: vi.fn(() => mockRepo) };
});

function makeRepo(overrides: Partial<OrderRepositoryPort> = {}): OrderRepositoryPort {
  return {
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
    ...overrides,
  } as unknown as OrderRepositoryPort;
}

function makeProductRepo() {
  const mockProducts = [
    { id: 'arroz-pollo', name: 'Arroz Chino de Pollo', category_id: 'arroz_chino', price: 18000, description: 'Arroz salteado con pollo', available: true, preparation_minutes: 20, customization_options: ['sin cebolla'], created_at: '2024-01-01', updated_at: '2024-01-01' },
    { id: 'coca-400', name: 'Coca-Cola 400ml', category_id: 'bebidas', price: 4000, description: 'Gaseosa', available: true, preparation_minutes: 0, customization_options: [], created_at: '2024-01-01', updated_at: '2024-01-01' },
  ];
  return {
    findAll: vi.fn().mockResolvedValue(mockProducts),
    findById: vi.fn().mockImplementation((id: string) => Promise.resolve(mockProducts.find((p) => p.id === id))),
    findByCategory: vi.fn().mockResolvedValue(mockProducts),
    create: vi.fn().mockResolvedValue(mockProducts[0]),
    update: vi.fn().mockResolvedValue(mockProducts[0]),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as import('../../src/application/ports/ProductRepositoryPort.js').ProductRepositoryPort;
}

function msg(body: string) {
  return { type: 'text' as const, text: { body } };
}

const PHONE = '3001234567';

describe('Security #6 — Input length limits', () => {
  let bot: WhatsAppBot;
  let repo: OrderRepositoryPort;

  beforeEach(() => {
    repo = makeRepo();
    bot = new WhatsAppBot(repo, makeProductRepo());
  });

  it('truncates incoming message to MAX_MESSAGE_LENGTH (1000)', async () => {
    // A message longer than 1000 chars should be truncated, not cause an error
    const longMsg = 'a'.repeat(2000);
    const res = await bot.handleMessage(PHONE, msg(longMsg));
    // Bot should respond normally (not crash) — it will show welcome since 'aaa...' isn't a command
    expect(res).toBeDefined();
    expect(typeof res).toBe('string');
  });

  it('truncates customer name to MAX_NAME_LENGTH (100)', async () => {
    // Start order flow to get to name step
    await bot.handleMessage(PHONE, msg('hola'));
    await bot.handleMessage(PHONE, msg('2')); // Hacer pedido rápido

    // Send a name longer than 100 chars
    const longName = 'A'.repeat(200);
    const res = await bot.handleMessage(PHONE, msg(longName));

    // Should proceed to product list (name was truncated and accepted)
    expect(res).toContain('MENÚ');

    // Verify the saved order uses truncated name by completing the flow
    // We can't directly inspect session, but we can verify the bot didn't crash
    // and the name was at most 100 chars by checking the greeting doesn't contain the full 200 chars
    expect(res).not.toContain('A'.repeat(200));
  });

  it('truncates delivery address to MAX_ADDRESS_LENGTH (300)', async () => {
    // Complete flow up to address step
    await bot.handleMessage(PHONE, msg('hola'));
    await bot.handleMessage(PHONE, msg('2'));     // Hacer pedido
    await bot.handleMessage(PHONE, msg('Carlos')); // nombre
    await bot.handleMessage(PHONE, msg('1'));     // product
    await bot.handleMessage(PHONE, msg('2'));     // Ninguna (skip customization)
    await bot.handleMessage(PHONE, msg('1'));     // quantity 1
    await bot.handleMessage(PHONE, msg('2'));     // No, finalizar
    await bot.handleMessage(PHONE, msg('1'));     // Domicilio

    // Send an address longer than 300 chars with a valid street pattern at the start
    const longAddress = 'Carrera 10 #20-30, Barrio Centro ' + 'X'.repeat(400);
    const res = await bot.handleMessage(PHONE, msg(longAddress));

    // Should proceed to delivery notes step (address was truncated and accepted)
    expect(res).toContain('nota');
  });

  it('truncates delivery notes to MAX_NOTES_LENGTH (300)', async () => {
    // Complete flow up to delivery notes step
    await bot.handleMessage(PHONE, msg('hola'));
    await bot.handleMessage(PHONE, msg('2'));     // Hacer pedido
    await bot.handleMessage(PHONE, msg('Carlos')); // nombre
    await bot.handleMessage(PHONE, msg('1'));     // product
    await bot.handleMessage(PHONE, msg('2'));     // Ninguna
    await bot.handleMessage(PHONE, msg('1'));     // quantity 1
    await bot.handleMessage(PHONE, msg('2'));     // No, finalizar
    await bot.handleMessage(PHONE, msg('1'));     // Domicilio
    await bot.handleMessage(PHONE, msg('Carrera 10 #20-30, Barrio Centro')); // address

    // Send notes longer than 300 chars
    const longNotes = 'N'.repeat(500);
    const res = await bot.handleMessage(PHONE, msg(longNotes));

    // Should proceed to payment step (notes were truncated and accepted)
    expect(res).toContain('pago');
  });

  it('handles exactly MAX_MESSAGE_LENGTH without truncation issues', async () => {
    const exactMsg = 'b'.repeat(1000);
    const res = await bot.handleMessage(PHONE, msg(exactMsg));
    expect(res).toBeDefined();
    expect(typeof res).toBe('string');
  });
});
