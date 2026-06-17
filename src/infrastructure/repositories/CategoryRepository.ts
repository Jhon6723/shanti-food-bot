// Repository: PostgreSQL Category storage

import { query, queryOne } from '../database/connection.js';

export interface CategoryRow {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface CategoryInput {
  id: string;
  name: string;
  sortOrder?: number;
}

export class CategoryRepository {
  async findAll(): Promise<CategoryRow[]> {
    return query<CategoryRow>(
      'SELECT * FROM categories ORDER BY sort_order, name'
    );
  }

  async findById(id: string): Promise<CategoryRow | undefined> {
    return queryOne<CategoryRow>(
      'SELECT * FROM categories WHERE id = $1',
      [id]
    );
  }

  async create(input: CategoryInput): Promise<CategoryRow> {
    await query(
      'INSERT INTO categories (id, name, sort_order) VALUES ($1, $2, $3)',
      [input.id, input.name, input.sortOrder ?? 0]
    );
    const row = await this.findById(input.id);
    if (!row) throw new Error('Category not found after creation');
    return row;
  }

  async update(id: string, input: Partial<Omit<CategoryInput, 'id'>>): Promise<CategoryRow | undefined> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) { sets.push(`name = $${idx++}`); values.push(input.name); }
    if (input.sortOrder !== undefined) { sets.push(`sort_order = $${idx++}`); values.push(input.sortOrder); }

    if (sets.length === 0) return this.findById(id);

    values.push(id);
    await query(
      `UPDATE categories SET ${sets.join(', ')} WHERE id = $${idx}`,
      values
    );
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await query('DELETE FROM categories WHERE id = $1', [id]);
  }

  async hasProducts(id: string): Promise<boolean> {
    const rows = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM products WHERE category_id = $1',
      [id]
    );
    return parseInt(rows[0].count, 10) > 0;
  }
}

export const categoryRepository = new CategoryRepository();
