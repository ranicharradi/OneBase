// ── Merge Detail — field reconciliation for confirmed duplicate pairs ──

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type {
  MatchDetailResponse,
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


export default function MergeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { withRecordType } = useSelectedRecordType();

  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout>(getInitialLayout);
  const [selections, setSelections] = useState<Record<string, number>>({});

  useEffect(() => {
    localStorage.setItem(LAYOUT_KEY, layout);
  }, [layout]);

  const { data: detail, isLoading, error } = useQuery({
    queryKey: ['review-detail', id],
    queryFn: () => api.get<MatchDetailResponse>(`/api/review/candidates/${id}`),
    enabled: !!id,
  });

  const { data: recordType } = useRecordType(detail?.type);

  const isConfirmed = detail?.status === 'confirmed';

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['merge-queue'] });
    queryClient.invalidateQueries({ queryKey: ['review-queue'] });
    queryClient.invalidateQueries({ queryKey: ['review-stats'] });
    queryClient.invalidateQueries({ queryKey: ['review-detail', id] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['unified-records'] });
    setActionInFlight(null);
  };

  const mergeMutation = useMutation({
    mutationFn: (fieldSelections: { field: string; chosen_record_id: number }[]) =>
      api.post<ReviewActionResponse>(`/api/review/candidates/${id}/merge`, {
        field_selections: fieldSelections,
      }),
    onSuccess: (result) => {
      invalidate();
      if (result.unified_record_id) {
        navigate(withRecordType(`/unified/${result.unified_record_id}`));
      } else {
        navigate(withRecordType('/merge'));
      }
    },
    onError: () => setActionInFlight(null),
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.post<ReviewActionResponse>(`/api/review/candidates/${id}/reject`),
    onSuccess: () => {
      invalidate();
      navigate(withRecordType('/merge'));
    },
    onError: () => setActionInFlight(null),
  });

  const handleMerge = () => {
    if (!detail) return;
    const fieldSelections = Object.entries(selections).map(([field, chosen_record_id]) => ({
      field,
      chosen_record_id,
    }));
    setActionInFlight('merge');
    mergeMutation.mutate(fieldSelections);
  };

  const handleReject = () => {
    setActionInFlight('reject');
    rejectMutation.mutate();
  };

  // Keyboard: Enter = merge (when resolved), R = reject, S = skip back
  useEffect(() => {
    if (!isConfirmed) return;
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.key === 'r' || e.key === 'R') && !actionInFlight) { e.preventDefault(); handleReject(); }
      else if (e.key === 'Enter' && !actionInFlight && allResolved) { e.preventDefault(); handleMerge(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, actionInFlight, selections, detail]);

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
              <button onClick={() => navigate(withRecordType('/merge'))} className="btn btn-sm" style={{ marginTop: 12 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>arrow_back</span>
                Back to merge queue
              </button>
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  const { record_a, record_b, field_comparisons, match_signals } = detail;
  const tone = confidenceTone(detail.confidence);
  const conflicts = field_comparisons.filter(f => f.is_conflict);
  const resolvedCount = conflicts.filter(f => selections[f.field] !== undefined).length;
  const allResolved = conflicts.length === 0 || resolvedCount === conflicts.length;

  return (
    <div className="scroll" style={{ height: '100%' }}>
      <div style={{ padding: 20, paddingBottom: 80 }}>

        {/* Header */}
        <div className="fade" style={{ marginBottom: 12 }}>
          <button onClick={() => navigate(withRecordType('/merge'))} className="btn btn-sm btn-ghost" style={{ marginBottom: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>arrow_back</span>
            Merge queue
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
            {conflicts.length > 0 && (
              <Pill tone="warn" icon="warning">
                {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}
              </Pill>
            )}
            {!isConfirmed && (
              <Pill tone={detail.status === 'merged' ? 'ok' : detail.status === 'rejected' ? 'danger' : 'neutral'} dot>
                {detail.status}
                {detail.reviewed_by && (
                  <span className="mono" style={{ marginLeft: 4, opacity: 0.7 }}>· {detail.reviewed_by}</span>
                )}
              </Pill>
            )}
          </div>
          {detail.reviewed_by && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--fg-2)' }}>
              Confirmed by{' '}
              <span className="mono" style={{ color: 'var(--accent)' }}>{detail.reviewed_by}</span>
              {detail.reviewed_at && (
                <span> · {new Date(detail.reviewed_at).toLocaleString()}</span>
              )}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 6, fontSize: 11, color: 'var(--fg-2)' }}>
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

        {/* Field comparison — interactive for conflicts */}
        <FieldComparisonPanel
          comparisons={field_comparisons}
          recordA={record_a}
          recordB={record_b}
          layout={layout}
          onLayoutChange={setLayout}
          conflictCount={conflicts.length}
          resolvedCount={resolvedCount}
          selections={selections}
          onSelect={isConfirmed ? (field, id) => setSelections(s => ({ ...s, [field]: id })) : undefined}
        />

        {/* Sticky verdict bar */}
        {isConfirmed && (
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                background: allResolved ? 'var(--ok-soft)' : 'var(--warn-soft)',
                color: allResolved ? 'var(--ok)' : 'var(--warn)',
              }}>
                <span className="mono tnum">{resolvedCount}/{conflicts.length}</span> conflicts resolved
              </div>
              <span style={{ fontSize: 12, color: 'var(--fg-2)' }}>
                {allResolved
                  ? conflicts.length === 0 ? 'No conflicts — ready to merge' : 'All conflicts reconciled — ready to merge'
                  : 'Pick a side for each conflicting field'
                }
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn btn-sm btn-danger"
                onClick={handleReject}
                disabled={actionInFlight !== null}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>close</span>
                {actionInFlight === 'reject' ? 'Rejecting…' : 'Reject'}
                <span className="kbd">R</span>
              </button>
              <button
                className="btn btn-sm btn-accent"
                onClick={handleMerge}
                disabled={!allResolved || actionInFlight !== null}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>merge</span>
                {actionInFlight === 'merge' ? 'Merging…' : 'Confirm merge'}
                <span className="kbd" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', borderColor: 'rgba(255,255,255,0.25)' }}>↵</span>
              </button>
            </div>
          </div>
        )}

        {/* Post-action banners */}
        {!isConfirmed && detail.status === 'merged' && (
          <div className="fade" style={{
            marginTop: 10, padding: '10px 14px',
            background: 'var(--ok-soft)', border: '1px solid var(--ok)',
            borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--ok)' }}>check_circle</span>
            <span style={{ color: 'var(--ok)', fontWeight: 600 }}>Merged</span>
            <span style={{ color: 'var(--fg-2)' }}>— unified record created in Unified records</span>
          </div>
        )}
        {!isConfirmed && detail.status === 'rejected' && (
          <div className="fade" style={{
            marginTop: 10, padding: '10px 14px',
            background: 'var(--danger-soft)', border: '1px solid var(--danger)',
            borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--danger)' }}>cancel</span>
            <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Rejected</span>
            {detail.reviewed_by && (
              <span style={{ color: 'var(--fg-2)' }}>— reviewed by <span className="mono">{detail.reviewed_by}</span></span>
            )}
          </div>
        )}

        {(mergeMutation.error || rejectMutation.error) && (
          <div className="pill danger" style={{ marginTop: 10, padding: '6px 10px', width: '100%', justifyContent: 'flex-start' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>error</span>
            {(mergeMutation.error as Error)?.message || (rejectMutation.error as Error)?.message}
          </div>
        )}
      </div>
    </div>
  );
}
