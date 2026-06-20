// Port: ProductRepositoryPort
// Defines the contract that any product storage implementation must satisfy.
// The bot and application services depend only on this interface,
// never on the concrete repository from Infrastructure.

export interface ProductRow {
  id: string;
  name: string;
  category_id: string;
  price: number;
  description: string | null;
  available: boolean;
  preparation_minutes: number;
  customization_options: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface ProductInput {
  id: string;
  name: string;
  categoryId: string;
  price: number;
  description?: string;
  available?: boolean;
  preparationMinutes?: number;
  customizationOptions?: string[];
}

export interface ProductRepositoryPort {
  findAll(includeUnavailable?: boolean): Promise<ProductRow[]>;
  findById(id: string): Promise<ProductRow | undefined>;
  findByCategory(categoryId: string, onlyAvailable?: boolean): Promise<ProductRow[]>;
  create(input: ProductInput): Promise<ProductRow>;
  update(id: string, input: Partial<Omit<ProductInput, 'id'>>): Promise<ProductRow | undefined>;
  delete(id: string): Promise<void>;
}
