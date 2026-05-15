// ── Celery task status polling hook ──

import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { TaskStatus } from '../api/types';

const TERMINAL_STATES = ['COMPLETE', 'FAILURE'];
const FAST_STAGES = ['PENDING', 'PARSING', 'NORMALIZING', 'EMBEDDING'];

function normalize(value: string | null | undefined) {
  return value ? value.toUpperCase() : null;
}

export function useTaskStatus(taskId: string | null) {
  const query = useQuery({
    queryKey: ['taskStatus', taskId],
    queryFn: () => api.get<TaskStatus>(`/api/import/batches/${taskId}/status`),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const state = normalize(query.state.data?.state);
      if (state && TERMINAL_STATES.includes(state)) return false;
      const stage = normalize(query.state.data?.stage);
      return stage && FAST_STAGES.includes(stage) ? 2000 : 5000;
    },
  });

  const data = query.data;
  const state = normalize(data?.state) ?? 'PENDING';
  const stage = normalize(data?.stage);

  return {
    state,
    stage,
    progress: data?.progress ?? null,
    detail: data?.detail ?? null,
    row_count: data?.row_count ?? null,
    isComplete: state === 'COMPLETE',
    isFailed: state === 'FAILURE',
    isLoading: query.isLoading,
    error: query.error,
  };
}
