import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { ComparisonRunStatus } from '../api/types';

const TERMINAL_STATES = new Set(['COMPLETE', 'SUCCESS', 'FAILURE']);

export function useComparisonStatus(runId: number | null) {
  return useQuery({
    queryKey: ['comparison-status', runId],
    queryFn: async () => {
      if (runId == null) throw new Error('no run id');
      return api.get<ComparisonRunStatus>(`/api/comparisons/${runId}/status`);
    },
    enabled: runId != null,
    refetchInterval: (q) => {
      const data = q.state.data as ComparisonRunStatus | undefined;
      if (!data) return 1000;
      return TERMINAL_STATES.has(data.state) ? false : 1000;
    },
  });
}
