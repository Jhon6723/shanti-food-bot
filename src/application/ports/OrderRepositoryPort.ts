// Port: OrderRepositoryPort
// Defines the contract that any order storage implementation must satisfy.
// The bot and application services depend only on this interface,
// never on the concrete repository from Infrastructure.

import type { Order } from '../../domain/models/Order.js';
import type { OrderStatus, OrderType } from '../../types/index.js';

export interface OrderFilters {
  status?: OrderStatus;
  type?: OrderType;
  customerPhone?: string;
  assignedDriver?: number;
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
  cancelledOrders: number;
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

export interface OrderRepositoryPort {
  save(order: Order): Promise<Order>;
  findById(id: string): Promise<Order | undefined>;
  findAll(filters?: OrderFilters): Promise<Order[]>;
  findByCustomerPhone(phone: string): Promise<Order[]>;
  findPendingByCustomer(phone: string): Promise<Order | undefined>;
  findAllPendingByCustomer(phone: string): Promise<Order[]>;
  getCustomerNameByPhone(phone: string): Promise<string | null>;
  findLastDeliveryAddress(phone: string): Promise<string | null>;
  update(order: Order): Promise<Order>;
  delete(id: string): Promise<boolean>;
  getStats(): Promise<{
    total: number;
    pending: number;
    confirmed: number;
    preparing: number;
    ready: number;
    delivered: number;
    cancelled: number;
    todayRevenue: number;
  }>;
  getSalesReport(filters: SalesReportFilters): Promise<SalesReportResult>;
}
