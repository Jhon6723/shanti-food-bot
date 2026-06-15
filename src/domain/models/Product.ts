// Domain Model: Product — menú de la arrocería
// Based on menu images provided by user

import type { ProductData, ProductCategory } from '../../types/index.js';

export class Product {
  id: string;
  name: string;
  category: ProductCategory;
  price: number;
  description: string;
  available: boolean;
  preparationMinutes: number;
  customizationOptions: string[];

  constructor(data: ProductData) {
    this.id = data.id;
    this.name = data.name;
    this.category = data.category;
    this.price = data.price;
    this.description = data.description ?? '';
    this.available = data.available ?? true;
    this.preparationMinutes = data.preparationMinutes ?? 25;
    this.customizationOptions = data.customizationOptions ?? [];
  }

  toJSON(): Omit<ProductData, 'customizationOptions'> & { available: boolean; preparationMinutes: number } {
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      price: this.price,
      description: this.description,
      available: this.available,
      preparationMinutes: this.preparationMinutes,
    };
  }
}

// Initial catalog based on menu images
export const ProductCatalog: Product[] = [
  // Arroces Chinos
  new Product({
    id: 'arroz-pollo',
    name: 'Arroz Chino de Pollo',
    category: 'arroz_chino',
    price: 18000,
    description: 'Arroz salteado con pollo, verduras y salsa de soya',
    preparationMinutes: 20,
    customizationOptions: ['sin cebolla', 'sin ají', 'extra pollo'],
  }),
  new Product({
    id: 'arroz-cerdo',
    name: 'Arroz Chino de Cerdo',
    category: 'arroz_chino',
    price: 20000,
    description: 'Arroz salteado con cerdo, verduras y salsa de soya',
    preparationMinutes: 20,
    customizationOptions: ['sin cebolla', 'sin ají'],
  }),
  new Product({
    id: 'arroz-camaron',
    name: 'Arroz Chino de Camarón',
    category: 'arroz_chino',
    price: 24000,
    description: 'Arroz salteado con camarón, verduras y salsa de soya',
    preparationMinutes: 25,
    customizationOptions: ['sin cebolla', 'sin ají'],
  }),
  new Product({
    id: 'arroz-especial',
    name: 'Arroz Chino Especial',
    category: 'arroz_chino',
    price: 28000,
    description: 'Arroz salteado con pollo, cerdo, camarón y verduras',
    preparationMinutes: 25,
    customizationOptions: ['sin cebolla', 'sin ají', 'extra pollo', 'extra camarón'],
  }),

  // Bandejas
  new Product({
    id: 'bandeja-paisa',
    name: 'Bandeja Paisa',
    category: 'bandeja_paisa',
    price: 22000,
    description: 'Arroz, frijoles, carne molida, chorizo, huevo, arepa y aguacate',
    preparationMinutes: 25,
    customizationOptions: ['sin huevo', 'sin chorizo'],
  }),
  new Product({
    id: 'bandeja-pollo',
    name: 'Bandeja de Pollo',
    category: 'bandeja_paisa',
    price: 20000,
    description: 'Arroz, frijoles, pechuga de pollo, ensalada y arepa',
    preparationMinutes: 22,
    customizationOptions: ['sin piel', 'pechuga desmechada'],
  }),

  // Bebidas
  new Product({
    id: 'coca-400',
    name: 'Coca-Cola 400ml',
    category: 'bebidas',
    price: 4000,
    description: 'Gaseosa Coca-Cola personal',
    preparationMinutes: 0,
  }),
  new Product({
    id: 'coca-1-5',
    name: 'Coca-Cola 1.5L',
    category: 'bebidas',
    price: 8000,
    description: 'Gaseosa Coca-Cola familiar',
    preparationMinutes: 0,
  }),
  new Product({
    id: 'jugo-natural',
    name: 'Jugo Natural',
    category: 'bebidas',
    price: 6000,
    description: 'Jugo de fruta natural del día',
    preparationMinutes: 5,
    customizationOptions: ['sin azúcar', 'con leche'],
  }),
];

export function getProductById(id: string): Product | undefined {
  return ProductCatalog.find((p) => p.id === id);
}

export function getProductByName(name: string): Product | undefined {
  const normalized = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return ProductCatalog.find((p) => {
    const productName = p.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return productName.includes(normalized) || normalized.includes(productName);
  });
}

export function getProductsByCategory(category: ProductCategory): Product[] {
  return ProductCatalog.filter((p) => p.category === category && p.available);
}

export function getAvailableProducts(): Product[] {
  return ProductCatalog.filter((p) => p.available);
}
