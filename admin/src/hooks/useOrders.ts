import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from '../lib/api';
import type { Order, OrderStatus } from '../lib/types';

interface UpdateOrderPayload {
  status?: OrderStatus;
  notes?: string;
}

export function useOrders(status?: string, type?: string) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (type) params.set('type', type);
  const query = params.toString() ? `?${params.toString()}` : '';

  return useQuery<Order[]>({
    queryKey: ['orders', status, type],
    queryFn: () => api.get<Order[]>(`/orders${query}`),
    refetchInterval: 5000,
  });
}

export function useOrdersWithSound() {
  const result = useOrders();
  const prevPendingRef = useRef(0);

  useEffect(() => {
    const orders = result.data ?? [];
    const pendingCount = orders.filter((o) => o.status === 'pending').length;

    if (pendingCount > prevPendingRef.current) {
      new Audio('/sounds/new-order.mp3').play().catch(() => {});
      navigator.vibrate?.([200, 100, 200]);
      document.title = `(⚠️${pendingCount}) Pedidos — Shanti`;
    } else if (pendingCount === 0) {
      document.title = 'Pedidos — Shanti';
    }

    prevPendingRef.current = pendingCount;
  }, [result.data]);

  return result;
}

export function useUpdateOrder() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateOrderPayload }) =>
      api.patch(`/orders/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
