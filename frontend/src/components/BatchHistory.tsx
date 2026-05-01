// ── Batch history table — terminal aesthetic ──

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { BatchResponse } from '../api/types';
import Panel, { PanelHead } from './ui/Panel';
import Pill from './ui/Pill';
import type { PillTone } from './ui/Pill';

interface BatchHistoryProps {
  dataSourceId?: number;
}

const STATUS_TONES: Record<string, PillTone> = {
  completed: 'ok',
  complete: 'ok',
  failed: 'danger',
  failure: 'danger',
  processing: 'accent',
  pending: 'warn',
  superseded: 'neutral',
};

const DELETABLE_STATUSES = new Set(['pending', 'failed', 'failure']);

function displayFilename(stored: string): string {
  const match = stored.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_(.+)$/);
  return match ? match[1] : stored;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function BatchHistory({ dataSourceId }: BatchHistoryProps) {
  const queryClient = useQueryClient();

  const { data: batches, isLoading, error } = useQuery({
    queryKey: ['batches', dataSourceId ?? 'all'],
    queryFn: () =>
      api.get<BatchResponse[]>(
        dataSourceId
          ? `/api/import/batches?data_source_id=${dataSourceId}`
          : '/api/import/batches',
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: (batchId: number) => api.delete(`/api/import/batches/${batchId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['batches'] }),
  });

  if (isLoading) {
    return (
      <Panel>
        <PanelHead title="Recent batches" />
        <div style={{ padding: 20, fontSize: 12, color: 'var(--fg-2)', textAlign: 'center' }}>
          Loading…
        </div>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel>
        <PanelHead title="Recent batches" />
        <div style={{ padding: 20, fontSize: 12, color: 'var(--danger)', textAlign: 'center' }}>
          Failed to load batch history
        </div>
      </Panel>
    );
  }

  const sorted = batches
    ? [...batches].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    : [];

  if (sorted.length === 0) {
    return (
      <Panel>
        <PanelHead title="Recent batches" />
        <div style={{ padding: 28, textAlign: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--fg-3)' }}>
            history
          </span>
          <div style={{ fontSize: 13, marginTop: 8 }}>No uploads yet</div>
          <div style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 4 }}>
            Upload a CSV file to see batch history here.
          </div>
        </div>
      </Panel>
    );
  }

  const completed = sorted.filter(b => ['completed', 'complete'].includes(b.status.toLowerCase())).length;
  const failed = sorted.filter(b => ['failed', 'failure'].includes(b.status.toLowerCase())).length;

  return (
    <Panel>
      <PanelHead>
        <span className="panel-title">Recent batches</span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>
          {sorted.length} total · {completed} ok · {failed} failed
        </span>
      </PanelHead>
      <table className="table">
        <thead>
          <tr>
            <th>File</th>
            <th>Uploaded by</th>
            <th className="num">Rows</th>
            <th>Status</th>
            <th>Date</th>
            <th style={{ width: 30 }} />
          </tr>
        </thead>
        <tbody>
          {sorted.map(batch => {
            const statusKey = batch.status.toLowerCase();
            const tone = STATUS_TONES[statusKey] ?? 'neutral';
            const canDelete = DELETABLE_STATUSES.has(statusKey);
            return (
              <tr key={batch.id}>
                <td className="mono" style={{ fontSize: 11 }}>
                  {displayFilename(batch.filename)}
                </td>
                <td className="mono" style={{ fontSize: 11, color: 'var(--fg-1)' }}>
                  {batch.uploaded_by}
                </td>
                <td className="num mono">{batch.row_count?.toLocaleString() ?? '—'}</td>
                <td>
                  <Pill tone={tone} dot>{batch.status}</Pill>
                </td>
                <td className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>
                  {formatDate(batch.created_at)}
                </td>
                <td>
                  {canDelete && (
                    <button
                      onClick={() => deleteMutation.mutate(batch.id)}
                      disabled={deleteMutation.isPending}
                      className="btn btn-ghost btn-sm"
                      style={{ padding: 4, color: 'var(--danger)' }}
                      title="Dismiss batch"
                      aria-label={`Dismiss batch ${displayFilename(batch.filename)}`}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>close</span>
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}
