// Repository: PostgreSQL Order storage

import { Order } from '../../domain/models/Order.js';
import type { OrderStatus, OrderType } from '../../types/index.js';
import { query, queryOne } from '../database/connection.js';

export interface OrderFilters {
  status?: OrderStatus;
  type?: OrderType;
  customerPhone?: string;
}

export interface SalesReportFilters {
  from: string;
  to: string;
  status?: string;
  paymentMethod?: string;
  type?: string;
  page?: number;
  limit?: number;
}

export interface SalesReportOrder {
  id: string;
  date: string;
  customer: string;
  total: number;
  paymentMethod: string;
  type: string;
  status: string;
}

export interface SalesSummary {
  totalOrders: number;
  totalRevenue: number;
  totalDeliveryFees: number;
  averageOrderValue: number;
  byPaymentMethod: Array<{ method: string; count: number; revenue: number }>;
  byOrderType: Array<{ type: string; count: number; revenue: number }>;
  byDay: Array<{ date: string; count: number; revenue: number }>;
}

export interface SalesReportResult {
  summary: SalesSummary;
  orders: SalesReportOrder[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
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
  delivered_by: number | null;
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
      `INSERT INTO orders (id, customer_name, customer_phone, type, address, payment_method, status, notes, subtotal, delivery_fee, total, created_at, estimated_ready_at, delivered_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         notes = EXCLUDED.notes,
         subtotal = EXCLUDED.subtotal,
         delivery_fee = EXCLUDED.delivery_fee,
         total = EXCLUDED.total,
         delivered_by = EXCLUDED.delivered_by`,
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
        order.deliveredBy ?? null,
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

  async findAllPendingByCustomer(phone: string): Promise<Order[]> {
    const customerOrders = await this.findByCustomerPhone(phone);
    return customerOrders
      .filter((o) => ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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

  async findLastDeliveryAddress(phone: string): Promise<string | null> {
    const normalized = this.normalizePhone(phone);
    const row = await queryOne<{ address: string }>(
      `SELECT address FROM orders
       WHERE (customer_phone = $1 OR customer_phone = $2 OR customer_phone = $3)
         AND type = 'delivery'
         AND address IS NOT NULL AND address <> ''
       ORDER BY created_at DESC LIMIT 1`,
      [normalized, `+57${normalized}`, `57${normalized}`]
    );
    return row?.address ?? null;
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

  async getSalesReport(filters: SalesReportFilters): Promise<SalesReportResult> {
    const { from, to, status, paymentMethod, type } = filters;
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 10, 50);
    const offset = (page - 1) * limit;

    // Build dynamic WHERE clause
    const conditions = [
      `created_at::date >= $1`,
      `created_at::date <= $2`,
    ];
    const params: unknown[] = [from, to];
    let paramIdx = 3;

    if (status && status !== 'all') {
      conditions.push(`status = $${paramIdx++}`);
      params.push(status);
    }
    if (paymentMethod && paymentMethod !== 'all') {
      conditions.push(`payment_method = $${paramIdx++}`);
      params.push(paymentMethod);
    }
    if (type && type !== 'all') {
      conditions.push(`type = $${paramIdx++}`);
      params.push(type);
    }

    const where = conditions.join(' AND ');

    // Summary totals
    const totalsRow = await queryOne<{
      total_orders: string;
      total_revenue: string | null;
      total_delivery_fees: string | null;
      average_order_value: string | null;
    }>(
      `SELECT COUNT(*) as total_orders, SUM(total) as total_revenue,
              SUM(delivery_fee) as total_delivery_fees, AVG(total) as average_order_value
       FROM orders WHERE ${where}`,
      params
    );

    // By payment method
    const paymentRows = await query<{
      method: string;
      count: string;
      revenue: string | null;
    }>(
      `SELECT payment_method as method, COUNT(*) as count, SUM(total) as revenue
       FROM orders WHERE ${where}
       GROUP BY payment_method`,
      params
    );

    // By order type
    const typeRows = await query<{
      type: string;
      count: string;
      revenue: string | null;
    }>(
      `SELECT type, COUNT(*) as count, SUM(total) as revenue
       FROM orders WHERE ${where}
       GROUP BY type`,
      params
    );

    // By day
    const dayRows = await query<{
      date: string;
      count: string;
      revenue: string | null;
    }>(
      `SELECT created_at::date as date, COUNT(*) as count, SUM(total) as revenue
       FROM orders WHERE ${where}
       GROUP BY created_at::date
       ORDER BY date`,
      params
    );

    // Paginated orders
    const orderRows = await query<OrderRow>(
      `SELECT id, customer_name, created_at, total, payment_method, type, status
       FROM orders WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    // Total count for pagination
    const countRow = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM orders WHERE ${where}`,
      params
    );

    const total = parseInt(countRow?.count ?? '0', 10);

    const summary: SalesSummary = {
      totalOrders: parseInt(totalsRow?.total_orders ?? '0', 10),
      totalRevenue: parseInt(totalsRow?.total_revenue ?? '0', 10),
      totalDeliveryFees: parseInt(totalsRow?.total_delivery_fees ?? '0', 10),
      averageOrderValue: Math.round(parseFloat(totalsRow?.average_order_value ?? '0')),
      byPaymentMethod: paymentRows.map((r) => ({
        method: r.method,
        count: parseInt(r.count, 10),
        revenue: parseInt(r.revenue ?? '0', 10),
      })),
      byOrderType: typeRows.map((r) => ({
        type: r.type,
        count: parseInt(r.count, 10),
        revenue: parseInt(r.revenue ?? '0', 10),
      })),
      byDay: dayRows.map((r) => ({
        date: r.date,
        count: parseInt(r.count, 10),
        revenue: parseInt(r.revenue ?? '0', 10),
      })),
    };

    const orders: SalesReportOrder[] = orderRows.map((r) => ({
      id: r.id,
      date: r.created_at,
      customer: r.customer_name,
      total: r.total,
      paymentMethod: r.payment_method,
      type: r.type,
      status: r.status,
    }));

    return {
      summary,
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async rowToOrder(row: OrderRow): Promise<Order> {
    const itemRows = await query<OrderItemRow>(
      'SELECT product_id, quantity, customizations, notes, unit_price FROM order_items WHERE order_id = $1',
      [row.id]
    );

    const order = new Order({
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
    if (row.delivered_by) {
      order.deliveredBy = row.delivered_by;
    }
    return order;
  }
}

export const orderRepository = new OrderRepository();
