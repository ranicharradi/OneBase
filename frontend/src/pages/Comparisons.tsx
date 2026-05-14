import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { api } from '../api/client';
import { useComparisonStatus } from '../hooks/useComparisonStatus';
import type { ComparisonMode, ComparisonRunResponse, ComparisonRunStatus } from '../api/types';
import { useSelectedRecordType } from '../contexts/RecordTypeContext';
import Panel, { PanelHead } from '../components/ui/Panel';
import Pill from '../components/ui/Pill';
import Hbar from '../components/ui/Hbar';
import Spinner from '../components/ui/Spinner';

// ── Helpers ───────────────────────────────────────────

function relTime(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function duration(started: string | null, finished: string | null): string | null {
  if (!started || !finished) return null;
  const ms = new Date(finished).getTime() - new Date(started).getTime();
  if (ms < 1000) return '<1s';
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m`;
}

// ── Constants ─────────────────────────────────────────

const MODE_LABEL: Record<ComparisonMode, string> = {
  FILE_VS_FILE: 'File × File',
  FILE_VS_GOLDEN: 'File × Golden',
  MULTI_FILE: 'N-Way',
};

const MODE_GLYPH: Record<ComparisonMode, string> = {
  FILE_VS_FILE: '⊕',
  FILE_VS_GOLDEN: '⊞',
  MULTI_FILE: '⋈',
};

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral' | 'info'> = {
  completed: 'ok',
  running:   'info',
  pending:   'neutral',
  failed:    'danger',
  stale:     'warn',
};

const COMP_STAGES = [
  { key: 'BLOCKING',   label: 'Blocking'   },
  { key: 'SCORING',    label: 'Scoring'    },
  { key: 'CLUSTERING', label: 'Clustering' },
  { key: 'INSERTING',  label: 'Writing'    },
];

// ── Matching pipeline ────────────────────────────────

function MatchingPipeline({ status }: { status?: ComparisonRunStatus }) {
  const N = COMP_STAGES.length;
  const isComplete = status?.state === 'COMPLETE' || status?.state === 'SUCCESS';
  const isFailed = status?.state === 'FAILURE';
  const activeIdx = status?.stage
    ? COMP_STAGES.findIndex(s => s.key === status.stage)
    : -1;
  const queued = !status || (status.state === 'PENDING' && !status.stage);
  const pct = isComplete ? 100 : (status?.progress ?? 0);

  const sidePct = (1 / (2 * N)) * 100;
  const progressPct = isComplete
    ? 100 - 2 * sidePct
    : Math.max(0, activeIdx) / Math.max(1, N - 1) * (100 - 2 * sidePct);

  return (
    <div style={{ padding: '12px 16px 14px', borderTop: '1px solid var(--border-0)' }}>
      {/* Overall progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Hbar
          value={pct}
          tone={isComplete ? 'ok' : isFailed ? 'danger' : 'accent'}
          style={{ height: 3, flex: 1 }}
        />
        <span className="mono tnum" style={{
          fontSize: 11, fontWeight: 600, width: 36, textAlign: 'right',
          color: isComplete ? 'var(--ok)' : isFailed ? 'var(--danger)' : 'var(--accent)',
        }}>
          {Math.round(pct)}%
        </span>
      </div>

      {/* Stage track */}
      <div style={{ position: 'relative' }}>
        <div style={{
          position: 'absolute', top: 10,
          left: `${sidePct}%`, right: `${sidePct}%`,
          height: 1.5, background: 'var(--border-0)', zIndex: 0,
        }} />
        <div style={{
          position: 'absolute', top: 10,
          left: `${sidePct}%`, width: `${progressPct}%`,
          height: 1.5,
          background: isFailed ? 'var(--danger)' : 'var(--accent)',
          transition: 'width 0.5s ease', zIndex: 1,
        }} />

        <div style={{ display: 'flex', position: 'relative', zIndex: 2 }}>
          {COMP_STAGES.map((stage, i) => {
            const done   = isComplete || (activeIdx >= 0 && i < activeIdx);
            const active = !isComplete && !isFailed && i === activeIdx;
            const failed = isFailed && i === activeIdx;

            const bg     = done ? 'var(--accent)' : active ? 'var(--accent-soft)' : failed ? 'var(--danger-soft)' : 'var(--bg-3)';
            const border = done ? 'var(--accent)' : active ? 'var(--accent)' : failed ? 'var(--danger)' : 'var(--border-1)';

            return (
              <div key={stage.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  background: bg, border: `2px solid ${border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.3s, border-color 0.3s',
                }}>
                  {done   ? <span style={{ fontSize: 8, color: 'var(--bg-0)', fontWeight: 700 }}>✓</span>
                  : active ? <Spinner size={8} color="var(--accent)" />
                  : failed ? <span style={{ fontSize: 8, color: 'var(--danger)', fontWeight: 700 }}>✕</span>
                  : null}
                </div>
                <span className="label" style={{
                  fontSize: 9, textAlign: 'center',
                  color: done || active ? 'var(--fg-1)' : 'var(--fg-3)',
                }}>
                  {stage.label}
                </span>
                <span className="mono tnum" style={{
                  fontSize: 9, textAlign: 'center', minHeight: 12,
                  color: done ? 'var(--fg-3)' : active ? 'var(--accent)' : 'var(--fg-3)',
                }}>
                  {done ? 'done' : active ? `${Math.round(pct)}%` : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {queued ? (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--fg-3)' }}>
          <Spinner size={8} color="var(--fg-3)" />
          queued, waiting for worker…
        </div>
      ) : status?.detail ? (
        <div className="mono" style={{
          marginTop: 10, padding: '4px 8px',
          background: 'var(--bg-2)', borderRadius: 3,
          fontSize: 10, color: 'var(--fg-2)',
        }}>
          {status.detail}
        </div>
      ) : null}
    </div>
  );
}

// ── Active run card ───────────────────────────────────

function ActiveRunCard({ run }: { run: ComparisonRunResponse }) {
  const { data: liveStatus } = useComparisonStatus(run.id);

  return (
    <div className="fade" style={{
      marginBottom: 10,
      background: 'var(--bg-1)',
      border: '1px solid var(--accent-border)',
      borderRadius: 6,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '9px 14px',
        background: 'var(--accent-soft)',
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--accent)', flexShrink: 0 }}>
          compare_arrows
        </span>
        <span className="mono" style={{ fontSize: 12, fontWeight: 500 }}>
          Run <span style={{ color: 'var(--accent)' }}>#{run.id}</span>
        </span>
        <span className="pill accent" style={{ fontSize: 10, gap: 4 }}>
          <span style={{ fontFamily: "'Apple Symbols', system-ui" }}>{MODE_GLYPH[run.mode]}</span>
          {MODE_LABEL[run.mode]}
        </span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>{run.type}</span>
        <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>
          {run.batch_ids.length} batch{run.batch_ids.length !== 1 ? 'es' : ''}
        </span>
        <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>{relTime(run.created_at)}</span>
        <div style={{ marginLeft: 'auto' }}>
          <Pill tone="info" dot style={{ fontSize: 10 }}>{run.status}</Pill>
        </div>
      </div>

      {/* Live pipeline */}
      <MatchingPipeline status={liveStatus} />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────

export default function Comparisons() {
  const navigate = useNavigate();
  const { selectedType, withRecordType } = useSelectedRecordType();
  const { data: runs, isLoading } = useQuery({
    queryKey: ['comparison-runs', selectedType],
    queryFn: () => api.get<ComparisonRunResponse[]>(`/api/comparisons/?type=${selectedType}`),
    refetchInterval: (q) => {
      const data = q.state.data as ComparisonRunResponse[] | undefined;
      const hasActive = data?.some(r => r.status === 'pending' || r.status === 'running');
      return hasActive ? 3000 : false;
    },
  });

  const activeRuns = (runs ?? []).filter(r => r.status === 'pending' || r.status === 'running');
  const historyRuns = (runs ?? []).filter(r => r.status !== 'pending' && r.status !== 'running');

  return (
    <div className="scroll" style={{ height: '100%' }}>
      <div style={{ padding: 20 }}>

        {/* ── Stage rail ── */}
        <div className="fade" style={{
          display: 'flex', alignItems: 'stretch',
          background: 'var(--bg-1)', border: '1px solid var(--border-0)', borderRadius: 6,
          overflow: 'hidden', marginBottom: 12,
        }}>
          {/* 01 Match — active */}
          <div style={{ padding: '10px 16px', minWidth: 210, background: 'var(--info-soft)', borderRight: '1px solid var(--border-0)', position: 'relative', overflow: 'hidden' }}>
            <span className="mono" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 52, fontWeight: 700, color: 'var(--info)', opacity: 0.08, lineHeight: 1, pointerEvents: 'none', userSelect: 'none' }}>01</span>
            <div className="label" style={{ color: 'var(--info)', fontWeight: 600, position: 'relative' }}>Match</div>
            <div style={{ fontSize: 11, color: 'var(--fg-1)', marginTop: 2, position: 'relative' }}>Candidate pairs</div>
            <div className="mono tnum" style={{ fontSize: 18, fontWeight: 600, color: 'var(--info)', marginTop: 4, position: 'relative' }}>
              {runs?.length ?? '—'}{' '}
              <span style={{ fontSize: 10, color: 'var(--fg-2)', fontWeight: 400 }}>runs</span>
            </div>
          </div>
          <div style={{ alignSelf: 'center', padding: '0 8px', color: 'var(--fg-3)', fontSize: 14 }}>→</div>
          {/* 02 Review — dimmed, clickable */}
          <div
            onClick={() => navigate(withRecordType('/review'))}
            style={{ padding: '10px 16px', minWidth: 210, opacity: 0.5, background: 'var(--bg-2)', borderRight: '1px solid var(--border-0)', position: 'relative', overflow: 'hidden', cursor: 'pointer' }}
            title="Go to Review queue"
          >
            <span className="mono" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 52, fontWeight: 700, color: 'var(--fg-0)', opacity: 0.05, lineHeight: 1, pointerEvents: 'none', userSelect: 'none' }}>02</span>
            <div className="label" style={{ color: 'var(--fg-2)', fontWeight: 600, position: 'relative' }}>Review</div>
            <div style={{ fontSize: 11, color: 'var(--fg-1)', marginTop: 2, position: 'relative' }}>Same record?</div>
            <div className="mono tnum" style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg-1)', marginTop: 4, position: 'relative' }}>
              —{' '}
              <span style={{ fontSize: 10, color: 'var(--fg-2)', fontWeight: 400 }}>pending</span>
            </div>
          </div>
          <div style={{ alignSelf: 'center', padding: '0 8px', color: 'var(--fg-3)', fontSize: 14 }}>→</div>
          {/* 03 Merge — dimmed, clickable */}
          <div
            onClick={() => navigate(withRecordType('/merge'))}
            style={{ padding: '10px 16px', minWidth: 210, opacity: 0.5, background: 'var(--bg-2)', borderRight: '1px solid var(--border-0)', position: 'relative', overflow: 'hidden', cursor: 'pointer' }}
            title="Go to Merge queue"
          >
            <span className="mono" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 52, fontWeight: 700, color: 'var(--fg-0)', opacity: 0.05, lineHeight: 1, pointerEvents: 'none', userSelect: 'none' }}>03</span>
            <div className="label" style={{ color: 'var(--fg-2)', fontWeight: 600, position: 'relative' }}>Merge</div>
            <div style={{ fontSize: 11, color: 'var(--fg-1)', marginTop: 2, position: 'relative' }}>Reconcile fields</div>
            <div className="mono tnum" style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg-1)', marginTop: 4, position: 'relative' }}>
              —{' '}
              <span style={{ fontSize: 10, color: 'var(--fg-2)', fontWeight: 400 }}>queued</span>
            </div>
          </div>
          <div style={{ alignSelf: 'center', padding: '0 8px', color: 'var(--fg-3)', fontSize: 14 }}>→</div>
          {/* 04 Unified — dimmed */}
          <div
            onClick={() => navigate(withRecordType('/unified'))}
            style={{ padding: '10px 16px', flex: 1, opacity: 0.45, background: 'var(--bg-2)', position: 'relative', overflow: 'hidden', cursor: 'pointer' }}
            title="Go to Unified records"
          >
            <span className="mono" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 52, fontWeight: 700, color: 'var(--fg-0)', opacity: 0.05, lineHeight: 1, pointerEvents: 'none', userSelect: 'none' }}>04</span>
            <div className="label" style={{ color: 'var(--fg-2)', fontWeight: 600, position: 'relative' }}>Unified</div>
            <div style={{ fontSize: 11, color: 'var(--fg-1)', marginTop: 2, position: 'relative' }}>Unified records</div>
            <div className="mono tnum" style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg-1)', marginTop: 4, position: 'relative' }}>
              —{' '}
              <span style={{ fontSize: 10, color: 'var(--fg-2)', fontWeight: 400 }}>records</span>
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="fade" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="pill info" style={{ padding: '2px 8px', fontSize: 10, fontWeight: 600 }}>STAGE 1 · MATCH</span>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Runs</h1>
          </div>
          <Link to="/compare" className="btn btn-sm btn-accent">New run ▸</Link>
        </div>

        {/* Active runs (pending / running) */}
        {activeRuns.map(r => <ActiveRunCard key={r.id} run={r} />)}

        {/* History table */}
        <Panel className="fade">
          <PanelHead>
            <span className="panel-title">Comparison history</span>
            {historyRuns.length > 0 && (
              <span className="mono dim" style={{ fontSize: 11 }}>{historyRuns.length} run{historyRuns.length !== 1 ? 's' : ''}</span>
            )}
          </PanelHead>

          {isLoading ? (
            <div style={{ padding: 28, textAlign: 'center', color: 'var(--fg-3)' }}>Loading…</div>
          ) : historyRuns.length === 0 && activeRuns.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 22, marginBottom: 10, color: 'var(--fg-3)', fontFamily: "'Apple Symbols', system-ui" }}>⊕</div>
              <div style={{ fontSize: 13, color: 'var(--fg-2)', marginBottom: 12 }}>No comparison runs yet</div>
              <Link to="/compare" className="btn btn-sm btn-accent">Start a run ▸</Link>
            </div>
          ) : historyRuns.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--fg-3)', fontSize: 12 }}>
              No completed runs yet
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 64 }}>#</th>
                  <th>Mode</th>
                  <th>Type</th>
                  <th className="num" style={{ width: 72 }}>Batches</th>
                  <th className="num" style={{ width: 96 }}>Candidates</th>
                  <th style={{ width: 80 }}>Status</th>
                  <th style={{ width: 100 }}>Created</th>
                  <th style={{ width: 72 }}>Duration</th>
                </tr>
              </thead>
              <tbody>
                {historyRuns.map(r => {
                  const stale = r.status === 'stale';
                  const dur = duration(r.started_at, r.finished_at);
                  return (
                    <tr
                      key={r.id}
                      style={{ opacity: stale ? 0.45 : 1, cursor: 'pointer' }}
                    onClick={() => navigate(withRecordType(`/review?comparison_run_id=${r.id}`))}
                    >
                      <td>
                        <Link
                          to={withRecordType(`/review?comparison_run_id=${r.id}`)}
                          className="mono"
                          style={{ fontSize: 12, color: 'var(--accent)' }}
                          onClick={e => e.stopPropagation()}
                        >
                          #{r.id}
                        </Link>
                        {r.name && (
                          <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--fg-2)' }}>{r.name}</span>
                        )}
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span className="mono" style={{ fontSize: 12, color: 'var(--accent)', fontFamily: "'Apple Symbols', system-ui" }}>
                            {MODE_GLYPH[r.mode]}
                          </span>
                          <span style={{ fontSize: 12 }}>{MODE_LABEL[r.mode]}</span>
                        </span>
                      </td>
                      <td>
                        <span className="mono" style={{ fontSize: 11 }}>{r.type}</span>
                      </td>
                      <td className="num">
                        <span className="mono" style={{ fontSize: 12 }}>{r.batch_ids.length}</span>
                      </td>
                      <td className="num" style={{ textDecoration: stale ? 'line-through' : undefined }}>
                        <span className="mono tnum" style={{ fontSize: 12 }}>
                          {(r.stats?.candidate_count ?? 0).toLocaleString()}
                        </span>
                      </td>
                      <td>
                        <Pill tone={STATUS_TONE[r.status] ?? 'neutral'} dot>
                          {r.status}
                        </Pill>
                      </td>
                      <td title={new Date(r.created_at).toLocaleString()}>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>
                          {relTime(r.created_at)}
                        </span>
                      </td>
                      <td>
                        {dur ? (
                          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{dur}</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  );
}
