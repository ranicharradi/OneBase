import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type {
  BatchResponse,
  ComparisonMode,
  ComparisonRunCreate,
  ComparisonRunResponse,
} from '../api/types';
import { useRecordTypes } from '../hooks/useRecordTypes';
import Panel, { PanelHead } from '../components/ui/Panel';
import Seg from '../components/ui/Seg';
import Spinner from '../components/ui/Spinner';
import Pill from '../components/ui/Pill';
import type { PillTone } from '../components/ui/Pill';
import UnifiedBadge from '../components/UnifiedBadge';

function trunc(s: string, n = 20): string {
  if (s.length <= n) return s;
  const h = Math.floor((n - 1) / 2);
  const t = Math.ceil((n - 1) / 2);
  return `${s.slice(0, h)}…${s.slice(s.length - t)}`;
}

function relTime(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const BATCH_TONE: Record<string, PillTone> = {
  done: 'ok',
  completed: 'ok',
  pending: 'neutral',
  running: 'info',
  failed: 'danger',
  error: 'danger',
  superseded: 'warn',
};

function FileCell({ name }: { name: string }) {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  return (
    <span title={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 260, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      <svg width="13" height="15" viewBox="0 0 13 15" fill="none" style={{ flexShrink: 0, opacity: 0.45 }}>
        <path d="M1 1h7.5L12 4.5V14H1V1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none"/>
        <path d="M8.5 1v4H12" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      </svg>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{stem}</span>
      {ext && <span style={{ color: 'var(--fg-3)', flexShrink: 0 }}>{ext}</span>}
    </span>
  );
}

const MODE_OPTIONS: { value: ComparisonMode; label: string; desc: string }[] = [
  { value: 'FILE_VS_FILE', label: 'FILE × FILE', desc: 'compare two batches' },
  { value: 'FILE_VS_GOLDEN', label: 'FILE × GOLDEN', desc: 'match against unified' },
  { value: 'MULTI_FILE', label: 'N-WAY', desc: 'cross-compare many' },
];

const MODE_BOUNDS: Record<ComparisonMode, { min: number; max: number | null }> = {
  FILE_VS_FILE: { min: 2, max: 2 },
  FILE_VS_GOLDEN: { min: 1, max: 1 },
  MULTI_FILE: { min: 2, max: null },
};

export default function Compare() {
  const navigate = useNavigate();
  const { data: recordTypes } = useRecordTypes();
  const [type, setType] = useState<string>('');
  const [mode, setMode] = useState<ComparisonMode>('FILE_VS_FILE');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { data: batches } = useQuery({
    queryKey: ['batches', type],
    queryFn: () => api.get<BatchResponse[]>(`/api/import/batches${type ? `?type=${type}` : ''}`),
    enabled: !!type,
  });

  if (!type && recordTypes?.types[0]) {
    setType(recordTypes.types[0].key);
  }

  const selectedIds = useMemo(() => [...selected], [selected]);
  const bounds = MODE_BOUNDS[mode];

  const effectiveSelection = useMemo(() => {
    if (bounds.max == null) return selectedIds;
    return selectedIds.slice(0, bounds.max);
  }, [selectedIds, bounds.max]);

  const isValid = effectiveSelection.length >= bounds.min;

  const selectedBatches = useMemo(
    () => (batches ?? []).filter(b => effectiveSelection.includes(b.id)),
    [batches, effectiveSelection],
  );

  const launch = useMutation({
    mutationFn: async () => {
      const payload: ComparisonRunCreate = { type, mode, batch_ids: effectiveSelection };
      return api.post<ComparisonRunResponse>('/api/comparisons/', payload);
    },
    onSuccess: (run) => navigate(`/runs?type=${run.type}`),
  });

  const toggleRow = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const needMore = bounds.min - effectiveSelection.length;

  return (
    <div className="scroll" style={{ height: '100%' }}>
      <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>

        {/* Header */}
        <div className="fade" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Compare</h1>
            <span style={{ color: 'var(--fg-3)', fontSize: 13 }}>▸ build a run</span>
          </div>
          <select
            className="input"
            style={{ height: 28, fontSize: 12 }}
            value={type}
            onChange={(e) => { setType(e.target.value); setSelected(new Set()); }}
          >
            {recordTypes?.types.map(rt => <option key={rt.key} value={rt.key}>{rt.label}</option>)}
          </select>
        </div>

        {/* Mode strip */}
        <div style={{ marginTop: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Seg<ComparisonMode>
            value={mode}
            onChange={(m) => { setMode(m); setSelected(new Set()); }}
            options={MODE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
          />
          <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>
            {MODE_OPTIONS.find(o => o.value === mode)?.desc}
          </span>
        </div>

        {/* Batches table */}
        <Panel>
          <PanelHead>
            <span className="panel-title">Batches · {type || '—'}</span>
            {effectiveSelection.length > 0 && (
              <span className="pill accent" style={{ fontSize: 10 }}>
                {effectiveSelection.length}{bounds.max ? ` / ${bounds.max}` : ''} selected
              </span>
            )}
          </PanelHead>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36 }} />
                <th>Filename</th>
                <th>Uploaded</th>
                <th className="num">Rows</th>
                <th>Status</th>
                <th>Unified</th>
              </tr>
            </thead>
            <tbody>
              {(batches ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '28px 0', color: 'var(--fg-3)' }}>
                    No batches of type <span className="mono">{type}</span> yet
                  </td>
                </tr>
              )}
              {(batches ?? []).map(b => {
                const inEffective = effectiveSelection.includes(b.id);
                const isChecked = selected.has(b.id);
                const overCap = bounds.max != null && !inEffective && isChecked;
                const dimmed = bounds.max != null && !inEffective && !isChecked && selected.size >= bounds.max;
                return (
                  <tr
                    key={b.id}
                    onClick={() => toggleRow(b.id)}
                    className={inEffective ? 'selected' : ''}
                    style={{ cursor: 'pointer', opacity: (overCap || dimmed) ? 0.35 : 1 }}
                  >
                    <td><input type="checkbox" checked={isChecked} readOnly /></td>
                    <td><FileCell name={b.filename} /></td>
                    <td>
                      <span title={`${new Date(b.created_at).toLocaleString()} by ${b.uploaded_by}`}
                        className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>
                        {relTime(b.created_at)}
                      </span>
                    </td>
                    <td className="num">{(b.row_count ?? 0).toLocaleString()}</td>
                    <td>
                      <Pill tone={BATCH_TONE[b.status] ?? 'neutral'} dot>
                        {b.status}
                      </Pill>
                    </td>
                    <td><UnifiedBadge unified={b.unified} lastComparedAt={b.last_compared_at} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        {/* Sticky footer */}
        <div style={{
          position: 'sticky',
          bottom: 0,
          marginTop: 16,
          background: 'var(--bg-0)',
          borderTop: '1px solid var(--border-0)',
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          {/* Selected batch chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
            {effectiveSelection.length === 0 ? (
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>
                select {bounds.min}+ batch{bounds.min !== 1 ? 'es' : ''} to compare
              </span>
            ) : (
              selectedBatches.map(b => (
                <span key={b.id} className="pill accent" style={{ fontSize: 10, gap: 4, flexShrink: 0 }}>
                  <span className="mono" style={{ opacity: 0.6, fontSize: 9 }}>▤</span>
                  {trunc(b.filename, 20)}
                </span>
              ))
            )}
          </div>

          {/* Action */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {!isValid && effectiveSelection.length > 0 && (
              <span className="pill warn" style={{ fontSize: 10 }}>
                need {needMore} more
              </span>
            )}
            <button
              className="btn btn-sm btn-accent"
              disabled={!isValid || launch.isPending}
              onClick={() => launch.mutate()}
            >
              {launch.isPending ? <Spinner size={10} color="#fff" /> : null}
              Compare ▸
            </button>
          </div>
        </div>

        {launch.isError && (
          <div className="pill danger" style={{ marginTop: 12 }}>
            {(launch.error as Error).message}
          </div>
        )}
      </div>
    </div>
  );
}
