// ── Batch history table — terminal aesthetic ──

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { XIcon } from 'lucide-react';
import { api } from '../api/client';
import type { BatchResponse } from '../api/types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { Button } from './ui/button';
import { datasourceFileLabel } from '../utils/filename';

interface BatchHistoryProps {
  dataSourceId?: number;
  type?: string;
}

const STATUS_BADGE_VARIANTS: Record<string, { variant: 'secondary' | 'destructive' | 'outline'; className?: string }> = {
  completed: {
    variant: 'secondary',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  },
  complete: {
    variant: 'secondary',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  },
  failed: { variant: 'destructive' },
  failure: { variant: 'destructive' },
  processing: { variant: 'secondary' },
  pending: {
    variant: 'secondary',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  },
  superseded: { variant: 'outline' },
};

const DELETABLE_STATUSES = new Set(['pending', 'failed', 'failure']);

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function BatchHistory({ dataSourceId, type }: BatchHistoryProps) {
  const queryClient = useQueryClient();

  const { data: batches, isLoading, error } = useQuery({
    queryKey: ['batches', dataSourceId ?? 'all', type],
    queryFn: () => {
      const params = new URLSearchParams();
      if (dataSourceId) params.set('data_source_id', String(dataSourceId));
      else if (type) params.set('type', type);
      const qs = params.toString();
      return api.get<BatchResponse[]>(qs ? `/api/import/batches?${qs}` : '/api/import/batches');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (batchId: number) => api.delete(`/api/import/batches/${batchId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['batches'] }),
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent files</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <div className="py-5 text-xs text-muted-foreground">
            Loading…
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent files</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <div className="py-5 text-xs text-destructive">
            Failed to load file history
          </div>
        </CardContent>
      </Card>
    );
  }

  const sorted = batches
    ? [...batches].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    : [];

  if (sorted.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent files</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <div className="py-7">
            <span className="material-symbols-outlined text-2xl text-muted-foreground/50">
              history
            </span>
            <div className="text-sm mt-2">No uploads yet</div>
            <div className="text-xs text-muted-foreground mt-1">
              Upload a CSV file to see file history here.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const completed = sorted.filter(b => ['completed', 'complete'].includes(b.status.toLowerCase())).length;
  const failed = sorted.filter(b => ['failed', 'failure'].includes(b.status.toLowerCase())).length;

  const ROW_HEIGHT = 40;
  const VISIBLE_ROWS = 3;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle>Recent files</CardTitle>
          <span className="font-mono text-xs text-muted-foreground">
            {sorted.length} total · {completed} ok · {failed} failed
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="w-full" style={{ maxHeight: VISIBLE_ROWS * ROW_HEIGHT + 33 }}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Uploaded by</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map(batch => {
                const statusKey = batch.status.toLowerCase();
                const badgeConfig = STATUS_BADGE_VARIANTS[statusKey] ?? { variant: 'outline' as const };
                const canDelete = DELETABLE_STATUSES.has(statusKey);
                return (
                  <TableRow key={batch.id} style={{ height: ROW_HEIGHT }}>
                    <TableCell className="font-mono text-xs">
                      {datasourceFileLabel({ data_source_name: batch.data_source_name, file_extension: batch.file_extension })}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-foreground/80">
                      {batch.uploaded_by}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right">
                      {batch.row_count?.toLocaleString() ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={badgeConfig.variant} className={badgeConfig.className}>
                        <span className="inline-block size-2 rounded-full bg-current mr-1.5" />
                        {batch.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatDate(batch.created_at)}
                    </TableCell>
                    <TableCell>
                      {canDelete && (
                        <Button
                          onClick={() => deleteMutation.mutate(batch.id)}
                          disabled={deleteMutation.isPending}
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                          title="Dismiss file"
                          aria-label={`Dismiss file ${datasourceFileLabel({ data_source_name: batch.data_source_name, file_extension: batch.file_extension })}`}
                        >
                          <XIcon className="size-3" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
