import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../api/client';
import type { InsightsDqResponse } from '../api/types';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import Hbar from '../components/ui/Hbar';
import { dqTone } from '../utils/confidence';
import Kpi from '../components/ui/Kpi';
import Spinner from '../components/ui/Spinner';

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function toneToFillClass(tone: 'ok' | 'warn' | 'danger' | 'neutral'): string {
  switch (tone) {
    case 'ok':
      return 'bg-emerald-500';
    case 'warn':
      return 'bg-amber-500';
    case 'danger':
      return 'bg-destructive';
    default:
      return 'bg-primary';
  }
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
  if (error) return <div className="text-destructive">{(error as Error).message}</div>;
  if (!data) return null;

  const maxBucket = Math.max(1, ...data.distribution.map((b) => b.count));

  return (
    <div className="flex flex-col gap-3 p-3 h-full overflow-y-auto">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Average data quality</CardTitle>
        </CardHeader>
        <CardContent>
          <Kpi
            label="Avg DQ Score"
            value={pct(data.avg_dq)}
          />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>DQ distribution</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          {data.distribution.map((b) => (
            <div key={b.bucket} className="flex items-center gap-2">
              <span className="font-mono w-20 text-xs">{b.bucket}</span>
              <Hbar value={(b.count / maxBucket) * 100} fillClassName={toneToFillClass(dqTone(parseBucketMid(b.bucket)))} className="flex-1" />
              <span className="font-mono w-10 text-right text-xs">{b.count}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>DQ by source (worst first)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          {data.per_source.length === 0 && <div className="text-muted-foreground text-xs">No source data yet.</div>}
          {data.per_source.map((s) => (
            <div key={s.source_id} className="flex items-center gap-2">
              <span className="w-40 overflow-hidden text-ellipsis whitespace-nowrap text-xs">{s.source_name}</span>
              <Hbar value={s.avg_dq * 100} fillClassName={toneToFillClass(dqTone(s.avg_dq))} className="flex-1" />
              <span className="font-mono w-24 text-right text-xs">{pct(s.avg_dq)} ({s.count})</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Worst-scoring records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="table w-full text-sm">
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
                <tr><td colSpan={4} className="text-muted-foreground">No records yet.</td></tr>
              )}
              {data.worst.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono">{r.id}</td>
                  <td>{r.record_type}</td>
                  <td className="font-mono">{pct(r.dq_score)}</td>
                  <td><Link to={`/unified/${r.id}`} className="text-accent hover:underline">View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
