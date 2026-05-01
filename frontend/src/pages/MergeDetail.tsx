// ── Merge Detail — field reconciliation for confirmed duplicate pairs ──

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type {
  FieldComparison,
  MatchDetailResponse,
  ReviewActionResponse,
  SupplierDetail,
} from '../api/types';
import { SIGNAL_CONFIG } from '../utils/signals';
import Panel, { PanelHead } from '../components/ui/Panel';
import Pill from '../components/ui/Pill';
import IdChip from '../components/ui/IdChip';
import SourcePill from '../components/ui/SourcePill';
import Hbar from '../components/ui/Hbar';

type Layout = 'sideBySide' | 'stacked' | 'diff';

const LAYOUT_KEY = 'onebase_review_layout';

function getInitialLayout(): Layout {
  const stored = localStorage.getItem(LAYOUT_KEY);
  if (stored === 'sideBySide' || stored === 'stacked' || stored === 'diff') return stored;
  return 'sideBySide';
}

function confidenceTone(conf: number): 'ok' | 'warn' | 'danger' {
  const pct = conf * 100;
  return pct >= 85 ? 'ok' : pct >= 70 ? 'warn' : 'danger';
}

export default function MergeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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

  const isConfirmed = detail?.status === 'confirmed';

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['merge-queue'] });
    queryClient.invalidateQueries({ queryKey: ['review-queue'] });
    queryClient.invalidateQueries({ queryKey: ['review-stats'] });
    queryClient.invalidateQueries({ queryKey: ['review-detail', id] });
    setActionInFlight(null);
  };

  const mergeMutation = useMutation({
    mutationFn: (fieldSelections: { field: string; chosen_supplier_id: number }[]) =>
      api.post<ReviewActionResponse>(`/api/review/candidates/${id}/merge`, {
        field_selections: fieldSelections,
      }),
    onSuccess: (result) => {
      invalidate();
      if (result.unified_supplier_id) {
        navigate(`/unified/${result.unified_supplier_id}`);
      } else {
        navigate('/merge');
      }
    },
    onError: () => setActionInFlight(null),
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.post<ReviewActionResponse>(`/api/review/candidates/${id}/reject`),
    onSuccess: () => {
      invalidate();
      navigate('/merge');
    },
    onError: () => setActionInFlight(null),
  });

  const handleMerge = () => {
    if (!detail) return;
    const fieldSelections = Object.entries(selections).map(([field, chosen_supplier_id]) => ({
      field,
      chosen_supplier_id,
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
              <button onClick={() => navigate('/merge')} className="btn btn-sm" style={{ marginTop: 12 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>arrow_back</span>
                Back to merge queue
              </button>
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  const { supplier_a, supplier_b, field_comparisons, match_signals } = detail;
  const tone = confidenceTone(detail.confidence);
  const conflicts = field_comparisons.filter(f => f.is_conflict);
  const resolvedCount = conflicts.filter(f => selections[f.field] !== undefined).length;
  const allResolved = conflicts.length === 0 || resolvedCount === conflicts.length;

  return (
    <div className="scroll" style={{ height: '100%' }}>
      <div style={{ padding: 20, paddingBottom: 80 }}>

        {/* Header */}
        <div className="fade" style={{ marginBottom: 12 }}>
          <button onClick={() => navigate('/merge')} className="btn btn-sm btn-ghost" style={{ marginBottom: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>arrow_back</span>
            Merge queue
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="pill accent" style={{ padding: '2px 8px', fontSize: 10, fontWeight: 600 }}>STAGE 2 · MERGE</span>
            <IdChip style={{ fontSize: 13, padding: '3px 8px' }}>#{detail.id}</IdChip>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, minWidth: 0 }}>
              {supplier_a.name || `Supplier #${supplier_a.id}`}{' '}
              <span style={{ color: 'var(--fg-3)', fontWeight: 400 }}>↔</span>{' '}
              {supplier_b.name || `Supplier #${supplier_b.id}`}
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
            {supplier_a.data_source_name && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <SourcePill short={supplier_a.data_source_name} />
                <span className="mono">{supplier_a.source_code || `#${supplier_a.id}`}</span>
              </span>
            )}
            {supplier_b.data_source_name && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <SourcePill short={supplier_b.data_source_name} />
                <span className="mono">{supplier_b.source_code || `#${supplier_b.id}`}</span>
              </span>
            )}
          </div>
        </div>

        {/* Signals */}
        <Panel className="fade" style={{ marginBottom: 12 }}>
          <PanelHead title="Signals" />
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Object.keys(match_signals).length + 1}, 1fr)`, gap: 0 }}>
            {Object.entries(match_signals).map(([k, v]) => {
              const meta = SIGNAL_CONFIG[k] ?? { label: k, shortLabel: k, icon: '·' };
              const pct = Math.round(v * 100);
              const t = pct >= 85 ? 'ok' : pct >= 60 ? 'warn' : 'danger';
              return (
                <div key={k} style={{ padding: '10px 14px', borderRight: '1px solid var(--border-0)' }}>
                  <div className="label">{meta.label}</div>
                  <div className="mono tnum" style={{ fontSize: 18, fontWeight: 600, color: `var(--${t})`, marginTop: 4 }}>
                    {v.toFixed(2)}
                  </div>
                  <Hbar value={pct} tone={t} style={{ marginTop: 6 }} />
                </div>
              );
            })}
            <div style={{ padding: '10px 14px', background: 'var(--bg-2)' }}>
              <div className="label">Overall</div>
              <div className="mono tnum" style={{ fontSize: 20, fontWeight: 600, color: `var(--${tone})`, marginTop: 4 }}>
                {detail.confidence.toFixed(3)}
              </div>
              <Hbar value={Math.round(detail.confidence * 100)} tone={tone} style={{ marginTop: 6 }} />
            </div>
          </div>
        </Panel>

        {/* Field comparison — interactive for conflicts */}
        <Panel className="fade" style={{ marginBottom: 12 }}>
          <PanelHead>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span className="panel-title">Field comparison</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--fg-2)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, background: 'var(--warn)', borderRadius: 2 }} />
                  conflict
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, background: 'var(--ok)', borderRadius: 2 }} />
                  identical
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, background: 'var(--info)', borderRadius: 2 }} />
                  source-only
                </span>
              </div>
              {isConfirmed && conflicts.length > 0 && (
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                  background: allResolved ? 'var(--ok-soft)' : 'var(--warn-soft)',
                  color: allResolved ? 'var(--ok)' : 'var(--warn)',
                }}>
                  <span className="mono tnum">{resolvedCount}/{conflicts.length}</span> conflicts resolved
                </span>
              )}
            </div>
            <div className="seg">
              <button className={layout === 'sideBySide' ? 'active' : ''} onClick={() => setLayout('sideBySide')}>Side</button>
              <button className={layout === 'stacked' ? 'active' : ''} onClick={() => setLayout('stacked')}>Stacked</button>
              <button className={layout === 'diff' ? 'active' : ''} onClick={() => setLayout('diff')}>Diff</button>
            </div>
          </PanelHead>

          {layout === 'sideBySide' && (
            <SideBySideLayout
              comparisons={field_comparisons}
              supplierA={supplier_a}
              supplierB={supplier_b}
              selections={selections}
              onSelect={isConfirmed ? (field, id) => setSelections(s => ({ ...s, [field]: id })) : undefined}
            />
          )}
          {layout === 'stacked' && (
            <StackedLayout
              comparisons={field_comparisons}
              supplierA={supplier_a}
              supplierB={supplier_b}
              selections={selections}
              onSelect={isConfirmed ? (field, id) => setSelections(s => ({ ...s, [field]: id })) : undefined}
            />
          )}
          {layout === 'diff' && (
            <DiffLayout
              comparisons={field_comparisons}
              supplierA={supplier_a}
              supplierB={supplier_b}
              selections={selections}
              onSelect={isConfirmed ? (field, id) => setSelections(s => ({ ...s, [field]: id })) : undefined}
            />
          )}
        </Panel>

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

// ─────────────── Layouts (interactive for conflicts) ───────────────

interface LayoutProps {
  comparisons: FieldComparison[];
  supplierA: SupplierDetail;
  supplierB: SupplierDetail;
  selections: Record<string, number>;
  onSelect?: (field: string, supplierId: number) => void;
}

function StatusPill({ comp }: { comp: FieldComparison }) {
  if (comp.is_conflict) return <span className="pill warn" style={{ padding: '1px 6px', fontSize: 10 }}>conflict</span>;
  if (comp.is_identical) return <span className="pill ok" style={{ padding: '1px 6px', fontSize: 10 }}>identical</span>;
  if (comp.is_a_only || comp.is_b_only) return <span className="pill info" style={{ padding: '1px 6px', fontSize: 10 }}>source-only</span>;
  return null;
}

function ChoiceBtn({
  chosen, active, onClick, children,
}: {
  chosen: boolean;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="btn btn-sm"
      style={{
        padding: '2px 8px', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace',
        background: chosen ? 'var(--accent-soft)' : 'transparent',
        border: `1px solid ${chosen ? 'var(--accent)' : 'var(--border-0)'}`,
        color: chosen ? 'var(--accent)' : 'var(--fg-0)',
        opacity: active && !chosen ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function SideBySideLayout({ comparisons, supplierA, supplierB, selections, onSelect }: LayoutProps) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th style={{ width: 180 }}>Field</th>
          <th style={{ borderLeft: '2px solid var(--accent-border)', color: 'var(--accent)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {supplierA.data_source_name && <SourcePill short={supplierA.data_source_name} />}
              {supplierA.name || `#${supplierA.id}`}
            </span>
          </th>
          <th style={{ width: 40 }} />
          <th style={{ borderLeft: '2px solid var(--info-border)', color: 'var(--info)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {supplierB.data_source_name && <SourcePill short={supplierB.data_source_name} />}
              {supplierB.name || `#${supplierB.id}`}
            </span>
          </th>
          <th style={{ width: 90 }}>Status</th>
        </tr>
      </thead>
      <tbody>
        {comparisons.map(f => {
          const isSelected = selections[f.field] !== undefined;
          return (
            <tr key={f.field} style={{ background: f.is_conflict ? 'var(--warn-soft)' : 'transparent' }}>
              <td>
                <div style={{ fontWeight: 500 }}>{f.label}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--fg-2)' }}>{f.field}</div>
              </td>
              <td style={{ borderLeft: '2px solid var(--accent-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="mono" style={{ fontSize: 12, color: f.value_a ? 'var(--fg-0)' : 'var(--fg-3)', flex: 1 }}>
                    {f.value_a || '∅'}
                  </span>
                  {f.is_conflict && onSelect && (
                    <ChoiceBtn
                      chosen={selections[f.field] === supplierA.id}
                      active={isSelected}
                      onClick={() => onSelect(f.field, supplierA.id)}
                    >
                      Use A
                    </ChoiceBtn>
                  )}
                </div>
              </td>
              <td style={{ textAlign: 'center', color: 'var(--fg-3)' }}>
                {f.is_conflict ? (
                  <span style={{ color: 'var(--warn)', fontSize: 11, fontWeight: 600 }}>vs</span>
                ) : f.is_identical ? (
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>check</span>
                ) : (
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>arrow_forward</span>
                )}
              </td>
              <td style={{ borderLeft: '2px solid var(--info-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {f.is_conflict && onSelect && (
                    <ChoiceBtn
                      chosen={selections[f.field] === supplierB.id}
                      active={isSelected}
                      onClick={() => onSelect(f.field, supplierB.id)}
                    >
                      Use B
                    </ChoiceBtn>
                  )}
                  <span className="mono" style={{ fontSize: 12, color: f.value_b ? 'var(--fg-0)' : 'var(--fg-3)', flex: 1 }}>
                    {f.value_b || '∅'}
                  </span>
                </div>
              </td>
              <td><StatusPill comp={f} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function StackedLayout({ comparisons, supplierA, supplierB, selections, onSelect }: LayoutProps) {
  return (
    <div style={{ padding: 12 }}>
      {comparisons.map(f => {
        const isSelected = selections[f.field] !== undefined;
        return (
          <div key={f.field} style={{ marginBottom: 10, padding: 10, background: 'var(--bg-0)', border: '1px solid var(--border-0)', borderRadius: 4 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{f.label}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-2)', marginLeft: 8 }}>{f.field}</span>
              </div>
              <StatusPill comp={f} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {([['a', supplierA, f.value_a] as const, ['b', supplierB, f.value_b] as const]).map(([key, sup, val]) => {
                const chosen = f.is_conflict && selections[f.field] === sup.id;
                return (
                  <div
                    key={key}
                    onClick={() => f.is_conflict && onSelect && onSelect(f.field, sup.id)}
                    style={{
                      padding: '8px 10px',
                      border: chosen
                        ? '2px solid var(--accent)'
                        : `1px solid ${key === 'a' ? 'var(--accent-border)' : 'var(--info-border)'}`,
                      borderLeft: chosen
                        ? '3px solid var(--accent)'
                        : `3px solid ${key === 'a' ? 'var(--accent-border)' : 'var(--info-border)'}`,
                      background: chosen ? 'var(--accent-soft)' : 'var(--bg-1)',
                      borderRadius: 4,
                      cursor: f.is_conflict && onSelect ? 'pointer' : 'default',
                      opacity: f.is_conflict && isSelected && !chosen ? 0.5 : 1,
                      transition: 'border-color 0.1s, background 0.1s, opacity 0.1s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      {sup.data_source_name && <SourcePill short={sup.data_source_name} />}
                      {chosen && (
                        <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>✓ chosen</span>
                      )}
                    </div>
                    <div className="mono" style={{ fontSize: 12, color: val ? 'var(--fg-0)' : 'var(--fg-3)' }}>
                      {val || '∅'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DiffLayout({ comparisons, supplierA, supplierB, selections, onSelect }: LayoutProps) {
  return (
    <div>
      {comparisons.map((f, i) => {
        const isSelected = selections[f.field] !== undefined;
        return (
          <div key={f.field} style={{ borderBottom: i < comparisons.length - 1 ? '1px solid var(--border-0)' : 'none', padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{f.label}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-2)', marginLeft: 8 }}>{f.field}</span>
              </div>
              <StatusPill comp={f} />
            </div>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, background: 'var(--bg-0)', border: '1px solid var(--border-0)', borderRadius: 4, overflow: 'hidden' }}>
              {([['a', supplierA, f.value_a, f.is_conflict ? '−' : ' ', f.is_conflict ? 'var(--danger)' : 'var(--border-0)', f.is_conflict ? 'var(--danger-soft)' : 'transparent'] as const,
                 ['b', supplierB, f.value_b, f.is_conflict ? '+' : ' ', f.is_conflict ? 'var(--ok)' : 'var(--border-0)', f.is_conflict ? 'var(--ok-soft)' : 'transparent'] as const]).map(([key, sup, val, symbol, borderColor, bg]) => {
                const chosen = f.is_conflict && selections[f.field] === sup.id;
                return (
                  <div
                    key={key}
                    onClick={() => f.is_conflict && onSelect && onSelect(f.field, sup.id)}
                    style={{
                      padding: '6px 10px',
                      background: chosen ? 'var(--accent-soft)' : bg,
                      borderLeft: `3px solid ${chosen ? 'var(--accent)' : borderColor}`,
                      display: 'flex', alignItems: 'center', gap: 8,
                      cursor: f.is_conflict && onSelect ? 'pointer' : 'default',
                      opacity: f.is_conflict && isSelected && !chosen ? 0.5 : 1,
                      transition: 'background 0.1s, opacity 0.1s',
                    }}
                  >
                    <span className="mono" style={{ width: 20, color: borderColor, fontWeight: 600 }}>{symbol}</span>
                    {sup.data_source_name && <SourcePill short={sup.data_source_name} />}
                    <span style={{ color: 'var(--fg-0)', flex: 1 }}>{val || '∅'}</span>
                    {chosen && (
                      <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>✓</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
