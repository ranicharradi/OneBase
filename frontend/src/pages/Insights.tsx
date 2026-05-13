import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../api/client';
import type { InsightsDqResponse } from '../api/types';
import Hbar from '../components/ui/Hbar';
import Kpi from '../components/ui/Kpi';
import Panel, { PanelHead } from '../components/ui/Panel';
import Spinner from '../components/ui/Spinner';

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function tone(score: number): 'ok' | 'warn' | 'danger' {
  if (score >= 0.8) return 'ok';
  if (score >= 0.5) return 'warn';
  return 'danger';
}

function parseBucketMid(label: string): number {
  if (label.startsWith('<')) return 0.1;
  if (label.startsWith('>=')) return 0.9;
  const [lo] = label.split('-').map(Number);
  return lo + 0.1;
}

export default function Insights() {
  const { data, isLoading, error } = useQuery<InsightsDqResponse>({
    queryKey: ['insights', 'dq'],
    queryFn: () => api.get<InsightsDqResponse>('/api/insights/dq'),
  });

  if (isLoading) return <Spinner />;
  if (error) return <div style={{ color: 'var(--danger)' }}>{(error as Error).message}</div>;
  if (!data) return null;

  const maxBucket = Math.max(1, ...data.distribution.map((b) => b.count));

  return (
    <div className="scroll" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, height: '100%', boxSizing: 'border-box' }}>
      <Panel>
        <PanelHead title="Average data quality" />
        <div style={{ padding: 12 }}>
          <Kpi
            label="Avg DQ Score"
            value={pct(data.avg_dq)}
            bar={Math.round(data.avg_dq * 100)}
            tone={tone(data.avg_dq)}
          />
        </div>
      </Panel>

      <Panel>
        <PanelHead title="DQ distribution" />
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.distribution.map((b) => (
            <div key={b.bucket} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="mono" style={{ width: 80, fontSize: 12 }}>{b.bucket}</span>
              <Hbar value={(b.count / maxBucket) * 100} tone={tone(parseBucketMid(b.bucket))} style={{ flex: 1 }} />
              <span className="mono" style={{ width: 40, textAlign: 'right', fontSize: 12 }}>{b.count}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <PanelHead title="DQ by source (worst first)" />
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.per_source.length === 0 && <div style={{ color: 'var(--fg-2)', fontSize: 12 }}>No source data yet.</div>}
          {data.per_source.map((s) => (
            <div key={s.source_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{s.source_name}</span>
              <Hbar value={s.avg_dq * 100} tone={tone(s.avg_dq)} style={{ flex: 1 }} />
              <span className="mono" style={{ width: 96, textAlign: 'right', fontSize: 12 }}>{pct(s.avg_dq)} ({s.count})</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <PanelHead title="Worst-scoring records" />
        <div style={{ padding: '0 12px 12px' }}>
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>DQ score</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.worst.length === 0 && (
                <tr><td colSpan={4} style={{ color: 'var(--fg-2)' }}>No records yet.</td></tr>
              )}
              {data.worst.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.id}</td>
                  <td>{r.record_type}</td>
                  <td className="mono">{pct(r.dq_score)}</td>
                  <td><Link to={`/unified/${r.id}`} style={{ color: 'var(--accent)' }}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
