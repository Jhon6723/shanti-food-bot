import { describe, it, expect } from 'vitest';
import {
  ProductCatalog,
  getProductById,
  getProductByName,
  getProductsByCategory,
  getAvailableProducts,
  Product,
} from '../../src/domain/models/Product.js';

describe('Product', () => {
  it('applies defaults correctly', () => {
    const p = new Product({ id: 'test', name: 'Test', category: 'otros', price: 5000 });
    expect(p.available).toBe(true);
    expect(p.preparationMinutes).toBe(25);
    expect(p.customizationOptions).toEqual([]);
    expect(p.description).toBe('');
  });

  it('toJSON omits customizationOptions', () => {
    const p = new Product({ id: 'test', name: 'Test', category: 'otros', price: 5000, customizationOptions: ['sin sal'] });
    const json = p.toJSON();
    expect(json).not.toHaveProperty('customizationOptions');
    expect(json.id).toBe('test');
  });
});

describe('ProductCatalog', () => {
  it('has at least 9 products', () => {
    expect(ProductCatalog.length).toBeGreaterThanOrEqual(9);
  });

  it('all products have positive prices', () => {
    for (const p of ProductCatalog) {
      expect(p.price).toBeGreaterThan(0);
    }
  });

  it('all products have valid categories', () => {
    const valid = ['arroz_chino', 'bandeja_paisa', 'bebidas', 'otros'];
    for (const p of ProductCatalog) {
      expect(valid).toContain(p.category);
    }
  });
});

describe('getProductById', () => {
  it('returns product for known id', () => {
    const p = getProductById('arroz-pollo');
    expect(p).toBeDefined();
    expect(p!.name).toBe('Arroz Chino de Pollo');
  });

  it('returns undefined for unknown id', () => {
    expect(getProductById('no-existe')).toBeUndefined();
  });
});

describe('getProductByName', () => {
  it('finds by exact name (case insensitive)', () => {
    const p = getProductByName('arroz chino de pollo');
    expect(p?.id).toBe('arroz-pollo');
  });

  it('finds by partial name', () => {
    const p = getProductByName('camarón');
    expect(p?.id).toBe('arroz-camaron');
  });

  it('finds ignoring accents', () => {
    const p = getProductByName('camaron');
    expect(p?.id).toBe('arroz-camaron');
  });

  it('returns undefined for unknown name', () => {
    expect(getProductByName('pizza')).toBeUndefined();
  });
});

describe('getProductsByCategory', () => {
  it('returns only arroz_chino products', () => {
    const products = getProductsByCategory('arroz_chino');
    expect(products.length).toBeGreaterThan(0);
    for (const p of products) {
      expect(p.category).toBe('arroz_chino');
    }
  });

  it('returns only available products', () => {
    const products = getProductsByCategory('bebidas');
    for (const p of products) {
      expect(p.available).toBe(true);
    }
  });

  it('returns empty array for category with no products', () => {
    const products = getProductsByCategory('otros');
    expect(products).toEqual([]);
  });
});

describe('getAvailableProducts', () => {
  it('returns all available products', () => {
    const products = getAvailableProducts();
    for (const p of products) {
      expect(p.available).toBe(true);
    }
  });

  it('products are numbered consistently 1-N in the bot menu', () => {
    const products = getAvailableProducts();
    expect(products[0].id).toBe('arroz-pollo');
    expect(products[products.length - 1].id).toBe('jugo-natural');
  });
});
