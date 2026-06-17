import { LogOut } from 'lucide-react';
import { SkeletonCard } from '../components/SkeletonLoader';
import { useStats } from '../hooks/useStats';
import { formatCOP } from '../lib/types';

interface Props {
  onLogout: () => void;
}

export function StatsPage({ onLogout }: Props) {
  const { data: stats, isLoading } = useStats();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white sticky top-0 z-30 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <div className="max-w-[480px] mx-auto px-4 pt-12 pb-4 flex items-center justify-between">
          <div>
            <h1 className="text-slate-900 text-xl font-semibold">Estadísticas</h1>
            <p className="text-slate-400 text-xs">Hoy</p>
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

      <div className="max-w-[480px] mx-auto px-4 py-4 space-y-4 pb-24">
        {isLoading ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          </>
        ) : !stats ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="text-5xl mb-4 select-none">📊</span>
            <p className="text-slate-400 text-sm">Sin pedidos hoy todavía. 🌍</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <MetricCard icon="💰" label="Ventas hoy" value={formatCOP(stats.todayRevenue)} highlight />
              <MetricCard icon="📦" label="Entregados" value={stats.delivered.toString()} />
              <MetricCard icon="⏳" label="Pendientes" value={stats.pending.toString()} warning={stats.pending > 0} />
              <MetricCard icon="�" label="En proceso" value={(stats.confirmed + stats.preparing + stats.ready).toString()} />
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
              <p className="text-slate-400 text-xs mb-3 uppercase tracking-wide">Estados activos</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className="text-blue-600 text-xs mb-1">Confirmados</p>
                  <p className="text-slate-900 text-sm font-medium">{stats.confirmed}</p>
                </div>
                <div className="bg-orange-50 rounded-xl p-3 text-center">
                  <p className="text-orange-600 text-xs mb-1">Preparando</p>
                  <p className="text-slate-900 text-sm font-medium">{stats.preparing}</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-emerald-600 text-xs mb-1">Listos</p>
                  <p className="text-slate-900 text-sm font-medium">{stats.ready}</p>
                </div>
              </div>
            </div>

            {stats.total > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                <p className="text-slate-400 text-xs mb-3 uppercase tracking-wide">Progreso del día</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                      style={{ width: `${(stats.delivered / stats.total) * 100}%` }}
                    />
                  </div>
                  <span className="text-slate-500 text-xs shrink-0">
                    {stats.delivered}/{stats.total}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface MetricCardProps {
  icon: string;
  label: string;
  value: string;
  highlight?: boolean;
  warning?: boolean;
}

function MetricCard({ icon, label, value, highlight, warning }: MetricCardProps) {
  return (
    <div className={`rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] ${
      highlight ? 'bg-emerald-600' : warning ? 'bg-amber-50' : 'bg-white'
    }`}>
      <p className="text-xl mb-1 select-none">{icon}</p>
      <p className={`text-xs mb-2 ${highlight ? 'text-emerald-100' : 'text-slate-400'}`}>{label}</p>
      <h3 className={`font-semibold text-lg ${highlight ? 'text-white' : warning ? 'text-amber-700' : 'text-slate-900'}`}>
        {value}
      </h3>
    </div>
  );
}
