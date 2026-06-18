import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ReportFilters, SalesReport } from '../lib/types';

export function useSalesReport(filters: ReportFilters | null, page = 1) {
  return useQuery<SalesReport>({
    queryKey: ['salesReport', filters, page],
    queryFn: async () => {
      if (!filters) throw new Error('No filters');
      const params = new URLSearchParams();
      params.set('from', filters.from);
      params.set('to', filters.to);
      params.set('page', String(page));
      if (filters.status && filters.status !== 'all') params.set('status', filters.status);
      if (filters.paymentMethod && filters.paymentMethod !== 'all') params.set('paymentMethod', filters.paymentMethod);
      if (filters.type && filters.type !== 'all') params.set('type', filters.type);
      return api.get<SalesReport>(`/orders/reports/sales?${params.toString()}`);
    },
    enabled: !!filters,
  });
}

export async function exportReport(format: 'csv' | 'pdf', filters: ReportFilters) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${import.meta.env.VITE_API_URL ?? '/api/v1'}/orders/reports/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ format, filters }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ext = format === 'csv' ? 'csv' : 'pdf';
  a.download = `ventas-${filters.from}-${filters.to}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
