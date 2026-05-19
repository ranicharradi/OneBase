import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { ChevronDownIcon, DotIcon } from 'lucide-react';
import { api } from '../api/client';
import type { MatchRunResponse } from '../api/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

  const statusBadgeVariant = (status: string): 'secondary' | 'destructive' | 'outline' | 'default' => {
    const tone = STATUS_TONE[status] ?? 'neutral';
    switch (tone) {
      case 'ok':
        return 'secondary';
      case 'warn':
        return 'secondary';
      case 'danger':
        return 'destructive';
      case 'info':
        return 'secondary';
      case 'neutral':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const statusBadgeClassName = (status: string): string => {
    const tone = STATUS_TONE[status] ?? 'neutral';
    switch (tone) {
      case 'ok':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300';
      case 'warn':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300';
      case 'danger':
        return '';
      case 'info':
        return 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300';
      case 'neutral':
        return '';
      default:
        return '';
    }
  };

  return (
    <Card className="mb-2.5">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-primary">{type}</span>
          <span className="font-mono text-xs text-muted-foreground/70">{runs.length} run{runs.length !== 1 ? 's' : ''}</span>
          <ChevronDownIcon
            className="size-3.5 text-muted-foreground ml-auto transition-transform"
            style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          />
        </div>
      </CardHeader>

      {open && (
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={{ width: 64 }}>#</TableHead>
                <TableHead className="text-right" style={{ width: 96 }}>Candidates</TableHead>
                <TableHead style={{ width: 80 }}>Status</TableHead>
                <TableHead style={{ width: 100 }}>Created</TableHead>
                <TableHead style={{ width: 72 }}>Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map(r => {
                const stale = r.status === 'stale';
                const dur = duration(r.started_at, r.finished_at);
                return (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    style={{ opacity: stale ? 0.45 : 1 }}
                    onClick={() => navigate(`/review?match_run_id=${r.id}`)}
                  >
                    <TableCell>
                      <Link
                        to={`/review?match_run_id=${r.id}`}
                        className="font-mono text-xs text-primary"
                        onClick={e => e.stopPropagation()}
                      >
                        #{r.id}
                      </Link>
                      <span className="ml-1.5 text-xs text-muted-foreground">{r.name}</span>
                    </TableCell>
                    <TableCell className="text-right" style={{ textDecoration: stale ? 'line-through' : undefined }}>
                      <span className="font-mono tabular-nums text-xs">
                        {(r.stats?.candidate_count ?? 0).toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(r.status)} className={statusBadgeClassName(r.status)}>
                        <DotIcon className="size-2 fill-current mr-1.5" />
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell title={new Date(r.created_at).toLocaleString()}>
                      <span className="font-mono text-xs text-muted-foreground">
                        {relativeTime(r.created_at)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {dur ? (
                        <span className="font-mono text-xs text-muted-foreground/50">{dur}</span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      )}
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────

export default function History() {
  const navigate = useNavigate();
  const { data: runs, isLoading } = useQuery({
    queryKey: ['match-runs'],
    queryFn: () => api.get<MatchRunResponse[]>('/api/matches'),
  });

  const historyRuns = (runs ?? []).filter(r => r.status !== 'pending' && r.status !== 'running');

  const grouped = historyRuns.reduce<Record<string, MatchRunResponse[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="overflow-auto h-full">
      <div className="p-5 max-w-4xl mx-auto">

        <div className="mb-3.5">
          <h1 className="text-lg font-semibold m-0">History</h1>
          <div className="text-xs text-muted-foreground mt-0.5">
            Archive of all match runs
          </div>
        </div>

        {isLoading ? (
          <div className="p-7 text-center text-muted-foreground/50">Loading…</div>
        ) : historyRuns.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-2xl mb-2.5 text-muted-foreground/50 font-system">⊕</div>
            <div className="text-sm text-muted-foreground mb-3">No completed runs yet</div>
            <Button asChild>
              <Link to="/match">Start a run ▸</Link>
            </Button>
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
