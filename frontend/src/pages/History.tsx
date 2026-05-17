import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { api } from '../api/client';
import type { MatchRunResponse } from '../api/types';
import Panel from '../components/ui/Panel';
import Pill from '../components/ui/Pill';
import { displayFilename } from '../utils/filename';
import { MODE_LABEL, MODE_GLYPH } from '../utils/comparisons';
import { relativeTime } from '../utils/time';

// ── Helpers ───────────────────────────────────────────

function duration(started: string | null, finished: string | null): string | null {
  if (!started || !finished) return null;
  const ms = new Date(finished).getTime() - new Date(started).getTime();
  if (ms < 1000) return '<1s';
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m`;
}

// ── Constants ─────────────────────────────────────────

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral' | 'info'> = {
  completed: 'ok',
  running:   'info',
  pending:   'neutral',
  failed:    'danger',
  stale:     'warn',
};

// ── History group ─────────────────────────────────────

function HistoryGroup({ type, runs, navigate }: { type: string; runs: MatchRunResponse[]; navigate: ReturnType<typeof useNavigate> }) {
  const [open, setOpen] = useState(true);

  return (
    <Panel className="fade" style={{ marginBottom: 10 }}>
      <div
        className="panel-head"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setOpen(o => !o)}
      >
        <span className="mono" style={{ fontSize: 11, color: 'var(--accent)' }}>{type}</span>
        <span className="mono dim" style={{ fontSize: 11 }}>{runs.length} run{runs.length !== 1 ? 's' : ''}</span>
        <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--fg-3)', marginLeft: 'auto', transition: 'transform 0.15s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
          expand_more
        </span>
      </div>

      {open && (
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 64 }}>#</th>
              <th>Files</th>
              <th className="num" style={{ width: 72 }}>Batches</th>
              <th className="num" style={{ width: 96 }}>Candidates</th>
              <th style={{ width: 80 }}>Status</th>
              <th style={{ width: 100 }}>Created</th>
              <th style={{ width: 72 }}>Duration</th>
            </tr>
          </thead>
          <tbody>
            {runs.map(r => {
              const stale = r.status === 'stale';
              const dur = duration(r.started_at, r.finished_at);
              return (
                <tr
                  key={r.id}
                  style={{ opacity: stale ? 0.45 : 1, cursor: 'pointer' }}
                  onClick={() => navigate(`/review?match_run_id=${r.id}`)}
                >
                  <td>
                    <Link
                      to={`/review?match_run_id=${r.id}`}
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
                    {r.batches.length > 0 ? (
                      <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                        {r.batches.map((b, i) => (
                          <span key={b.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {i > 0 && <span style={{ color: 'var(--fg-3)', fontSize: 10 }}>×</span>}
                            <span className="mono" style={{ fontSize: 11 }}>{displayFilename(b.filename, 24)}</span>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span className="mono" style={{ fontSize: 12, color: 'var(--accent)', fontFamily: "'Apple Symbols', system-ui" }}>{MODE_GLYPH[r.mode]}</span>
                        <span style={{ fontSize: 12 }}>{MODE_LABEL[r.mode]}</span>
                      </span>
                    )}
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
                      {relativeTime(r.created_at)}
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
  );
}

// ── Page ──────────────────────────────────────────────

export default function History() {
  const navigate = useNavigate();
  const { data: runs, isLoading } = useQuery({
    queryKey: ['comparison-runs'],
    queryFn: () => api.get<MatchRunResponse[]>('/api/matches/'),
  });

  const historyRuns = (runs ?? []).filter(r => r.status !== 'pending' && r.status !== 'running');

  const grouped = historyRuns.reduce<Record<string, MatchRunResponse[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="scroll" style={{ height: '100%' }}>
      <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>

        <div className="fade" style={{ marginBottom: 14 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>History</h1>
          <div style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 2 }}>
            Archive of all comparison runs
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--fg-3)' }}>Loading…</div>
        ) : historyRuns.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 22, marginBottom: 10, color: 'var(--fg-3)', fontFamily: "'Apple Symbols', system-ui" }}>⊕</div>
            <div style={{ fontSize: 13, color: 'var(--fg-2)', marginBottom: 12 }}>No completed runs yet</div>
            <Link to="/match" className="btn btn-sm btn-accent">Start a run ▸</Link>
          </div>
        ) : (
          Object.entries(grouped).map(([type, groupRuns]) => (
            <HistoryGroup key={type} type={type} runs={groupRuns} navigate={navigate} />
          ))
        )}
      </div>
    </div>
  );
}
