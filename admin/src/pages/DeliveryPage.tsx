import { useState, useRef } from 'react';
import { Camera, Check, X, LogOut } from 'lucide-react';
import { useOrders, useUpdateOrder } from '../hooks/useOrders';
import { Order, formatCOP, ToastState } from '../lib/types';

interface Props {
  driverName: string;
  onLogout: () => void;
  onToast: (msg: string, type: ToastState['type']) => void;
}

export function DeliveryPage({ driverName, onLogout, onToast }: Props) {
  const { data: allOrders = [], isLoading } = useOrders('ready', 'delivery');
  const updateOrder = useUpdateOrder();
  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const confirmingOrder = allOrders.find((o) => o.id === confirmingOrderId);

  const handleConfirmDelivery = async () => {
    if (!confirmingOrderId) return;
    try {
      await updateOrder.mutateAsync({
        id: confirmingOrderId,
        data: { status: 'delivered' },
      });
      onToast('Entrega confirmada', 'success');
      setConfirmingOrderId(null);
      setPhotoFile(null);
    } catch {
      onToast('No se pudo confirmar la entrega.', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <div className="max-w-[480px] mx-auto px-4 pt-12 pb-4 flex items-center justify-between">
          <div>
            <h1 className="text-slate-900 text-xl font-semibold">Entregas</h1>
            <p className="text-slate-400 text-xs">Hola, {driverName.split(' ')[0]} 👋</p>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-600 text-sm transition-colors"
          >
            <LogOut size={16} />
            <span>Salir</span>
          </button>
        </div>
      </div>

      <div className="max-w-[480px] mx-auto px-4 pt-4">
        <div className="bg-emerald-50 rounded-2xl px-4 py-3 flex items-center gap-2">
          <span className="text-emerald-600 text-sm">🟢</span>
          <span className="text-emerald-700 text-sm">
            {isLoading ? '...' : `${allOrders.length} ${allOrders.length === 1 ? 'pedido listo' : 'pedidos listos'} para entregar`}
          </span>
        </div>
      </div>

      <div className="max-w-[480px] mx-auto px-4 py-4 space-y-3 pb-8">
        {allOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 text-center">
            <span className="text-6xl mb-4 select-none">✅</span>
            <p className="text-slate-500 text-sm">No hay pedidos listos para entregar</p>
            <p className="text-slate-400 text-xs mt-1">en este momento.</p>
          </div>
        ) : (
          allOrders.map((order) => (
            <DeliveryCard
              key={order.id}
              order={order}
              onConfirm={() => setConfirmingOrderId(order.id)}
            />
          ))
        )}
      </div>

      {confirmingOrder && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setConfirmingOrderId(null); setPhotoFile(null); }} />
          <div className="relative bg-white w-full max-w-[480px] rounded-t-3xl p-6 pb-8 shadow-2xl">
            <div className="flex justify-center mb-4">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
            </div>
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-slate-900 font-semibold">¿Confirmar entrega?</h3>
                <p className="text-slate-400 text-sm mt-0.5">#{confirmingOrder.id} · {confirmingOrder.customer.name}</p>
                <p className="text-emerald-600 text-sm mt-1">
                  {formatCOP(confirmingOrder.total)} · {confirmingOrder.paymentMethod === 'nequi' ? 'Nequi' : 'Efectivo'}
                </p>
              </div>
              <button onClick={() => { setConfirmingOrderId(null); setPhotoFile(null); }} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors ml-3 shrink-0">
                <X size={16} />
              </button>
            </div>
            <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`w-full py-3 mb-4 rounded-xl text-sm flex items-center justify-center gap-2 border-2 transition-all ${
                photoFile ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {photoFile ? <Check size={16} /> : <Camera size={16} />}
              {photoFile ? 'Foto capturada ✓' : 'Tomar foto (opcional)'}
            </button>
            <div className="flex gap-3">
              <button onClick={() => { setConfirmingOrderId(null); setPhotoFile(null); }} className="flex-1 py-3.5 bg-slate-100 text-slate-700 rounded-xl text-sm hover:bg-slate-200 active:scale-[0.98] transition-all">Cancelar</button>
              <button onClick={handleConfirmDelivery} disabled={updateOrder.isPending} className="flex-1 py-3.5 bg-emerald-600 text-white rounded-xl text-sm hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-50">
                {updateOrder.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  </span>
                ) : 'Confirmar entrega'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DeliveryCard({ order, onConfirm }: { order: Order; onConfirm: () => void }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-slate-400 text-xs">#{order.id}</p>
          <h4 className="text-slate-900 font-medium mt-0.5">{order.customer.name}</h4>
          <p className="text-slate-400 text-xs mt-0.5">{order.customer.phone}</p>
        </div>
        <span className="text-2xl select-none">🛵</span>
      </div>
      {order.address && (
        <div className="bg-slate-50 rounded-xl p-3 mb-3">
          <p className="text-slate-700 text-sm">{order.address}</p>
          {order.notes && <p className="text-amber-600 text-xs mt-1.5">📝 {order.notes}</p>}
        </div>
      )}
      <div className="flex items-center justify-between mb-3">
        <span className="text-slate-900 text-sm font-medium">{formatCOP(order.total)}</span>
        <span className={`text-xs px-2.5 py-1 rounded-full ${order.paymentMethod === 'nequi' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
          {order.paymentMethod === 'nequi' ? '📱 Nequi' : '💵 Efectivo'}
        </span>
      </div>
      <button onClick={onConfirm} className="w-full py-3.5 bg-emerald-600 text-white rounded-xl text-sm hover:bg-emerald-700 active:scale-[0.98] transition-all">
        Marcar entregado
      </button>
    </div>
  );
}
