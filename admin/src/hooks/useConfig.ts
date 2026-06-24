import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface PublicConfig {
  deliveryDashboardEnabled: boolean;
}

export function useConfig() {
  return useQuery<PublicConfig>({
    queryKey: ['config'],
    queryFn: () => api.get<PublicConfig>('/config/public'),
    staleTime: Infinity, // config doesn't change during a session
  });
}
