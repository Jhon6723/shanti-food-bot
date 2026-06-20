// Application Service: OrderService
// Mediates between API Routes (Presentation) and OrderRepository (Infrastructure).
// Implements specs/ARCHITECTURE.md § Dependency Rules.

import { Order } from '../domain/models/Order.js';
import { orderRepository } from '../infrastructure/repositories/OrderRepository.js';
import type {
    OrderFilters,
    OrderRepositoryPort,
    SalesReportFilters,
    SalesReportResult,
} from './ports/OrderRepositoryPort.js';

export class OrderService {
  constructor(private readonly repo: OrderRepositoryPort) {}

  async createOrder(order: Order): Promise<Order> {
    return this.repo.save(order);
  }

  async getOrders(filters: OrderFilters = {}): Promise<Order[]> {
    return this.repo.findAll(filters);
  }

  async getOrderById(id: string): Promise<Order | undefined> {
    return this.repo.findById(id);
  }

  async updateOrder(order: Order): Promise<Order> {
    return this.repo.update(order);
  }

  async deleteOrder(id: string): Promise<boolean> {
    return this.repo.delete(id);
  }

  async getDashboardStats(): Promise<ReturnType<OrderRepositoryPort['getStats']>> {
    return this.repo.getStats();
  }

  async getSalesReport(filters: SalesReportFilters): Promise<SalesReportResult> {
    return this.repo.getSalesReport(filters);
  }
}

export const orderService = new OrderService(orderRepository);
