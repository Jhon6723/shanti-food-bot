import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { DriverStats, User } from '../lib/types';

interface CreateUserPayload {
  name: string;
  username: string;
  password: string;
  role: 'delivery';
  active?: boolean;
}

interface UpdateUserPayload {
  name?: string;
  username?: string;
  password?: string;
  active?: boolean;
}

export function useDrivers() {
  return useQuery<User[]>({
    queryKey: ['drivers'],
    queryFn: () => api.get<User[]>('/users?role=delivery'),
  });
}

export function useDriverStats(userId: number) {
  return useQuery<DriverStats>({
    queryKey: ['driver-stats', userId],
    queryFn: () => api.get<DriverStats>(`/users/${userId}/stats`),
    enabled: !!userId,
  });
}

export function useCreateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateUserPayload) => api.post('/users', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drivers'] }),
  });
}

export function useUpdateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateUserPayload }) =>
      api.patch(`/users/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drivers'] }),
  });
}
