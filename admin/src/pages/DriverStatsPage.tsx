import { ArrowLeft, Calendar, DollarSign, Package } from 'lucide-react';
import { SkeletonCard } from '../components/SkeletonLoader';
import { useDriverStats } from '../hooks/useDrivers';
import { formatCOP } from '../lib/types';

interface Props {
  driverId: number;
  driverName: string;
  onBack: () => void;
}

export function DriverStatsPage({ driverId, driverName, onBack }: Props) {
  const { data: stats, isLoading } = useDriverStats(driverId);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white sticky top-0 z-30 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <div className="max-w-[480px] mx-auto px-4 pt-12 pb-4 flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 active:scale-90 transition-transform"
          >
            <ArrowLeft size={17} />
          </button>
          <div>
            <h1 className="text-slate-900 text-xl font-semibold">{driverName}</h1>
            <p className="text-slate-400 text-xs">Estadísticas de entregas</p>
          </div>
        </div>
      </div>

      <div className="max-w-[480px] mx-auto px-4 py-4 space-y-4 pb-24">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : stats ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Package size={16} className="text-emerald-600" />
                  </div>
                  <span className="text-slate-400 text-xs">Total entregas</span>
                </div>
                <p className="text-slate-900 text-2xl font-bold">{stats.totalDelivered}</p>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <Calendar size={16} className="text-blue-600" />
                  </div>
                  <span className="text-slate-400 text-xs">Últimos 30 días</span>
                </div>
                <p className="text-slate-900 text-2xl font-bold">{stats.deliveredLast30Days}</p>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] col-span-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                    <DollarSign size={16} className="text-amber-600" />
                  </div>
                  <span className="text-slate-400 text-xs">Monto total recaudado</span>
                </div>
                <p className="text-slate-900 text-2xl font-bold">{formatCOP(stats.totalAmount)}</p>
              </div>
            </div>

            {stats.recentOrders.length > 0 && (
              <div>
                <h2 className="text-slate-900 text-sm font-semibold mb-3">Entregas recientes</h2>
                <div className="space-y-2">
                  {stats.recentOrders.map((order) => (
                    <div
                      key={order.id}
                      className="bg-white rounded-xl p-3 shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex items-center justify-between"
                    >
                      <div>
                        <p className="text-slate-900 text-sm font-medium">{order.id}</p>
                        <p className="text-slate-400 text-xs">{order.customer_name} · {order.created_at}</p>
                      </div>
                      <p className="text-slate-900 text-sm font-semibold">{formatCOP(order.total)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="text-5xl mb-4 select-none">📊</span>
            <p className="text-slate-500 text-sm">No hay estadísticas disponibles.</p>
          </div>
        )}
      </div>
    </div>
  );
}
