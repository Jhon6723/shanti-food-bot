// Domain Model: Order — based on specs/openapi.yaml

import type {
  OrderType,
  PaymentMethod,
  OrderStatus,
  CustomerData,
  OrderItemData,
  OrderRequestData,
} from '../../types/index.js';

export class Order {
  id: string;
  customer: Customer;
  items: OrderItem[];
  type: OrderType;
  address?: string;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  notes: string;
  createdAt: string;
  estimatedReadyAt: string;
  subtotal: number;
  deliveryFee: number;
  total: number;

  constructor(data: OrderRequestData & { id?: string; status?: OrderStatus; createdAt?: string; estimatedReadyAt?: string }) {
    this.id = data.id ?? generateOrderId();
    this.customer = new Customer(data.customer);
    this.items = data.items.map((item) => new OrderItem(item));
    this.type = data.type;
    this.address = data.address;
    this.paymentMethod = data.paymentMethod;
    this.status = data.status ?? 'pending';
    this.notes = data.notes ?? '';
    this.createdAt = data.createdAt ?? new Date().toISOString();
    this.estimatedReadyAt = data.estimatedReadyAt ?? this.calculateEstimatedTime();

    this.subtotal = this.calculateSubtotal();
    this.deliveryFee = this.type === 'delivery' ? 3000 : 0;
    this.total = this.subtotal + this.deliveryFee;
  }

  private calculateSubtotal(): number {
    return this.items.reduce((sum, item) => sum + item.total, 0);
  }

  private calculateEstimatedTime(): string {
    const maxPrepTime = Math.max(...this.items.map((i) => i.preparationMinutes ?? 25));
    const estimated = new Date();
    estimated.setMinutes(estimated.getMinutes() + maxPrepTime);
    return estimated.toISOString();
  }

  confirm(): this {
    if (this.status !== 'pending') {
      throw new Error('Only pending orders can be confirmed');
    }
    this.status = 'confirmed';
    return this;
  }

  prepare(): this {
    if (this.status !== 'confirmed') {
      throw new Error('Order must be confirmed before preparing');
    }
    this.status = 'preparing';
    return this;
  }

  markReady(): this {
    if (this.status !== 'preparing') {
      throw new Error('Order must be in preparation');
    }
    this.status = 'ready';
    return this;
  }

  deliver(): this {
    if (this.status !== 'ready') {
      throw new Error('Order must be ready before delivery');
    }
    this.status = 'delivered';
    return this;
  }

  cancel(): this {
    const finalStatuses: OrderStatus[] = ['delivered', 'cancelled'];
    if (finalStatuses.includes(this.status)) {
      throw new Error('Cannot cancel finished order');
    }
    this.status = 'cancelled';
    return this;
  }

  toJSON(): {
    id: string;
    customer: ReturnType<Customer['toJSON']>;
    items: ReturnType<OrderItem['toJSON']>[];
    type: OrderType;
    address?: string;
    paymentMethod: PaymentMethod;
    subtotal: number;
    deliveryFee: number;
    total: number;
    status: OrderStatus;
    notes: string;
    createdAt: string;
    estimatedReadyAt: string;
  } {
    return {
      id: this.id,
      customer: this.customer.toJSON(),
      items: this.items.map((i) => i.toJSON()),
      type: this.type,
      address: this.address,
      paymentMethod: this.paymentMethod,
      subtotal: this.subtotal,
      deliveryFee: this.deliveryFee,
      total: this.total,
      status: this.status,
      notes: this.notes,
      createdAt: this.createdAt,
      estimatedReadyAt: this.estimatedReadyAt,
    };
  }
}

export class Customer {
  name: string;
  phone: string;

  constructor(data: CustomerData) {
    this.name = data.name;
    this.phone = this.normalizePhone(data.phone);
  }

  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    return digits.startsWith('57') ? `+${digits}` : `+57${digits}`;
  }

  toJSON(): { name: string; phone: string } {
    return { name: this.name, phone: this.phone };
  }
}

export class OrderItem {
  productId: string;
  quantity: number;
  customizations: string[];
  notes: string;
  unitPrice: number;
  preparationMinutes: number;
  total: number;

  constructor(data: OrderItemData) {
    this.productId = data.productId;
    this.quantity = data.quantity;
    this.customizations = data.customizations ?? [];
    this.notes = data.notes ?? '';
    this.unitPrice = data.unitPrice ?? 0;
    this.preparationMinutes = data.preparationMinutes ?? 25;
    this.total = this.unitPrice * this.quantity;
  }

  toJSON(): Omit<OrderItemData, 'unitPrice' | 'preparationMinutes'> {
    return {
      productId: this.productId,
      quantity: this.quantity,
      customizations: this.customizations,
      notes: this.notes,
    };
  }
}

function generateOrderId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `SH-${timestamp}${random}`;
}
