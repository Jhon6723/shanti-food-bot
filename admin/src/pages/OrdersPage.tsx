import { LogOut, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { OrderDetailModal } from '../components/OrderDetailModal';
import { SkeletonCard } from '../components/SkeletonLoader';
import { useOrdersWithSound, useUpdateOrder } from '../hooks/useOrders';
import {
    formatCOP,
    formatTime,
    getNextAction,
    Order,
    OrderStatus,
    STATUS_COLORS,
    STATUS_LABELS,
    ToastState,
} from '../lib/types';

type FilterType = 'all' | OrderStatus;

const FILTERS: { id: FilterType; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'pending', label: 'Pendiente' },
  { id: 'confirmed', label: 'Confirmado' },
  { id: 'preparing', label: 'Preparando' },
  { id: 'ready', label: 'Listo' },
];

interface Props {
  onToast: (msg: string, type: ToastState['type']) => void;
  onLogout: () => void;
}

export function OrdersPage({ onToast, onLogout }: Props) {
  const { data: orders = [], isLoading, refetch } = useOrdersWithSound();
  const updateOrder = useUpdateOrder();
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const pendingCount = orders.filter((o) => o.status === 'pending').length;

  const filteredOrders = activeFilter === 'all'
    ? orders
    : orders.filter((o) => o.status === activeFilter);

  const handleQuickAction = async (e: React.MouseEvent, order: Order) => {
    e.stopPropagation();
    const next = getNextAction(order.status);
    if (!next) return;
    try {
      await updateOrder.mutateAsync({ id: order.id, data: { status: next.next } });
      onToast(next.label, 'success');
    } catch {
      onToast('No se pudo actualizar el pedido. Intenta de nuevo.', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white sticky top-0 z-30 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <div className="max-w-[480px] mx-auto px-4 pt-12 pb-0">
          <div className="relative flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h1 className="text-slate-900 text-xl font-semibold">Pedidos</h1>
              {pendingCount > 0 && (
                <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full leading-none">
                  {pendingCount}
                </span>
              )}
            </div>
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="absolute left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 active:scale-90 transition-transform disabled:opacity-50"
            >
              <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 text-slate-400 hover:text-slate-600 text-sm transition-colors"
            >
              <LogOut size={16} />
              <span>Salir</span>
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-3 -mx-4 px-4">
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                onClick={() => setActiveFilter(filter.id)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm transition-all ${
                  activeFilter === filter.id
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[480px] mx-auto px-4 py-4 space-y-3 pb-24">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="text-5xl mb-4 select-none">📋</span>
            <p className="text-slate-400 text-sm">Sin pedidos por ahora</p>
            <p className="text-slate-400 text-xs mt-1">Se actualiza cada 5 segundos.</p>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onClick={() => setSelectedOrder(order)}
              onAction={(e) => handleQuickAction(e, order)}
            />
          ))
        )}
      </div>

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onToast={onToast}
        />
      )}
    </div>
  );
}

interface OrderCardProps {
  order: Order;
  onClick: () => void;
  onAction: (e: React.MouseEvent) => void;
}

function OrderCard({ order, onClick, onAction }: OrderCardProps) {
  const nextAction = getNextAction(order.status);
  const productSummary = order.items
    .map((p) => `${p.quantity}× ${p.productId}`)
    .join(', ');

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] cursor-pointer active:scale-[0.99] transition-transform"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 text-sm">#{order.id}</span>
          <span className="text-base select-none">
            {order.type === 'delivery' ? '🛵' : '📦'}
          </span>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full ${STATUS_COLORS[order.status]}`}>
          {STATUS_LABELS[order.status]}
        </span>
      </div>

      <p className="text-slate-900 text-sm font-medium">{order.customer.name}</p>
      <p className="text-slate-400 text-xs">{order.customer.phone}</p>

      <p className="text-slate-500 text-xs mt-2 overflow-hidden text-ellipsis whitespace-nowrap">
        {productSummary}
      </p>

      <div className="flex items-center justify-between mt-3">
        <div>
          <span className="text-slate-900 text-sm font-medium">{formatCOP(order.total)}</span>
          <span className="text-slate-400 text-xs ml-2">{formatTime(order.createdAt)}</span>
        </div>
        {nextAction && (
          <button
            onClick={onAction}
            className="px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-xl transition-all hover:bg-emerald-700 active:scale-95 shrink-0"
          >
            {nextAction.label}
          </button>
        )}
      </div>
    </div>
  );
}
