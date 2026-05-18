// ── Review Detail — triage only: confirm duplicate or reject ──

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, CheckIcon, XIcon, AlertTriangleIcon, CheckCircle2Icon, XCircleIcon } from 'lucide-react';
import { api } from '../api/client';
import type {
  MatchDetailResponse,
  ReviewQueueResponse,
  ReviewActionResponse,
} from '../api/types';
import { confidenceTone } from '../utils/confidence';
import { useRecordType } from '../hooks/useRecordTypes';
import { useSelectedRecordType } from '../contexts/RecordTypeContext';
import { fieldValue } from '../utils/recordDisplay';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import IdChip from '../components/ui/IdChip';
import SourcePill from '../components/ui/SourcePill';
import MatchSignalsPanel from '../components/MatchSignalsPanel';
import FieldComparisonPanel from '../components/FieldComparisonPanel';
import { type Layout, LAYOUT_KEY, getInitialLayout } from '../components/fieldComparisonLayout';


export default function ReviewDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { withRecordType } = useSelectedRecordType();

  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout>(getInitialLayout);

  useEffect(() => {
    localStorage.setItem(LAYOUT_KEY, layout);
  }, [layout]);

  const { data: detail, isLoading, error } = useQuery({
    queryKey: ['review-detail', id],
    queryFn: () => api.get<MatchDetailResponse>(`/api/review/candidates/${id}`),
    enabled: !!id,
  });

  const { data: recordType } = useRecordType(detail?.type);

  const isPending = detail?.status === 'pending';

  const queuePath = (candidateId?: number) => {
    const runQuery = detail?.match_run_id ? `?match_run_id=${detail.match_run_id}` : '';
    return candidateId
      ? withRecordType(`/review/${candidateId}${runQuery}`)
      : withRecordType(`/review${runQuery}`);
  };

  const advanceAfterAction = async () => {
    queryClient.invalidateQueries({ queryKey: ['review-queue'] });
    queryClient.invalidateQueries({ queryKey: ['review-stats'] });
    queryClient.invalidateQueries({ queryKey: ['review-detail', id] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    setActionInFlight(null);

    if (!detail) return;
    const params = new URLSearchParams();
    params.set('status', 'pending');
    params.set('type', detail.type);
    params.set('limit', '1');
    if (detail.match_run_id != null) params.set('match_run_id', String(detail.match_run_id));
    const next = await queryClient.fetchQuery({
      queryKey: ['review-next-pending', detail.type, detail.match_run_id ?? null],
      queryFn: () => api.get<ReviewQueueResponse>(`/api/review/queue?${params.toString()}`),
    });
    navigate(queuePath(next.items[0]?.id), { replace: true });
  };

  const confirmMutation = useMutation({
    mutationFn: () => api.post<ReviewActionResponse>(`/api/review/candidates/${id}/confirm`),
    onSuccess: advanceAfterAction,
    onError: () => setActionInFlight(null),
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.post<ReviewActionResponse>(`/api/review/candidates/${id}/reject`),
    onSuccess: advanceAfterAction,
    onError: () => setActionInFlight(null),
  });

  const handleConfirm = () => {
    setActionInFlight('confirm');
    confirmMutation.mutate();
  };

  const handleReject = () => {
    setActionInFlight('reject');
    rejectMutation.mutate();
  };

  // Keyboard shortcuts: Enter = confirm, R = reject
  useEffect(() => {
    if (!isPending) return;
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.key === 'r' || e.key === 'R') && !actionInFlight) { e.preventDefault(); handleReject(); }
      else if (e.key === 'Enter' && !actionInFlight) { e.preventDefault(); handleConfirm(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, actionInFlight]);

  if (isLoading) {
    return (
      <div className="overflow-y-auto h-full">
        <div className="p-5 text-xs text-muted-foreground">Loading candidate…</div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="overflow-y-auto h-full">
        <div className="p-5">
          <Card>
            <CardContent className="pt-7 text-center">
              <XCircleIcon className="size-7 text-destructive mx-auto" />
              <div className="mt-2 text-xs">
                {error instanceof Error ? error.message : 'Match candidate not found'}
              </div>
              <Button onClick={() => navigate(withRecordType('/review'))} variant="outline" size="sm" className="mt-3">
                <ArrowLeftIcon className="size-3" />
                Back to queue
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { record_a, record_b, field_comparisons, match_signals } = detail;
  const tone = confidenceTone(detail.confidence);
  const conflictCount = field_comparisons.filter(f => f.is_conflict).length;

  return (
    <div className="overflow-y-auto h-full">
      <div className="p-5 pb-20">

        {/* Header */}
        <div className="mb-3">
          <Button onClick={() => navigate(queuePath())} variant="ghost" size="sm" className="mb-2">
            <ArrowLeftIcon className="size-3" />
            Review queue
          </Button>
          <div className="flex items-center gap-2 flex-wrap">
            <IdChip className="text-xs">#{detail.id}</IdChip>
            <h1 className="text-lg font-semibold m-0 min-w-0">
              {record_a.name || `Record #${record_a.id}`}{' '}
              <span className="text-muted-foreground/60 font-normal">↔</span>{' '}
              {record_b.name || `Record #${record_b.id}`}
            </h1>
            <Badge variant="secondary" className={tone === 'ok' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : tone === 'warn' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : tone === 'danger' ? '' : 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'}>
              {detail.confidence.toFixed(3)} confidence
            </Badge>
            {conflictCount > 0 && (
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                <AlertTriangleIcon className="size-2 fill-current mr-1" />
                {conflictCount} conflict{conflictCount !== 1 ? 's' : ''}
              </Badge>
            )}
            {!isPending && (
              <Badge variant={detail.status === 'confirmed' ? 'secondary' : detail.status === 'rejected' ? 'destructive' : 'outline'} className={detail.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : ''}>
                {detail.status === 'confirmed' ? 'confirmed dupe' : detail.status}
                {detail.reviewed_by && (
                  <span className="font-mono ml-1 opacity-70">· {detail.reviewed_by}</span>
                )}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            {(() => {
              const codeField = recordType?.fields.find(f => f.role === 'code');
              return (
                <>
                  {record_a.data_source_name && (
                    <span className="inline-flex items-center gap-1.5">
                      <SourcePill short={record_a.data_source_name} />
                      <span className="font-mono">{codeField ? fieldValue(record_a.fields, codeField.key) : `#${record_a.id}`}</span>
                    </span>
                  )}
                  {record_b.data_source_name && (
                    <span className="inline-flex items-center gap-1.5">
                      <SourcePill short={record_b.data_source_name} />
                      <span className="font-mono">{codeField ? fieldValue(record_b.fields, codeField.key) : `#${record_b.id}`}</span>
                    </span>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {/* Signals */}
        <MatchSignalsPanel signals={match_signals} confidence={detail.confidence} tone={tone} />

        {/* Field comparison — read-only */}
        <FieldComparisonPanel
          comparisons={field_comparisons}
          recordA={record_a}
          recordB={record_b}
          layout={layout}
          onLayoutChange={setLayout}
          conflictCount={conflictCount}
        />

        {/* Sticky verdict bar */}
        {isPending && (
          <div className="sticky bottom-0 bg-card border border-border rounded-md p-3 flex items-center justify-between gap-3 shadow-md">
            <div className="text-xs text-muted-foreground">
              {conflictCount > 0
                ? <span><span className="font-mono tabular-nums text-amber-600 font-semibold">{conflictCount}</span> field conflict{conflictCount !== 1 ? 's' : ''} — will be reconciled in Merge step</span>
                : <span className="text-emerald-600">No field conflicts</span>
              }
            </div>
            <div className="flex gap-1.5">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleReject}
                disabled={actionInFlight !== null}
              >
                <XIcon className="size-3" />
                {actionInFlight === 'reject' ? 'Rejecting…' : 'Not a duplicate'}
                <kbd className="text-xs">R</kbd>
              </Button>
              <Button
                size="sm"
                onClick={handleConfirm}
                disabled={actionInFlight !== null}
              >
                <CheckIcon className="size-3" />
                {actionInFlight === 'confirm' ? 'Confirming…' : 'Confirm duplicate'}
                <kbd className="text-xs">↵</kbd>
              </Button>
            </div>
          </div>
        )}

        {/* Post-action banners */}
        {!isPending && detail.status === 'confirmed' && (
          <div className="mt-2.5 p-3 bg-emerald-100 dark:bg-emerald-950 border border-emerald-600 rounded-md flex items-center gap-2 text-xs">
            <CheckCircle2Icon className="size-3.5 text-emerald-600" />
            <span className="text-emerald-600 font-semibold">Confirmed duplicate</span>
            <span className="text-muted-foreground">— routed to Merge queue for field reconciliation</span>
          </div>
        )}
        {!isPending && detail.status === 'rejected' && (
          <div className="mt-2.5 p-3 bg-destructive/10 border border-destructive rounded-md flex items-center gap-2 text-xs">
            <XCircleIcon className="size-3.5 text-destructive" />
            <span className="text-destructive font-semibold">Not a duplicate</span>
            {detail.reviewed_by && (
              <span className="text-muted-foreground">— reviewed by <span className="font-mono">{detail.reviewed_by}</span></span>
            )}
          </div>
        )}

        {(confirmMutation.error || rejectMutation.error) && (
          <div className="mt-2.5 p-1.5 bg-destructive/10 border border-destructive rounded-md flex items-center gap-2 text-xs w-full justify-start">
            <XCircleIcon className="size-3 text-destructive" />
            {(confirmMutation.error as Error)?.message || (rejectMutation.error as Error)?.message}
          </div>
        )}
      </div>
    </div>
  );
}
