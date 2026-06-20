import { describe, expect, it } from 'vitest';
import { OrderRepository } from '../../src/infrastructure/repositories/OrderRepository.js';
import { ProductRepository } from '../../src/infrastructure/repositories/ProductRepository.js';
import type { OrderRepositoryPort } from '../../src/application/ports/OrderRepositoryPort.js';
import type { ProductRepositoryPort } from '../../src/application/ports/ProductRepositoryPort.js';

describe('Repository Ports', () => {
  it('OrderRepository satisfies OrderRepositoryPort', () => {
    const repo: OrderRepositoryPort = new OrderRepository();
    expect(repo).toBeDefined();
    expect(typeof repo.save).toBe('function');
    expect(typeof repo.findById).toBe('function');
    expect(typeof repo.findAll).toBe('function');
    expect(typeof repo.update).toBe('function');
    expect(typeof repo.delete).toBe('function');
    expect(typeof repo.getStats).toBe('function');
    expect(typeof repo.getSalesReport).toBe('function');
  });

  it('ProductRepository satisfies ProductRepositoryPort', () => {
    const repo: ProductRepositoryPort = new ProductRepository();
    expect(repo).toBeDefined();
    expect(typeof repo.findAll).toBe('function');
    expect(typeof repo.findById).toBe('function');
    expect(typeof repo.findByCategory).toBe('function');
    expect(typeof repo.create).toBe('function');
    expect(typeof repo.update).toBe('function');
    expect(typeof repo.delete).toBe('function');
  });
});
