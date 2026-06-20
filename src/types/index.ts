// Shared domain types — mirror of specs/openapi.yaml schemas

// Extend Express Request to carry raw body for webhook signature verification
declare global {
  namespace Express {
    interface Request {
      rawBody?: string;
    }
  }
}

export type OrderType = 'delivery' | 'pickup';
export type PaymentMethod = 'cash' | 'nequi';
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
export type ProductCategory = 'arroz_chino' | 'bandeja_paisa' | 'bebidas' | 'otros';

export interface CustomerData {
  name: string;
  phone: string;
  chatId?: string; // Original WhatsApp JID (e.g. 123@lid) for reply routing
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
  chatId?: string; // Original JID (e.g. 123@lid vs 123@c.us) for reply routing
}
