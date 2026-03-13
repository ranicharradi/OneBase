// ── Celery task status polling hook ──

import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { TaskStatus } from '../api/types';

const TERMINAL_STATES = ['COMPLETE', 'FAILURE'];

export function useTaskStatus(taskId: string | null) {
  const query = useQuery({
    queryKey: ['taskStatus', taskId],
    queryFn: () => api.get<TaskStatus>(`/api/import/batches/${taskId}/status`),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      if (state && TERMINAL_STATES.includes(state)) return false;
      return 1000;
    },
  });

  const data = query.data;

  return {
    state: data?.state ?? 'PENDING',
    stage: data?.stage ?? null,
    progress: data?.progress ?? null,
    detail: data?.detail ?? null,
    row_count: data?.row_count ?? null,
    isComplete: data?.state === 'COMPLETE',
    isFailed: data?.state === 'FAILURE',
    isLoading: query.isLoading,
    error: query.error,
  };
}
