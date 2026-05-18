// ── Unified Record Detail — terminal aesthetic ──

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftIcon, XCircleIcon, HistoryIcon } from 'lucide-react';
import { api } from '../api/client';
import type { UnifiedRecordDetail as DetailType, LineageResponse } from '../api/types';
import RecordFieldRow from '../components/RecordFieldRow';
import { useRecordType } from '../hooks/useRecordTypes';
import { useSelectedRecordType } from '../contexts/RecordTypeContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import Kpi from '../components/ui/Kpi';
import IdChip from '../components/ui/IdChip';
import SourcePill from '../components/ui/SourcePill';
import { Spinner } from '../components/ui';


const ACTION_TONES: Record<string, 'ok' | 'danger' | 'neutral' | 'accent' | 'warn'> = {
  merge_confirmed: 'ok',
  match_rejected: 'danger',
  singleton_promoted: 'accent',
};

const ACTION_LABELS: Record<string, string> = {
  merge_confirmed: 'merge.confirm',
  match_rejected: 'match.reject',
  singleton_promoted: 'singleton.promote',
};



export default function UnifiedRecordDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { withRecordType } = useSelectedRecordType();

  const [tab, setTab] = useState<'details' | 'lineage'>('details');

  const { data: record, isLoading, error } = useQuery<DetailType>({
    queryKey: ['unified-detail', id],
    queryFn: () => api.get(`/api/unified/records/${id}`),
    enabled: !!id,
  });
  const { data: recordType } = useRecordType(record?.type);

  const lineage = useQuery<LineageResponse>({
    queryKey: ['lineage', id],
    queryFn: () => api.get<LineageResponse>(`/api/unified/${id}/lineage`),
    enabled: tab === 'lineage' && !!id,
  });

  if (isLoading) {
    return (
      <div className="scroll" style={{ height: '100%' }}>
        <div className="text-muted-foreground" style={{ padding: 20, fontSize: 12 }}>Loading record…</div>
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="scroll" style={{ height: '100%' }}>
        <div style={{ padding: 20 }}>
          <Card>
            <CardContent className="flex flex-col items-center justify-center" style={{ padding: 28 }}>
              <XCircleIcon className="size-7 text-destructive" />
              <div className="text-muted-foreground mt-2" style={{ fontSize: 12 }}>
                {error instanceof Error ? error.message : 'Unified record not found'}
              </div>
              <Button onClick={() => navigate(withRecordType('/unified'))} variant="outline" size="sm" className="mt-3">
                <ArrowLeftIcon className="size-4 mr-2" />
                Back to unified
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const matchCandidateId = typeof record.match_candidate_id === 'number' ? record.match_candidate_id : null;
  const isSingleton = matchCandidateId === null;

  return (
    <div className="scroll" style={{ height: '100%' }}>
      <div style={{ padding: 20 }}>
        <Button
          onClick={() => navigate(withRecordType('/unified'))}
          variant="ghost"
          size="sm"
          className="mb-2"
        >
          <ArrowLeftIcon className="size-4 mr-2" />
          Unified records
        </Button>

        <div className="animate-in fade-in-0 mb-3.5">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <IdChip className="text-sm px-2 py-0.5">№ {record.id}</IdChip>
            <h1
              className="font-serif"
              style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}
            >
              {record.name}
            </h1>
            <Badge variant="secondary" className={isSingleton ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : ''}>
              {isSingleton ? 'singleton' : 'merged'}
            </Badge>
            <Badge variant="outline">{record.type}</Badge>
            {matchCandidateId !== null && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(withRecordType(`/review/${matchCandidateId}`))}
              >
                <HistoryIcon className="size-4 mr-2" />
                Re-open review
              </Button>
            )}
          </div>
          <div
            className="text-muted-foreground"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginTop: 6,
              fontSize: 12,
              flexWrap: 'wrap',
            }}
          >
            <span>{record.source_record_ids.length} source records</span>
            <span>
              created by <b className="text-foreground">{record.created_by}</b>
              {record.created_at && ` · ${new Date(record.created_at).toLocaleString()}`}
            </span>
          </div>
        </div>

        {record.dq_score !== undefined && record.dq_score !== null && (
          <Card className="animate-in fade-in-0 mb-3.5">
            <CardHeader>
              <CardTitle>Data Quality</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-3">
              <Kpi label="Score" value={`${Math.round((record.dq_score ?? 0) * 100)}%`} />
              <Kpi label="Completeness" value={`${Math.round((record.dq_completeness ?? 0) * 100)}%`} />
              <Kpi label="Validity" value={`${Math.round((record.dq_validity ?? 0) * 100)}%`} />
            </CardContent>
          </Card>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'details' | 'lineage')} className="mb-3.5">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="lineage">Lineage</TabsTrigger>
          </TabsList>

          <TabsContent value="details">
            <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 14 }}>
              {/* Field provenance */}
              <Card className="animate-in fade-in-0">
                <CardHeader>
                  <CardTitle>Field provenance</CardTitle>
                </CardHeader>
                <CardContent>
                  {recordType?.fields.map(field => (
                    <RecordFieldRow
                      key={field.key}
                      field={field}
                      fields={record.fields}
                      provenance={record.provenance[field.key]}
                    />
                  ))}
                </CardContent>
              </Card>

              {/* Sides: contributing records + merge history */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
                <Card className="animate-in fade-in-0">
                  <CardHeader>
                    <CardTitle>Contributing records</CardTitle>
                  </CardHeader>
                  <div className="px-3.5">
                    {record.source_records.length === 0 ? (
                      <div className="text-muted-foreground" style={{ padding: 16, fontSize: 12, textAlign: 'center' }}>
                        No source records linked
                      </div>
                    ) : (
                      record.source_records.map((sr, i) => (
                        <div
                          key={sr.id}
                          style={{
                            padding: '10px 0',
                            borderBottom:
                              i < record.source_records.length - 1 ? '1px solid var(--border)' : 'none',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {sr.data_source_name && <SourcePill short={sr.data_source_name} />}
                            <span style={{ fontSize: 12, fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {sr.name || 'Unnamed'}
                            </span>
                            <span style={{ flex: 1 }} />
                            <span className="font-mono text-muted-foreground" style={{ fontSize: 10 }}>rec #{sr.id}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>

                <Card className="animate-in fade-in-0">
                  <CardHeader>
                    <CardTitle>Audit trail</CardTitle>
                  </CardHeader>
                  <div className="px-3.5 py-2.5">
                    {record.merge_history.length === 0 ? (
                      <div className="text-muted-foreground" style={{ padding: 8, fontSize: 12, textAlign: 'center' }}>
                        No audit entries
                      </div>
                    ) : (
                      record.merge_history.map((entry, i) => {
                        const tone = ACTION_TONES[entry.action] ?? 'neutral';
                        const label = ACTION_LABELS[entry.action] ?? entry.action;
                        const toneClassName = {
                          'ok': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
                          'danger': 'bg-destructive/10 text-destructive',
                          'warn': 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
                          'accent': 'bg-primary/10 text-primary',
                          'neutral': 'bg-muted text-muted-foreground',
                        }[tone] || 'bg-muted text-muted-foreground';
                        return (
                          <div
                            key={entry.id}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '90px 1fr',
                              gap: 10,
                              padding: '8px 0',
                              alignItems: 'baseline',
                              borderBottom:
                                i < record.merge_history.length - 1 ? '1px solid var(--border)' : 'none',
                              fontSize: 11,
                            }}
                          >
                            <span className="font-mono text-muted-foreground">
                              {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : '—'}
                            </span>
                            <div style={{ minWidth: 0 }}>
                              <span
                                className={`font-mono text-xs px-1.5 py-0.5 rounded ${toneClassName}`}
                                style={{ marginRight: 6 }}
                              >
                                {label}
                              </span>
                              {entry.details?.reviewed_by != null && (
                                <span className="font-mono text-primary">
                                  {String(entry.details.reviewed_by)}
                                </span>
                              )}
                              {entry.details?.conflict_count !== undefined && (
                                <span className="text-foreground/80" style={{ marginLeft: 6 }}>
                                  · {String(entry.details.conflict_count)} conflict
                                  {entry.details.conflict_count === 1 ? '' : 's'} resolved
                                </span>
                              )}
                              {entry.details?.source != null && (
                                <span className="text-foreground/80" style={{ marginLeft: 6 }}>
                                  · source {String(entry.details.source)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="lineage">
            <Card>
              <CardHeader>
                <CardTitle>Lineage</CardTitle>
              </CardHeader>
              <CardContent>
                {lineage.isLoading && <Spinner />}
                {lineage.error && (
                  <div className="text-destructive" style={{ padding: 12 }}>
                    {(lineage.error as Error).message}
                  </div>
                )}
                {lineage.data && (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {lineage.data.events.length === 0 ? (
                      <li className="text-muted-foreground" style={{ fontSize: 12, textAlign: 'center', padding: 8 }}>
                        No lineage events found
                      </li>
                    ) : (
                      lineage.data.events.map((e, i) => (
                        <li key={i} style={{ borderLeft: '2px solid var(--border)', paddingLeft: 8 }}>
                          <div className="text-muted-foreground" style={{ fontSize: 11 }}>
                            {e.at} · <strong>{e.kind}</strong>{e.actor ? ` · ${e.actor}` : ''}
                          </div>
                          <div>{e.summary}</div>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
