import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { MatchRunResponse, MatchRunStatus } from '../api/types';

const LAST_RUN_KEY = 'onebase_last_match_run_id';
const TERMINAL_STATES = new Set(['COMPLETE', 'SUCCESS', 'FAILURE']);

export function useMatchRun(selectedType: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const runId = searchParams.get('match_run_id');

  const { data: allRuns } = useQuery({
    queryKey: ['match-runs', selectedType],
    queryFn: () => api.get<MatchRunResponse[]>(`/api/matches?type=${selectedType}`),
    refetchInterval: (q) => {
      const data = q.state.data as MatchRunResponse[] | undefined;
      return data?.some(r => r.status === 'pending' || r.status === 'running') ? 1000 : false;
    },
  });

  const selectedRun = (allRuns ?? []).find(r => String(r.id) === runId);
  const validRuns = (allRuns ?? []).filter(
    r => r.status === 'completed' || r.status === 'stale' || (runId != null && String(r.id) === runId),
  );

  useEffect(() => {
    if (runId) localStorage.setItem(LAST_RUN_KEY, runId);
  }, [runId]);

  useEffect(() => {
    if (runId || !validRuns.length) return;
    const stored = localStorage.getItem(LAST_RUN_KEY);
    const match = stored ? validRuns.find(r => String(r.id) === stored) : null;
    const restoredId = match ? String(match.id) : String(validRuns[0].id);
    const next = new URLSearchParams(searchParams);
    next.set('match_run_id', restoredId);
    setSearchParams(next, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, validRuns.length, searchParams.toString()]);

  const setRunId = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('match_run_id', id); else next.delete('match_run_id');
    setSearchParams(next);
  };

  return { runId, validRuns, selectedRun, setRunId };
}

export function useMatchRunStatus(runId: number | null) {
  return useQuery({
    queryKey: ['match-status', runId],
    queryFn: async () => {
      if (runId == null) throw new Error('no run id');
      return api.get<MatchRunStatus>(`/api/matches/${runId}/status`);
    },
    enabled: runId != null,
    refetchInterval: (q) => {
      const data = q.state.data as MatchRunStatus | undefined;
      if (!data) return 1000;
      return TERMINAL_STATES.has(data.state) ? false : 1000;
    },
  });
}
