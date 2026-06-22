export type UserRole = 'admin' | 'delivery';
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
export type OrderType = 'delivery' | 'pickup';
export type PaymentMethod = 'cash' | 'nequi';
export type AdminScreen = 'orders' | 'stats' | 'drivers' | 'menu';

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  categoryId: string;
  price: number;
  description?: string | null;
  available: boolean;
  preparationMinutes: number;
  customizationOptions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  productId: string;
  quantity: number;
  customizations: string[];
  notes?: string;
}

export interface Order {
  id: string;
  type: OrderType;
  customer: {
    name: string;
    phone: string;
  };
  address?: string;
  notes: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  createdAt: string;
  estimatedReadyAt: string;
  assignedDriver?: number;
}

export interface User {
  id: number;
  name: string;
  username: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}

export interface AuthPayload {
  token: string;
  role: UserRole;
  name: string;
  userId: number;
}

export interface DashboardStats {
  total: number;
  pending: number;
  confirmed: number;
  preparing: number;
  ready: number;
  delivered: number;
  cancelled: number;
  todayRevenue: number;
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

export interface SalesReportOrder {
  id: string;
  date: string;
  customer: string;
  total: number;
  paymentMethod: string;
  type: string;
  status: string;
}

export interface SalesReport {
  summary: SalesSummary;
  orders: SalesReportOrder[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ReportFilters {
  from: string;
  to: string;
  status?: string;
  paymentMethod?: string;
  type?: string;
}

export interface DriverStats {
  user: { id: number; name: string; username: string };
  totalDelivered: number;
  deliveredLast30Days: number;
  totalAmount: number;
  recentOrders: Array<{
    id: string;
    total: number;
    created_at: string;
    customer_name: string;
  }>;
}

export interface ToastState {
  message: string;
  type: 'success' | 'error';
  visible: boolean;
}

export const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-blue-100 text-blue-700',
  preparing: 'bg-orange-100 text-orange-700',
  ready: 'bg-emerald-100 text-emerald-700',
  delivered: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-red-100 text-red-600',
};

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  preparing: 'Preparando',
  ready: 'Listo',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

export const formatCOP = (amount: number): string =>
  `$${amount.toLocaleString('es-CO')}`;

export const formatTime = (isoString: string): string =>
  new Date(isoString).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

export const formatDate = (isoString: string): string =>
  new Date(isoString).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
  });

export const getNextAction = (
  status: OrderStatus
): { label: string; next: OrderStatus } | null => {
  const actions: Partial<Record<OrderStatus, { label: string; next: OrderStatus }>> = {
    pending: { label: 'Confirmar', next: 'confirmed' },
    confirmed: { label: 'En cocina', next: 'preparing' },
    preparing: { label: 'Marcar listo', next: 'ready' },
    ready: { label: 'Entregado', next: 'delivered' },
  };
  return actions[status] ?? null;
};
