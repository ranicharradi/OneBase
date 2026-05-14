import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../api/client';
import type { ComparisonRunResponse } from '../api/types';
import Panel, { PanelHead } from '../components/ui/Panel';
import Pill from '../components/ui/Pill';

const MODE_GLYPH: Record<string, string> = {
  FILE_VS_FILE: '⊏⊐',
  FILE_VS_GOLDEN: '⊞',
  MULTI_FILE: '✦',
};

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  completed: 'ok',
  running: 'neutral',
  pending: 'neutral',
  failed: 'danger',
  stale: 'warn',
};

export default function Comparisons() {
  const { data: runs, isLoading } = useQuery({
    queryKey: ['comparison-runs'],
    queryFn: () => api.get<ComparisonRunResponse[]>('/api/comparisons/'),
  });

  return (
    <div className="scroll" style={{ height: '100%' }}>
      <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Runs</h1>
        <Panel className="fade">
          <PanelHead>
            <span className="panel-title">Comparison history</span>
          </PanelHead>
          {isLoading ? <div style={{ padding: 28, textAlign: 'center' }}>Loading…</div> : (
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Created</th>
                  <th>Mode</th>
                  <th>Type</th>
                  <th>Scope</th>
                  <th className="num">Candidates</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(runs ?? []).map(r => {
                  const stale = r.status === 'stale';
                  return (
                    <tr key={r.id} style={{ opacity: stale ? 0.5 : 1 }}>
                      <td className="mono">
                        <Link to={`/review?comparison_run_id=${r.id}`}>#{r.id}</Link>
                      </td>
                      <td className="mono">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="mono">{MODE_GLYPH[r.mode]} {r.mode}</td>
                      <td>{r.type}</td>
                      <td className="mono">{r.batch_ids.length} batch{r.batch_ids.length === 1 ? '' : 'es'}</td>
                      <td className="num" style={{ textDecoration: stale ? 'line-through' : undefined }}>
                        {(r.stats?.candidate_count ?? 0)}
                      </td>
                      <td><Pill tone={STATUS_TONE[r.status] ?? 'neutral'} dot>{r.status}</Pill></td>
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
