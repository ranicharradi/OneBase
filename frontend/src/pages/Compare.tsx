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
import SourcePill from '../components/ui/SourcePill';
import UnifiedBadge from '../components/UnifiedBadge';
import ShapePreview from '../components/ShapePreview';

const MODE_OPTIONS: { value: ComparisonMode; label: string }[] = [
  { value: 'FILE_VS_FILE', label: 'FILE × FILE' },
  { value: 'FILE_VS_GOLDEN', label: 'FILE × GOLDEN' },
  { value: 'MULTI_FILE', label: 'N-WAY' },
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

  const { data: goldenCount } = useQuery({
    queryKey: ['unified-count', type],
    queryFn: () => api.get<{ count: number }>(`/api/unified/count?type=${type}`),
    enabled: !!type && mode === 'FILE_VS_GOLDEN',
  });

  // Default type to first available.
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

  const candidateEstimate = useMemo(() => {
    if (!isValid) return null;
    if (mode === 'FILE_VS_FILE' || mode === 'FILE_VS_GOLDEN') {
      const a = selectedBatches[0]?.row_count ?? 0;
      const b = mode === 'FILE_VS_GOLDEN' ? goldenCount?.count ?? 0 : (selectedBatches[1]?.row_count ?? 0);
      return Math.min(a, b) * 20;
    }
    const sizes = selectedBatches.map(b => b.row_count ?? 0).sort((x, y) => x - y);
    if (sizes.length < 2) return null;
    return sizes[0] * 20;
  }, [isValid, mode, selectedBatches, goldenCount]);

  const launch = useMutation({
    mutationFn: async () => {
      const payload: ComparisonRunCreate = {
        type,
        mode,
        batch_ids: effectiveSelection,
      };
      return api.post<ComparisonRunResponse>('/api/comparisons/', payload);
    },
    onSuccess: (run) => {
      navigate(`/review?comparison_run_id=${run.id}`);
    },
  });

  const toggleRow = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="scroll" style={{ height: '100%' }}>
      <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
        {/* Top strip */}
        <div className="fade" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Compare <span style={{ color: 'var(--fg-2)' }}>▸ build a run</span></h1>
          <select
            className="input"
            style={{ height: 28, fontSize: 12 }}
            value={type}
            onChange={(e) => { setType(e.target.value); setSelected(new Set()); }}
          >
            {recordTypes?.types.map(rt => <option key={rt.key} value={rt.key}>{rt.label}</option>)}
          </select>
        </div>

        {/* Shape preview */}
        <ShapePreview
          mode={mode}
          fileLabels={selectedBatches.map(b => b.filename)}
          goldenCount={goldenCount?.count}
          candidateEstimate={candidateEstimate}
          recordType={type}
        />

        {/* Mode strip */}
        <div style={{ marginTop: 14, marginBottom: 14 }}>
          <Seg<ComparisonMode>
            value={mode}
            onChange={setMode}
            options={MODE_OPTIONS}
          />
        </div>

        {/* Batches table */}
        <Panel>
          <PanelHead>
            <span className="panel-title">Batches of type {type || '—'}</span>
          </PanelHead>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36 }} />
                <th>Filename</th>
                <th>Source</th>
                <th className="num">Rows</th>
                <th>Status</th>
                <th>Unified</th>
              </tr>
            </thead>
            <tbody>
              {(batches ?? []).map(b => {
                const isSelected = selected.has(b.id);
                const overCap = bounds.max != null && effectiveSelection.indexOf(b.id) < 0 && isSelected === false && selected.size >= bounds.max;
                return (
                  <tr
                    key={b.id}
                    onClick={() => toggleRow(b.id)}
                    style={{
                      cursor: 'pointer',
                      opacity: overCap ? 0.4 : 1,
                      textDecoration: overCap ? 'line-through' : undefined,
                    }}
                  >
                    <td><input type="checkbox" checked={isSelected} readOnly /></td>
                    <td className="mono">{b.filename}</td>
                    <td><SourcePill short={b.data_source_id.toString().slice(0, 3).toUpperCase()} title={b.filename} /></td>
                    <td className="num">{(b.row_count ?? 0).toLocaleString()}</td>
                    <td>{b.status}</td>
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
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div className="mono" style={{ fontSize: 12 }}>
            <span style={{
              display: 'inline-block',
              width: 2,
              height: 12,
              background: isValid ? 'var(--accent)' : 'var(--danger)',
              marginRight: 8,
              verticalAlign: 'middle',
            }} />
            {effectiveSelection.length} {bounds.max ? `of ${bounds.max}` : ''} selected · type={type} · mode={mode}
          </div>
          <button
            className="btn btn-sm btn-accent"
            disabled={!isValid || launch.isPending}
            onClick={() => launch.mutate()}
          >
            {launch.isPending ? <Spinner size={10} color="#fff" /> : null}
            Compare ▸
          </button>
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
