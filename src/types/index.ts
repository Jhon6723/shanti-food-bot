// Shared domain types — mirror of specs/openapi.yaml schemas

export type OrderType = 'delivery' | 'pickup';
export type PaymentMethod = 'cash' | 'nequi';
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
export type ProductCategory = 'arroz_chino' | 'bandeja_paisa' | 'bebidas' | 'otros';

export interface CustomerData {
  name: string;
  phone: string;
}

export interface OrderItemData {
  productId: string;
  quantity: number;
  customizations?: string[];
  notes?: string;
  unitPrice?: number;
  preparationMinutes?: number;
}

export interface OrderRequestData {
  customer: CustomerData;
  items: OrderItemData[];
  type: OrderType;
  address?: string;
  paymentMethod: PaymentMethod;
  notes?: string;
}

export interface ProductData {
  id: string;
  name: string;
  category: ProductCategory;
  price: number;
  description?: string;
  available?: boolean;
  preparationMinutes?: number;
  customizationOptions?: string[];
}

export interface WhatsAppMessage {
  type: 'text' | 'interactive' | 'location' | 'order';
  text?: { body: string };
  interactive?: {
    type: string;
    buttonReply?: Record<string, unknown>;
    listReply?: Record<string, unknown>;
  };
  location?: { latitude: number; longitude: number; address?: string };
}

export interface WhatsAppWebhookPayload {
  messageId: string;
  from: string;
  type: string;
  text?: { body: string };
  interactive?: WhatsAppMessage['interactive'];
}
