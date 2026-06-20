// Repository: PostgreSQL Product storage
// Implements the ProductRepositoryPort from Application.

import type {
  ProductInput,
  ProductRepositoryPort,
  ProductRow,
} from '../../application/ports/ProductRepositoryPort.js';
import { query, queryOne } from '../database/connection.js';

export class ProductRepository implements ProductRepositoryPort {
  private rowToProduct(row: ProductRow) {
    return {
      id: row.id,
      name: row.name,
      category: row.category_id,
      price: row.price,
      description: row.description ?? '',
      available: row.available,
      preparationMinutes: row.preparation_minutes,
      customizationOptions: row.customization_options ?? [],
    };
  }

  async findAll(includeUnavailable = false): Promise<ProductRow[]> {
    const sql = includeUnavailable
      ? 'SELECT * FROM products ORDER BY category_id, name'
      : 'SELECT * FROM products WHERE available = true ORDER BY category_id, name';
    const rows = await query<ProductRow>(sql);
    return rows;
  }

  async findById(id: string): Promise<ProductRow | undefined> {
    return queryOne<ProductRow>(
      'SELECT * FROM products WHERE id = $1',
      [id]
    );
  }

  async findByCategory(categoryId: string, onlyAvailable = true): Promise<ProductRow[]> {
    const sql = onlyAvailable
      ? 'SELECT * FROM products WHERE category_id = $1 AND available = true ORDER BY name'
      : 'SELECT * FROM products WHERE category_id = $1 ORDER BY name';
    return query<ProductRow>(sql, [categoryId]);
  }

  async create(input: ProductInput): Promise<ProductRow> {
    await query(
      `INSERT INTO products (id, name, category_id, price, description, available, preparation_minutes, customization_options)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.id,
        input.name,
        input.categoryId,
        input.price,
        input.description ?? '',
        input.available ?? true,
        input.preparationMinutes ?? 25,
        input.customizationOptions ?? [],
      ]
    );
    const row = await this.findById(input.id);
    if (!row) throw new Error('Product not found after creation');
    return row;
  }

  async update(id: string, input: Partial<Omit<ProductInput, 'id'>>): Promise<ProductRow | undefined> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) { sets.push(`name = $${idx++}`); values.push(input.name); }
    if (input.categoryId !== undefined) { sets.push(`category_id = $${idx++}`); values.push(input.categoryId); }
    if (input.price !== undefined) { sets.push(`price = $${idx++}`); values.push(input.price); }
    if (input.description !== undefined) { sets.push(`description = $${idx++}`); values.push(input.description); }
    if (input.available !== undefined) { sets.push(`available = $${idx++}`); values.push(input.available); }
    if (input.preparationMinutes !== undefined) { sets.push(`preparation_minutes = $${idx++}`); values.push(input.preparationMinutes); }
    if (input.customizationOptions !== undefined) { sets.push(`customization_options = $${idx++}`); values.push(input.customizationOptions); }

    if (sets.length === 0) return this.findById(id);

    sets.push(`updated_at = NOW()`);
    values.push(id);

    await query(
      `UPDATE products SET ${sets.join(', ')} WHERE id = $${idx}`,
      values
    );
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await query('DELETE FROM products WHERE id = $1', [id]);
  }
}

export const productRepository = new ProductRepository();
