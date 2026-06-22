import { Clock, MapPin, MessageSquare, Phone, UserCircle, X } from 'lucide-react';
import { useState } from 'react';
import { useAssignDriver, useDeliveryDrivers, useUpdateOrder } from '../hooks/useOrders';
import {
    Order,
    STATUS_COLORS,
    STATUS_LABELS,
    formatCOP,
    formatTime,
    getNextAction,
} from '../lib/types';

interface Props {
  order: Order;
  onClose: () => void;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export function OrderDetailModal({ order, onClose, onToast }: Props) {
  const updateOrder = useUpdateOrder();
  const assignDriver = useAssignDriver();
  const { data: drivers = [] } = useDeliveryDrivers();
  const [selectedDriver, setSelectedDriver] = useState<number | null>(
    order.assignedDriver ?? null
  );
  const nextAction = getNextAction(order.status);
  const canAct = !['delivered', 'cancelled'].includes(order.status);
  const canAssign = order.type === 'delivery' && canAct;

  const handleConfirm = async () => {
    if (!nextAction) return;
    try {
      await updateOrder.mutateAsync({ id: order.id, data: { status: nextAction.next } });
      onToast(nextAction.label, 'success');
      onClose();
    } catch (err) {
      onToast('No se pudo actualizar el pedido. Intenta de nuevo.', 'error');
    }
  };

  const handleCancel = async () => {
    if (!confirm(`¿Cancelar pedido #${order.id}? Esta acción no se puede deshacer.`)) return;
    try {
      await updateOrder.mutateAsync({ id: order.id, data: { status: 'cancelled' } });
      onToast(`Pedido #${order.id} cancelado`, 'error');
      onClose();
    } catch {
      onToast('No se pudo cancelar el pedido. Intenta de nuevo.', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white w-full max-w-[480px] rounded-t-3xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white flex justify-center pt-3 pb-1 z-10">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors"
            >
              <X size={16} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-slate-900 font-medium">#{order.id}</span>
                <span className="text-xl">{order.type === 'delivery' ? '🛵' : '📦'}</span>
              </div>
              <span className={`text-xs px-2.5 py-0.5 rounded-full ${STATUS_COLORS[order.status]}`}>
                {STATUS_LABELS[order.status]}
              </span>
            </div>
          </div>
        </div>

        <div className="px-5 pb-8 space-y-5">
          <div className="bg-slate-50 rounded-2xl p-4 space-y-2.5">
            <h4 className="text-slate-900 font-medium">{order.customer.name}</h4>
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <Phone size={14} className="shrink-0" />
              <span>{order.customer.phone}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                {order.type === 'delivery' ? 'Domicilio' : 'Recoger en tienda'}
              </span>
            </div>
            {order.address && (
              <div className="flex items-start gap-2 text-slate-500 text-sm">
                <MapPin size={14} className="shrink-0 mt-0.5" />
                <span>{order.address}</span>
              </div>
            )}
            {order.notes && (
              <div className="flex items-start gap-2 text-amber-600 text-sm">
                <MessageSquare size={14} className="shrink-0 mt-0.5" />
                <span>{order.notes}</span>
              </div>
            )}
          </div>

          <div className="h-px bg-slate-100" />

          <div>
            <p className="text-slate-400 text-xs mb-3 uppercase tracking-wide">Productos</p>
            <div className="space-y-3">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="text-slate-900 text-sm">
                      {item.quantity}× {item.productId}
                    </p>
                    {item.customizations.map((c, j) => (
                      <p key={j} className="text-slate-400 text-xs mt-0.5">· {c}</p>
                    ))}
                  </div>
                  <p className="text-slate-700 text-sm shrink-0 ml-3">
                    ×{item.quantity}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="h-px bg-slate-100" />

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Subtotal</span>
              <span className="text-slate-700">{formatCOP(order.subtotal)}</span>
            </div>
            {order.deliveryFee > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Domicilio</span>
                <span className="text-slate-700">{formatCOP(order.deliveryFee)}</span>
              </div>
            )}
            <div className="flex justify-between font-medium">
              <span className="text-slate-900">Total</span>
              <span className="text-slate-900">{formatCOP(order.total)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-400">Método de pago</span>
              <span className={`text-xs px-2.5 py-1 rounded-full ${
                order.paymentMethod === 'nequi'
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-green-100 text-green-700'
              }`}>
                {order.paymentMethod === 'nequi' ? '📱 Nequi' : '💵 Efectivo'}
              </span>
            </div>
          </div>

          <div className="h-px bg-slate-100" />

          <div className="flex items-center gap-2 text-slate-400 text-xs">
            <Clock size={13} />
            <span>Creado a las {formatTime(order.createdAt)}</span>
          </div>

          {canAssign && (
            <>
              <div className="h-px bg-slate-100" />
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wide">
                  <UserCircle size={14} />
                  <span>Asignar repartidor</span>
                </div>
                <select
                  value={selectedDriver ?? ''}
                  onChange={(e) => setSelectedDriver(e.target.value ? Number(e.target.value) : null)}
                  className="w-full py-2.5 px-3 rounded-xl border-2 border-slate-200 text-sm text-slate-700 focus:border-emerald-500 focus:outline-none transition-colors"
                >
                  <option value="">Sin asignar</option>
                  {drivers.filter((d) => d.active).map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                {selectedDriver !== null && selectedDriver !== (order.assignedDriver ?? null) && (
                  <button
                    onClick={async () => {
                      try {
                        await assignDriver.mutateAsync({ orderId: order.id, driverId: selectedDriver });
                        onToast('Repartidor asignado', 'success');
                      } catch {
                        onToast('No se pudo asignar el repartidor.', 'error');
                      }
                    }}
                    disabled={assignDriver.isPending}
                    className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {assignDriver.isPending ? 'Asignando...' : 'Confirmar asignación'}
                  </button>
                )}
                {order.assignedDriver && selectedDriver === (order.assignedDriver ?? null) && (
                  <p className="text-slate-400 text-xs">
                    Repartidor actual: <span className="text-slate-600 font-medium">{drivers.find((d) => d.id === order.assignedDriver)?.name ?? `#${order.assignedDriver}`}</span>
                  </p>
                )}
              </div>
            </>
          )}

          {canAct && (
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleCancel}
                disabled={updateOrder.isPending}
                className="flex-1 py-3.5 border-2 border-red-500 text-red-500 rounded-xl text-sm transition-all hover:bg-red-50 active:scale-[0.98] disabled:opacity-50"
              >
                Cancelar pedido
              </button>
              {nextAction && (
                <button
                  onClick={handleConfirm}
                  disabled={updateOrder.isPending}
                  className="flex-1 py-3.5 bg-emerald-600 text-white rounded-xl text-sm transition-all hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50"
                >
                  {updateOrder.isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    </span>
                  ) : nextAction.label}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
