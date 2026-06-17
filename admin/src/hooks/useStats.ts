import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { DashboardStats } from '../lib/types';

export function useStats() {
  return useQuery<DashboardStats>({
    queryKey: ['stats'],
    queryFn: () => api.get<DashboardStats>('/orders/stats/dashboard'),
    refetchInterval: 60000,
  });
}
