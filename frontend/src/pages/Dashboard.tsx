// ── Dashboard — terminal aesthetic: KPI grid + pipeline + actions + activity ──

import { useEffect, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../api/client';
import type {
  DashboardResponse,
  MatchingNotification,
  ModelStatusResponse,
  RecentActivity,
} from '../api/types';
import { useMatchingNotifications } from '../hooks/useMatchingNotifications';
import { useAuth } from '../hooks/useAuth';
import Panel, { PanelHead } from '../components/ui/Panel';
import Kpi from '../components/ui/Kpi';
import Pill from '../components/ui/Pill';
import Spinner from '../components/ui/Spinner';

const REFRESH_MS = 30_000;

interface MatchProgress {
  stage: string;
  progress: number;
}

interface NextAction {
  key: string;
  tone: 'danger' | 'warn' | 'info';
  icon: string;
  title: string;
  detail: string;
  to: string;
  cta: string;
}

function deriveActions(d: DashboardResponse): NextAction[] {
  const out: NextAction[] = [];

  if (d.uploads.failed > 0) {
    out.push({
      key: 'failed-uploads',
      tone: 'danger',
      icon: 'error',
      title: `Resolve ${d.uploads.failed} failed upload${d.uploads.failed !== 1 ? 's' : ''}`,
      detail: 'Check column mappings and file format',
      to: '/upload',
      cta: 'View uploads',
    });
  }

  if (d.review.pending > 0) {
    const done = d.review.confirmed + d.review.rejected;
    out.push({
      key: 'pending-review',
      tone: 'warn',
      icon: 'rate_review',
      title: `Review ${d.review.pending} match candidate${d.review.pending !== 1 ? 's' : ''}`,
      detail: done > 0
        ? `${done} already reviewed — keep going`
        : 'Confirm or reject potential duplicate matches',
      to: '/review',
      cta: 'Start reviewing',
    });
  }

  if (d.unified.total_unified > 0) {
    out.push({
      key: 'view-unified',
      tone: 'info',
      icon: 'download',
      title: `Browse ${d.unified.total_unified.toLocaleString()} unified records`,
      detail: `${d.unified.merged} merged · ${d.unified.singletons} singletons`,
      to: '/unified',
      cta: 'Open records',
    });
  }

  return out.slice(0, 3);
}

// ── Progress ring — animates the unified/staged coverage on first render ──
const RING_R = 44;
const RING_C = 2 * Math.PI * RING_R;

function ProgressRing({ pct, unified, total }: { pct: number; unified: number; total: number }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const dash = ready ? (pct / 100) * RING_C : 0;
  const tone = pct >= 75 ? 'var(--ok)' : pct >= 40 ? 'var(--accent)' : 'var(--warn)';

  return (
    <div
      className="panel"
      style={{
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minWidth: 200,
      }}
    >
      <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label={`${pct}% unified`}>
        {/* Track */}
        <circle
          cx="60"
          cy="60"
          r={RING_R}
          fill="none"
          stroke="var(--bg-3)"
          strokeWidth={6}
        />
        {/* Arc */}
        <circle
          cx="60"
          cy="60"
          r={RING_R}
          fill="none"
          stroke={tone}
          strokeWidth={6}
          strokeDasharray={`${dash} ${RING_C}`}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dasharray 1.4s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
        <text
          x="60"
          y="56"
          textAnchor="middle"
          dominantBaseline="central"
          style={{
            fontSize: 24,
            fontWeight: 600,
            fill: 'var(--fg-0)',
            fontFamily: 'IBM Plex Mono, monospace',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
          }}
        >
          {pct}%
        </text>
        <text
          x="60"
          y="76"
          textAnchor="middle"
          dominantBaseline="central"
          style={{
            fontSize: 9,
            fill: 'var(--fg-2)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          unified
        </text>
      </svg>
      <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)', textAlign: 'center' }}>
        {total > 0
          ? `${unified.toLocaleString()} / ${total.toLocaleString()}`
          : 'awaiting data'}
      </div>
    </div>
  );
}

function formatActionMessage(a: RecentActivity): string {
  if (a.entity_type && a.entity_id) {
    return a.entity_name ?? `${a.entity_type} #${a.entity_id}`;
  }
  return '—';
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function Skeleton() {
  return (
    <div style={{ padding: 20 }}>
      <div className="kpi-grid">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="kpi">
            <div className="kpi-label">Loading…</div>
            <div className="kpi-value mono" style={{ color: 'var(--fg-2)' }}>—</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const { data, isLoading, error, refetch } = useQuery<DashboardResponse>({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/api/unified/dashboard'),
    refetchInterval: REFRESH_MS,
  });

  const { data: modelStatus } = useQuery<ModelStatusResponse>({
    queryKey: ['model-status'],
    queryFn: () => api.get('/api/matching/model-status'),
    enabled: isAdmin,
  });

  const [matchProgress, setMatchProgress] = useState<MatchProgress | null>(null);
  const [confirmAction, setConfirmAction] = useState<'retrain' | 'train' | null>(null);

  const retrainMutation = useMutation({
    mutationFn: () => api.post('/api/matching/retrain'),
    onSuccess: () => {
      setConfirmAction(null);
      queryClient.invalidateQueries({ queryKey: ['model-status'] });
    },
    onError: () => setConfirmAction(null),
  });

  const trainMutation = useMutation({
    mutationFn: () => api.post('/api/matching/train-model'),
    onSuccess: () => {
      setConfirmAction(null);
      queryClient.invalidateQueries({ queryKey: ['model-status'] });
    },
    onError: () => setConfirmAction(null),
  });

  useMatchingNotifications(useCallback((n: MatchingNotification) => {
    if (n.type === 'matching_progress') {
      setMatchProgress({ stage: n.data.stage ?? 'Processing', progress: n.data.progress ?? 0 });
    } else if (n.type === 'matching_complete' || n.type === 'matching_failed') {
      setMatchProgress(null);
    }
  }, []));

  if (isLoading) return <Skeleton />;

  if (error || !data) {
    return (
      <div className="scroll" style={{ height: '100%' }}>
        <div style={{ padding: 20 }}>
          <Panel>
            <div style={{ padding: 28, textAlign: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--danger)' }}>
                cloud_off
              </span>
              <p style={{ marginTop: 12, color: 'var(--danger)', fontWeight: 500 }}>
                {error instanceof Error ? error.message : 'Failed to load dashboard'}
              </p>
              <button onClick={() => refetch()} className="btn btn-sm" style={{ marginTop: 12 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>refresh</span>
                Retry
              </button>
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  const { uploads, matching, review, unified, recent_activity } = data;
  const coverage = uploads.total_staged > 0
    ? Math.round((unified.total_unified / uploads.total_staged) * 100)
    : 0;
  const actions = deriveActions(data);
  const isMatchRunning = matchProgress !== null;

  const reviewedTotal = review.confirmed + review.rejected;

  // Per-stage completion → derive the "current" stage as the first not-done one.
  const stageDone = [
    uploads.total_staged > 0,
    matching.total_candidates > 0 && !isMatchRunning,
    reviewedTotal > 0 && review.pending === 0,
    unified.total_unified > 0 && coverage >= 99,
  ];
  let activeIdx = stageDone.findIndex(d => !d);
  if (activeIdx === -1) activeIdx = stageDone.length;

  type StageStatus = 'done' | 'active' | 'queued';
  const pipelineStages: Array<{
    n: number;
    label: string;
    stat: string;
    unit: string;
    status: StageStatus;
  }> = [
    { n: 1, label: 'Ingest', stat: uploads.total_staged.toLocaleString(), unit: 'rows' },
    { n: 2, label: 'Match', stat: matching.total_candidates.toLocaleString(), unit: 'pairs' },
    { n: 3, label: 'Review', stat: review.pending.toLocaleString(), unit: 'pending' },
    { n: 4, label: 'Unify', stat: unified.total_unified.toLocaleString(), unit: 'merged' },
  ].map((s, i) => ({
    ...s,
    status: i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'queued',
  }));

  const lineFillPct = pipelineStages.length > 1
    ? (Math.min(activeIdx, pipelineStages.length - 1) / (pipelineStages.length - 1)) * 100
    : 0;

  return (
    <div className="scroll" style={{ height: '100%' }}>
      <div style={{ padding: 20 }}>
        {/* Page header */}
        <div className="fade" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Overview</h1>
              <Pill tone="accent" dot>
                <span className="live-dot">live</span>
              </Pill>
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 2 }}>
              Record unification pipeline · {uploads.total_staged.toLocaleString()} rows staged · {unified.total_unified.toLocaleString()} unified
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => refetch()} className="btn btn-sm">
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>refresh</span>
              Refresh
            </button>
            <Link to="/upload" className="btn btn-sm btn-primary" style={{ textDecoration: 'none' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>add</span>
              New batch
            </Link>
          </div>
        </div>

        {/* Hero ring + KPI grid */}
        <div
          className="fade"
          style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 14 }}
        >
          <ProgressRing pct={coverage} unified={unified.total_unified} total={uploads.total_staged} />
          <div
            className="kpi-grid"
            style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
          >
            {/* Records staged — ingestion success rate */}
            {(() => {
              const totalBatches = uploads.completed + uploads.failed;
              const successRate = totalBatches > 0
                ? Math.round((uploads.completed / totalBatches) * 100)
                : 100;
              const tone = uploads.failed > 0
                ? (successRate >= 90 ? 'warn' : 'danger')
                : 'ok';
              return (
                <Kpi
                  icon="inventory_2"
                  label="Records staged"
                  value={uploads.total_staged.toLocaleString()}
                  delta={
                    <>
                      <span className="material-symbols-outlined" style={{ fontSize: 11 }}>
                        {uploads.failed > 0 ? 'error' : 'check_circle'}
                      </span>
                      {uploads.completed} of {totalBatches} batches{uploads.failed > 0 ? ` · ${uploads.failed} failed` : ' clean'}
                    </>
                  }
                  bar={successRate}
                  tone={tone}
                />
              );
            })()}

            {/* Unified records — coverage = unified / staged */}
            <Kpi
              icon="verified"
              label="Unified records"
              value={unified.total_unified.toLocaleString()}
              delta={
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: 11 }}>donut_large</span>
                  {coverage}% coverage · {unified.merged.toLocaleString()} merged · {unified.singletons.toLocaleString()} singletons
                </>
              }
              bar={coverage}
              tone="accent"
            />

            {/* Pending review — load on the queue */}
            {(() => {
              const reviewedTotal = review.confirmed + review.rejected;
              const grandTotal = review.pending + reviewedTotal;
              const completionPct = grandTotal > 0
                ? Math.round((reviewedTotal / grandTotal) * 100)
                : 100;
              const tone = review.pending === 0 ? 'ok' : 'warn';
              return (
                <Kpi
                  icon="pending_actions"
                  label="Pending review"
                  value={review.pending.toLocaleString()}
                  delta={
                    review.pending === 0 ? (
                      <>
                        <span className="material-symbols-outlined" style={{ fontSize: 11, color: 'var(--ok)' }}>
                          task_alt
                        </span>
                        queue clear · {reviewedTotal.toLocaleString()} reviewed
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined" style={{ fontSize: 11 }}>schedule</span>
                        {completionPct}% reviewed · {review.confirmed.toLocaleString()} ✓ · {review.rejected.toLocaleString()} ✗
                      </>
                    )
                  }
                  bar={completionPct}
                  tone={tone}
                />
              );
            })()}

            {/* Avg confidence — match score health */}
            {(() => {
              const conf = matching.avg_confidence ?? 0;
              const pct = Math.round(conf * 100);
              const tone = conf === 0 ? 'warn' : conf >= 0.85 ? 'ok' : conf >= 0.70 ? 'accent' : 'warn';
              return (
                <Kpi
                  icon="auto_graph"
                  label="Avg confidence"
                  value={matching.avg_confidence ? matching.avg_confidence.toFixed(3) : '—'}
                  delta={
                    matching.total_groups > 0 ? (
                      <>
                        <span className="material-symbols-outlined" style={{ fontSize: 11 }}>hub</span>
                        {matching.total_candidates.toLocaleString()} candidates · {matching.total_groups.toLocaleString()} groups
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined" style={{ fontSize: 11 }}>hourglass_empty</span>
                        awaiting matches
                      </>
                    )
                  }
                  bar={pct}
                  tone={tone}
                />
              );
            })()}
          </div>
        </div>

        {/* Pipeline + Suggested actions row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 14, marginTop: 14 }}>
          <Panel className="fade">
            <PanelHead>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="panel-title">Pipeline</span>
                <Pill tone="ok" dot>healthy</Pill>
              </div>
              {isMatchRunning && (
                <Pill tone="accent">
                  <Spinner size={10} />
                  {matchProgress!.stage} · {matchProgress!.progress}%
                </Pill>
              )}
            </PanelHead>
            <div style={{ padding: '20px 14px 22px', overflowX: 'auto' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${pipelineStages.length}, 1fr)`,
                  gap: 0,
                  position: 'relative',
                }}
              >
                {/* Track */}
                <div
                  style={{
                    position: 'absolute',
                    top: 16,
                    left: '6%',
                    right: '6%',
                    height: 2,
                    background: 'var(--border-0)',
                    zIndex: 0,
                  }}
                />
                {/* Filled progress */}
                <div
                  style={{
                    position: 'absolute',
                    top: 16,
                    left: '6%',
                    width: `calc((100% - 12%) * ${lineFillPct / 100})`,
                    height: 2,
                    background: 'var(--accent)',
                    transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                    zIndex: 0,
                  }}
                />
                {pipelineStages.map(s => {
                  const isActive = s.status === 'active';
                  const isDone = s.status === 'done';
                  const squareBg = isActive ? 'var(--accent)' : 'var(--bg-1)';
                  const squareBorder = isActive || isDone ? 'var(--accent)' : 'var(--border-1)';
                  const squareColor = isActive ? '#fff' : isDone ? 'var(--accent)' : 'var(--fg-2)';
                  const labelColor = isActive ? 'var(--accent)' : isDone ? 'var(--fg-1)' : 'var(--fg-2)';
                  const statColor = isActive ? 'var(--accent)' : isDone ? 'var(--fg-0)' : 'var(--fg-2)';
                  return (
                    <div key={s.n} style={{ textAlign: 'center', position: 'relative', padding: '0 4px', zIndex: 1 }}>
                      <div
                        className={isActive ? 'pulse-scale' : undefined}
                        style={{
                          position: 'relative',
                          width: 32,
                          height: 32,
                          margin: '0 auto',
                          background: squareBg,
                          border: `2px solid ${squareBorder}`,
                          color: squareColor,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: 'IBM Plex Mono, monospace',
                          fontSize: 11,
                          fontWeight: 600,
                          borderRadius: 6,
                          transition: 'background 0.3s ease, color 0.3s ease, border-color 0.3s ease',
                        }}
                      >
                        {isDone ? (
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">
                            check
                          </span>
                        ) : (
                          s.n
                        )}
                      </div>
                      <div className="label" style={{ marginTop: 8, color: labelColor }}>
                        {s.label}
                      </div>
                      <div
                        className="mono tnum"
                        style={{
                          fontSize: 18,
                          fontWeight: 600,
                          marginTop: 2,
                          color: statColor,
                        }}
                      >
                        {s.stat}
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--fg-2)', marginTop: 2 }}>
                        {s.unit}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Panel>

          <Panel className="fade">
            <PanelHead title="Next steps" />
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {actions.length > 0 ? (
                actions.map(a => (
                  <Link
                    key={a.key}
                    to={a.to}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: 10,
                      background: `var(--${a.tone}-soft)`,
                      borderRadius: 4,
                      textDecoration: 'none',
                      color: 'var(--fg-0)',
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 16, color: `var(--${a.tone})`, marginTop: 1 }}
                    >
                      {a.icon}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-0)' }}>{a.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 2 }}>{a.detail}</div>
                    </div>
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 14, color: `var(--${a.tone})`, marginTop: 1 }}
                    >
                      arrow_forward
                    </span>
                  </Link>
                ))
              ) : uploads.total_staged === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 12px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--fg-3)' }}>
                    cloud_upload
                  </span>
                  <div style={{ fontSize: 13, fontWeight: 500, marginTop: 8 }}>Upload your first CSV</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 4, marginBottom: 12 }}>
                    Once uploaded we’ll embed, block, and queue match candidates.
                  </div>
                  <Link to="/upload" className="btn btn-sm btn-accent" style={{ textDecoration: 'none' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>add</span>
                    Upload
                  </Link>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px 12px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--ok)' }}>
                    check_circle
                  </span>
                  <div style={{ fontSize: 13, fontWeight: 500, marginTop: 8 }}>All caught up</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 4 }}>
                    No pending uploads, reviews, or merges.
                  </div>
                </div>
              )}
            </div>
          </Panel>
        </div>

        {/* Activity log */}
        <Panel className="fade" style={{ marginTop: 14 }}>
          <PanelHead
            title="Activity log"
            actions={
              <Pill dot>
                <span className="live-dot">streaming</span>
              </Pill>
            }
          />
          <div className="scroll" style={{ maxHeight: 400 }}>
            {recent_activity.length === 0 ? (
              <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: 'var(--fg-2)' }}>
                No activity yet
              </div>
            ) : (
              recent_activity.slice(0, 20).map((a, i) => (
                <div
                  key={a.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '90px 100px 1fr',
                    gap: 10,
                    padding: '8px 14px',
                    borderBottom: i < recent_activity.length - 1 ? '1px solid var(--border-0)' : 'none',
                    fontSize: 11,
                    alignItems: 'baseline',
                  }}
                >
                  <span className="mono" style={{ color: 'var(--fg-2)' }}>{formatTime(a.created_at)}</span>
                  <span className="mono" style={{ color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.entity_type ?? 'system'}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <span
                      className="mono"
                      style={{
                        color: 'var(--accent)',
                        fontSize: 10,
                        fontWeight: 500,
                        background: 'var(--accent-soft)',
                        padding: '1px 5px',
                        borderRadius: 3,
                        marginRight: 6,
                      }}
                    >
                      {a.action}
                    </span>
                    <span style={{ color: 'var(--fg-0)' }}>{formatActionMessage(a)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>

        {/* ML & Matching (admin) */}
        {isAdmin && modelStatus && (
          <Panel className="fade" style={{ marginTop: 14 }}>
            <PanelHead title="ML & matching" />
            <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              <div>
                <div className="label">Reviews</div>
                <div className="mono tnum" style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>
                  {modelStatus.review_count}
                </div>
              </div>
              <div>
                <div className="label">ML model</div>
                <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4 }}>
                  {modelStatus.ml_model_exists ? 'Trained' : 'None'}
                </div>
              </div>
              <div>
                <div className="label">Last trained</div>
                <div className="mono" style={{ fontSize: 12, marginTop: 4, color: 'var(--fg-1)' }}>
                  {modelStatus.last_trained ? new Date(modelStatus.last_trained).toLocaleDateString() : '—'}
                </div>
              </div>
              <div>
                <div className="label">Signal weights</div>
                <div className="mono" style={{ fontSize: 11, marginTop: 4, color: 'var(--fg-1)' }}>
                  {Object.values(modelStatus.current_weights).map(w => w.toFixed(2)).join(' · ')}
                </div>
              </div>
            </div>
            <div
              style={{
                padding: '10px 14px',
                borderTop: '1px solid var(--border-0)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
              }}
            >
              {confirmAction ? (
                <>
                  <span style={{ fontSize: 12, color: 'var(--warn)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>warning</span>
                    {confirmAction === 'retrain'
                      ? 'Recalculate signal weights from review decisions?'
                      : 'Train a new ML model from review decisions?'}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => (confirmAction === 'retrain' ? retrainMutation.mutate() : trainMutation.mutate())}
                      className="btn btn-sm btn-accent"
                    >
                      Confirm
                    </button>
                    <button onClick={() => setConfirmAction(null)} className="btn btn-sm">
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 11, color: 'var(--fg-2)' }}>
                    Retraining requires ≥20 reviews · ML training requires ≥50 reviews.
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => setConfirmAction('retrain')}
                      disabled={modelStatus.review_count < 20 || retrainMutation.isPending}
                      className="btn btn-sm"
                      title={modelStatus.review_count < 20 ? 'Need at least 20 reviews' : ''}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>tune</span>
                      Retrain weights
                    </button>
                    <button
                      onClick={() => setConfirmAction('train')}
                      disabled={modelStatus.review_count < 50 || trainMutation.isPending}
                      className="btn btn-sm"
                      title={modelStatus.review_count < 50 ? 'Need at least 50 reviews' : ''}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>auto_awesome</span>
                      Train ML model
                    </button>
                  </div>
                </>
              )}
            </div>
          </Panel>
        )}

        {/* spacer for breathing room */}
        <div style={{ height: 12 }} />
      </div>
    </div>
  );
}
