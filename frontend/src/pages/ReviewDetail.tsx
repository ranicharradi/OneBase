// ── Review Detail — triage only: confirm duplicate or reject ──

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import Panel from '../components/ui/Panel';
import Pill from '../components/ui/Pill';
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
      <div className="scroll" style={{ height: '100%' }}>
        <div style={{ padding: 20, fontSize: 12, color: 'var(--fg-2)' }}>Loading candidate…</div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="scroll" style={{ height: '100%' }}>
        <div style={{ padding: 20 }}>
          <Panel>
            <div style={{ padding: 28, textAlign: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--danger)' }}>error</span>
              <div style={{ marginTop: 8, fontSize: 12 }}>
                {error instanceof Error ? error.message : 'Match candidate not found'}
              </div>
              <button onClick={() => navigate(withRecordType('/review'))} className="btn btn-sm" style={{ marginTop: 12 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>arrow_back</span>
                Back to queue
              </button>
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  const { record_a, record_b, field_comparisons, match_signals } = detail;
  const tone = confidenceTone(detail.confidence);
  const conflictCount = field_comparisons.filter(f => f.is_conflict).length;

  return (
    <div className="scroll" style={{ height: '100%' }}>
      <div style={{ padding: 20, paddingBottom: 80 }}>

        {/* Header */}
        <div className="fade" style={{ marginBottom: 12 }}>
          <button onClick={() => navigate(queuePath())} className="btn btn-sm btn-ghost" style={{ marginBottom: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>arrow_back</span>
            Review queue
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <IdChip style={{ fontSize: 13, padding: '3px 8px' }}>#{detail.id}</IdChip>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, minWidth: 0 }}>
              {record_a.name || `Record #${record_a.id}`}{' '}
              <span style={{ color: 'var(--fg-3)', fontWeight: 400 }}>↔</span>{' '}
              {record_b.name || `Record #${record_b.id}`}
            </h1>
            <Pill tone={tone} dot>
              {detail.confidence.toFixed(3)} confidence
            </Pill>
            {conflictCount > 0 && (
              <Pill tone="warn" icon="warning">
                {conflictCount} conflict{conflictCount !== 1 ? 's' : ''}
              </Pill>
            )}
            {!isPending && (
              <Pill tone={detail.status === 'confirmed' ? 'ok' : detail.status === 'rejected' ? 'danger' : 'neutral'} dot>
                {detail.status === 'confirmed' ? 'confirmed dupe' : detail.status}
                {detail.reviewed_by && (
                  <span className="mono" style={{ marginLeft: 4, opacity: 0.7 }}>· {detail.reviewed_by}</span>
                )}
              </Pill>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8, fontSize: 11, color: 'var(--fg-2)' }}>
            {(() => {
              const codeField = recordType?.fields.find(f => f.role === 'code');
              return (
                <>
                  {record_a.data_source_name && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <SourcePill short={record_a.data_source_name} />
                      <span className="mono">{codeField ? fieldValue(record_a.fields, codeField.key) : `#${record_a.id}`}</span>
                    </span>
                  )}
                  {record_b.data_source_name && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <SourcePill short={record_b.data_source_name} />
                      <span className="mono">{codeField ? fieldValue(record_b.fields, codeField.key) : `#${record_b.id}`}</span>
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
          <div
            className="fade"
            style={{
              position: 'sticky', bottom: 0,
              background: 'var(--bg-1)', border: '1px solid var(--border-0)',
              borderRadius: 6, padding: '10px 14px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--fg-2)' }}>
              {conflictCount > 0
                ? <span><span className="mono tnum" style={{ color: 'var(--warn)', fontWeight: 600 }}>{conflictCount}</span> field conflict{conflictCount !== 1 ? 's' : ''} — will be reconciled in Merge step</span>
                : <span style={{ color: 'var(--ok)' }}>No field conflicts</span>
              }
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn btn-sm btn-danger"
                onClick={handleReject}
                disabled={actionInFlight !== null}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>close</span>
                {actionInFlight === 'reject' ? 'Rejecting…' : 'Not a duplicate'}
                <span className="kbd">R</span>
              </button>
              <button
                className="btn btn-sm btn-accent"
                onClick={handleConfirm}
                disabled={actionInFlight !== null}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>check</span>
                {actionInFlight === 'confirm' ? 'Confirming…' : 'Confirm duplicate'}
                <span className="kbd" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', borderColor: 'rgba(255,255,255,0.25)' }}>↵</span>
              </button>
            </div>
          </div>
        )}

        {/* Post-action banners */}
        {!isPending && detail.status === 'confirmed' && (
          <div className="fade" style={{
            marginTop: 10, padding: '10px 14px',
            background: 'var(--ok-soft)', border: '1px solid var(--ok)',
            borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--ok)' }}>check_circle</span>
            <span style={{ color: 'var(--ok)', fontWeight: 600 }}>Confirmed duplicate</span>
            <span style={{ color: 'var(--fg-2)' }}>— routed to Merge queue for field reconciliation</span>
          </div>
        )}
        {!isPending && detail.status === 'rejected' && (
          <div className="fade" style={{
            marginTop: 10, padding: '10px 14px',
            background: 'var(--danger-soft)', border: '1px solid var(--danger)',
            borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--danger)' }}>cancel</span>
            <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Not a duplicate</span>
            {detail.reviewed_by && (
              <span style={{ color: 'var(--fg-2)' }}>— reviewed by <span className="mono">{detail.reviewed_by}</span></span>
            )}
          </div>
        )}

        {(confirmMutation.error || rejectMutation.error) && (
          <div className="pill danger" style={{ marginTop: 10, padding: '6px 10px', width: '100%', justifyContent: 'flex-start' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>error</span>
            {(confirmMutation.error as Error)?.message || (rejectMutation.error as Error)?.message}
          </div>
        )}
      </div>
    </div>
  );
}
