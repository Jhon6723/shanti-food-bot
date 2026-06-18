import { ChevronLeft, ChevronRight, Download, FileText, LogOut, Printer } from 'lucide-react';
import { useCallback, useState } from 'react';
import { SkeletonCard } from '../components/SkeletonLoader';
import { exportReport, useSalesReport } from '../hooks/useReports';
import { useStats } from '../hooks/useStats';
import type { ReportFilters } from '../lib/types';
import { formatCOP, formatDate } from '../lib/types';

interface Props {
  onLogout: () => void;
}

type StatsMode = 'today' | 'report';

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function getFirstDayOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function StatsPage({ onLogout }: Props) {
  const [mode, setMode] = useState<StatsMode>('today');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white sticky top-0 z-30 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <div className="max-w-[480px] mx-auto px-4 pt-12 pb-4 flex items-center justify-between">
          <div>
            <h1 className="text-slate-900 text-xl font-semibold">Estadísticas</h1>
            <p className="text-slate-400 text-xs">{mode === 'today' ? 'Hoy' : 'Reporte'}</p>
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
        {/* Toggle */}
        <div className="bg-white rounded-xl p-1 shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex">
          <button
            onClick={() => setMode('today')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              mode === 'today' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Hoy
          </button>
          <button
            onClick={() => setMode('report')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              mode === 'report' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Reporte 📈
          </button>
        </div>

        {mode === 'today' ? <TodayView /> : <ReportView />}
      </div>
    </div>
  );
}

function TodayView() {
  const { data: stats, isLoading } = useStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <span className="text-5xl mb-4 select-none">📊</span>
        <p className="text-slate-400 text-sm">Sin pedidos hoy todavía. 🌍</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <MetricCard icon="💰" label="Ventas hoy" value={formatCOP(stats.todayRevenue)} highlight />
        <MetricCard icon="📦" label="Entregados" value={stats.delivered.toString()} />
        <MetricCard icon="⏳" label="Pendientes" value={stats.pending.toString()} warning={stats.pending > 0} />
        <MetricCard icon="🍳" label="En proceso" value={(stats.confirmed + stats.preparing + stats.ready).toString()} />
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
  );
}

function ReportView() {
  const [filters, setFilters] = useState<ReportFilters>({
    from: getFirstDayOfMonth(),
    to: getToday(),
    status: 'delivered',
    paymentMethod: 'all',
    type: 'all',
  });
  const [page, setPage] = useState(1);
  const { data: report, isLoading, error } = useSalesReport(filters, page);

  const applyFilters = useCallback((patch: Partial<ReportFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }, []);

  const handleExport = async (format: 'csv' | 'pdf') => {
    try {
      await exportReport(format, filters);
    } catch {
      alert('No se pudo exportar el reporte');
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-slate-400 text-xs mb-1 block">Desde</label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => applyFilters({ from: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <div>
            <label className="text-slate-400 text-xs mb-1 block">Hasta</label>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => applyFilters({ to: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <select
            value={filters.status}
            onChange={(e) => applyFilters({ status: e.target.value })}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-sm text-slate-900"
          >
            <option value="delivered">Entregado</option>
            <option value="all">Todos</option>
            <option value="cancelled">Cancelado</option>
          </select>
          <select
            value={filters.paymentMethod}
            onChange={(e) => applyFilters({ paymentMethod: e.target.value })}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-sm text-slate-900"
          >
            <option value="all">Todos pagos</option>
            <option value="cash">Efectivo</option>
            <option value="nequi">Nequi</option>
          </select>
          <select
            value={filters.type}
            onChange={(e) => applyFilters({ type: e.target.value })}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-sm text-slate-900"
          >
            <option value="all">Todos tipos</option>
            <option value="delivery">Domicilio</option>
            <option value="pickup">Recoger</option>
          </select>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {error && (
        <div className="bg-white rounded-2xl p-6 text-center shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          <p className="text-red-500 text-sm">Error cargando el reporte</p>
        </div>
      )}

      {report && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <MetricCard icon="💰" label="Total ventas" value={formatCOP(report.summary.totalRevenue)} highlight />
            <MetricCard icon="📦" label="Órdenes" value={report.summary.totalOrders.toString()} />
            <MetricCard icon="📊" label="Ticket promedio" value={formatCOP(report.summary.averageOrderValue)} />
            <MetricCard icon="🛵" label="Envíos" value={formatCOP(report.summary.totalDeliveryFees)} />
          </div>

          {/* Breakdown */}
          <div className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            <p className="text-slate-400 text-xs mb-3 uppercase tracking-wide">Desglose</p>
            <div className="space-y-3">
              {report.summary.byPaymentMethod.map((row) => (
                <div key={row.method} className="flex items-center justify-between">
                  <span className="text-slate-600 text-sm">{row.method === 'cash' ? '💵 Efectivo' : '💳 Nequi'}</span>
                  <span className="text-slate-900 text-sm font-medium">{row.count} — {formatCOP(row.revenue)}</span>
                </div>
              ))}
              {report.summary.byOrderType.map((row) => (
                <div key={row.type} className="flex items-center justify-between">
                  <span className="text-slate-600 text-sm">{row.type === 'delivery' ? '📦 Domicilio' : '🏠 Recoger'}</span>
                  <span className="text-slate-900 text-sm font-medium">{row.count} — {formatCOP(row.revenue)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Daily chart */}
          {report.summary.byDay.length > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
              <p className="text-slate-400 text-xs mb-3 uppercase tracking-wide">Ingresos por día</p>
              <div className="space-y-2">
                {report.summary.byDay.map((day) => {
                  const maxRevenue = Math.max(...report.summary.byDay.map((d) => d.revenue));
                  const pct = maxRevenue > 0 ? (day.revenue / maxRevenue) * 100 : 0;
                  return (
                    <div key={day.date} className="flex items-center gap-3">
                      <span className="text-slate-500 text-xs w-12 shrink-0">{formatDate(day.date)}</span>
                      <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-slate-700 text-xs w-16 text-right shrink-0">{formatCOP(day.revenue)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Orders table */}
          <div className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            <p className="text-slate-400 text-xs mb-3 uppercase tracking-wide">
              Detalle ({(page - 1) * 10 + 1}-{Math.min(page * 10, report.pagination.total)} de {report.pagination.total})
            </p>
            <div className="space-y-2">
              {report.orders.map((o) => (
                <div key={o.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div>
                    <p className="text-slate-900 text-sm font-medium">{o.id}</p>
                    <p className="text-slate-400 text-xs">{o.customer} — {formatDate(o.date)}</p>
                  </div>
                  <span className="text-slate-700 text-sm font-medium">{formatCOP(o.total)}</span>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {report.pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-4 pt-3 border-t border-slate-100">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="p-1 rounded-lg text-slate-500 disabled:text-slate-300 hover:bg-slate-100"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="text-slate-600 text-sm">{page} de {report.pagination.totalPages}</span>
                <button
                  disabled={page >= report.pagination.totalPages}
                  onClick={() => setPage(page + 1)}
                  className="p-1 rounded-lg text-slate-500 disabled:text-slate-300 hover:bg-slate-100"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>

          {/* Export buttons */}
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => handleExport('csv')}
              className="flex items-center justify-center gap-2 bg-white border border-slate-200 rounded-xl py-3 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              <Download size={16} />
              CSV
            </button>
            <button
              onClick={() => handleExport('pdf')}
              className="flex items-center justify-center gap-2 bg-white border border-slate-200 rounded-xl py-3 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              <FileText size={16} />
              PDF
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center justify-center gap-2 bg-white border border-slate-200 rounded-xl py-3 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              <Printer size={16} />
              Imprimir
            </button>
          </div>
        </>
      )}
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
