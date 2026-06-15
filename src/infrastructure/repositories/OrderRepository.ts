// Repository: PostgreSQL Order storage

import { Order } from '../../domain/models/Order.js';
import type { OrderStatus, OrderType } from '../../types/index.js';
import { query, queryOne } from '../database/connection.js';

export interface OrderFilters {
  status?: OrderStatus;
  type?: OrderType;
  customerPhone?: string;
}

interface OrderRow {
  id: string;
  customer_name: string;
  customer_phone: string;
  type: OrderType;
  address: string | null;
  payment_method: string;
  status: OrderStatus;
  notes: string | null;
  subtotal: number;
  delivery_fee: number;
  total: number;
  created_at: string;
  estimated_ready_at: string | null;
}

interface OrderItemRow {
  product_id: string;
  quantity: number;
  customizations: string[] | null;
  notes: string | null;
  unit_price: number;
}

export class OrderRepository {
  async save(order: Order): Promise<Order> {
    // Insert order
    await query(
      `INSERT INTO orders (id, customer_name, customer_phone, type, address, payment_method, status, notes, subtotal, delivery_fee, total, created_at, estimated_ready_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         notes = EXCLUDED.notes,
         subtotal = EXCLUDED.subtotal,
         delivery_fee = EXCLUDED.delivery_fee,
         total = EXCLUDED.total`,
      [
        order.id,
        order.customer.name,
        order.customer.phone,
        order.type,
        order.address ?? null,
        order.paymentMethod,
        order.status,
        order.notes || null,
        order.subtotal,
        order.deliveryFee,
        order.total,
        order.createdAt,
        order.estimatedReadyAt ?? null,
      ]
    );

    // Insert items (delete old ones first on upsert)
    await query('DELETE FROM order_items WHERE order_id = $1', [order.id]);
    for (const item of order.items) {
      await query(
        `INSERT INTO order_items (order_id, product_id, quantity, customizations, notes, unit_price)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          order.id,
          item.productId,
          item.quantity,
          item.customizations.length > 0 ? item.customizations : null,
          item.notes || null,
          item.unitPrice,
        ]
      );
    }

    return order;
  }

  async findById(id: string): Promise<Order | undefined> {
    const row = await queryOne<OrderRow>(
      'SELECT * FROM orders WHERE id = $1',
      [id]
    );
    if (!row) return undefined;
    return this.rowToOrder(row);
  }

  async findAll(filters: OrderFilters = {}): Promise<Order[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters.status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(filters.status);
    }
    if (filters.type) {
      conditions.push(`type = $${paramIdx++}`);
      params.push(filters.type);
    }
    if (filters.customerPhone) {
      const normalized = filters.customerPhone.replace(/^57/, '').replace(/\D/g, '');
      conditions.push(`(customer_phone = $${paramIdx} OR customer_phone = $${paramIdx + 1} OR customer_phone = $${paramIdx + 2})`);
      params.push(normalized, `+57${normalized}`, `57${normalized}`);
      paramIdx += 3;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await query<OrderRow>(
      `SELECT * FROM orders ${where} ORDER BY created_at DESC`,
      params
    );

    const orders: Order[] = [];
    for (const row of rows) {
      orders.push(await this.rowToOrder(row));
    }
    return orders;
  }

  async findByCustomerPhone(phone: string): Promise<Order[]> {
    const normalized = phone.replace(/^57/, '').replace(/\D/g, '');
    return this.findAll({ customerPhone: normalized });
  }

  async findPendingByCustomer(phone: string): Promise<Order | undefined> {
    const customerOrders = await this.findByCustomerPhone(phone);
    return customerOrders.find((o) => ['pending', 'confirmed', 'preparing'].includes(o.status));
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/^57/, '').replace(/\D/g, '');
  }

  async getCustomerNameByPhone(phone: string): Promise<string | null> {
    const normalized = this.normalizePhone(phone);
    const row = await queryOne<{ customer_name: string }>(
      `SELECT customer_name FROM orders
       WHERE customer_phone = $1 OR customer_phone = $2 OR customer_phone = $3
       ORDER BY created_at DESC LIMIT 1`,
      [normalized, `+57${normalized}`, `57${normalized}`]
    );
    return row?.customer_name ?? null;
  }

  async update(order: Order): Promise<Order> {
    return this.save(order);
  }

  async delete(id: string): Promise<boolean> {
    const result = await query('DELETE FROM orders WHERE id = $1 RETURNING id', [id]);
    return result.length > 0;
  }

  async getStats(): Promise<{
    total: number;
    pending: number;
    confirmed: number;
    preparing: number;
    ready: number;
    delivered: number;
    cancelled: number;
    todayRevenue: number;
  }> {
    const totalRow = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM orders');
    const statusRows = await query<{ status: OrderStatus; count: string }>(
      'SELECT status, COUNT(*) as count FROM orders GROUP BY status'
    );
    const todayRevenueRow = await queryOne<{ sum: string | null }>(
      `SELECT SUM(total) as sum FROM orders WHERE status = 'delivered' AND created_at >= CURRENT_DATE`
    );

    const byStatus = new Map<OrderStatus, number>();
    for (const row of statusRows) {
      byStatus.set(row.status, parseInt(row.count, 10));
    }

    return {
      total: parseInt(totalRow?.count ?? '0', 10),
      pending: byStatus.get('pending') ?? 0,
      confirmed: byStatus.get('confirmed') ?? 0,
      preparing: byStatus.get('preparing') ?? 0,
      ready: byStatus.get('ready') ?? 0,
      delivered: byStatus.get('delivered') ?? 0,
      cancelled: byStatus.get('cancelled') ?? 0,
      todayRevenue: parseInt(todayRevenueRow?.sum ?? '0', 10),
    };
  }

  private async rowToOrder(row: OrderRow): Promise<Order> {
    const itemRows = await query<OrderItemRow>(
      'SELECT product_id, quantity, customizations, notes, unit_price FROM order_items WHERE order_id = $1',
      [row.id]
    );

    return new Order({
      id: row.id,
      customer: { name: row.customer_name, phone: row.customer_phone },
      items: itemRows.map((ir) => ({
        productId: ir.product_id,
        quantity: ir.quantity,
        customizations: ir.customizations ?? [],
        notes: ir.notes ?? '',
        unitPrice: ir.unit_price,
      })),
      type: row.type,
      address: row.address ?? undefined,
      paymentMethod: row.payment_method as 'cash' | 'nequi',
      status: row.status,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      estimatedReadyAt: row.estimated_ready_at ?? undefined,
    });
  }
}

export const orderRepository = new OrderRepository();
