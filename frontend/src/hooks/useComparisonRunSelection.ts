import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { ComparisonRunResponse } from '../api/types';

const LAST_RUN_KEY = 'onebase_last_comparison_run_id';

export function useComparisonRunSelection(selectedType: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const runId = searchParams.get('comparison_run_id');

  const { data: allRuns } = useQuery({
    queryKey: ['comparison-runs', selectedType],
    queryFn: () => api.get<ComparisonRunResponse[]>(`/api/comparisons/?type=${selectedType}`),
  });

  const validRuns = (allRuns ?? []).filter(r => r.status === 'completed' || r.status === 'stale');
  const selectedRun = validRuns.find(r => String(r.id) === runId);

  useEffect(() => {
    if (runId) localStorage.setItem(LAST_RUN_KEY, runId);
  }, [runId]);

  useEffect(() => {
    if (runId || !validRuns.length) return;
    const stored = localStorage.getItem(LAST_RUN_KEY);
    const match = stored ? validRuns.find(r => String(r.id) === stored) : null;
    const restoredId = match ? String(match.id) : String(validRuns[0].id);
    const next = new URLSearchParams(searchParams);
    next.set('comparison_run_id', restoredId);
    setSearchParams(next, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, validRuns.length, searchParams.toString()]);

  const setRunId = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('comparison_run_id', id); else next.delete('comparison_run_id');
    setSearchParams(next);
  };

  return { runId, validRuns, selectedRun, setRunId };
}
