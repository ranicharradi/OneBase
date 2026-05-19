// ── Sources management — terminal aesthetic, create/list/delete ──

import React, { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCwIcon, PlusIcon, FilterIcon, Trash2Icon, DatabaseIcon, SearchXIcon, AlertTriangleIcon } from 'lucide-react';
import { api } from '../api/client';
import type {
  BatchResponse,
  ColumnMapping,
  DataSource,
  FieldDef,
  RecordTypeListResponse,
} from '../api/types';
import { ToastContainer, type ToastData } from '../components/Toast';
import { useRecordType, useRecordTypes } from '../hooks/useRecordTypes';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader as DialogHead,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import Spinner from '../components/ui/Spinner';
import { LoadingErrorEmpty } from '../components/ui/LoadingErrorEmpty';
import SourcePill from '../components/ui/SourcePill';
import { relativeTime } from '../utils/time';


// "Stale" if the most recent successful batch is older than 7 days.
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

function sourceStatus(lastSync: string): 'healthy' | 'stale' {
  return Date.now() - new Date(lastSync).getTime() > STALE_AFTER_MS ? 'stale' : 'healthy';
}

interface SourceStats {
  rows: number;
  batches: number;
  lastSync: string | null;
  status: 'healthy' | 'stale' | 'new';
}


function shortFor(name: string): string {
  // First 3 chars of the longest non-stop word, e.g. "SAP S/4HANA — EMEA" -> "SAP"
  const cleaned = name.replace(/[^A-Za-z0-9 ]/g, ' ');
  const word = cleaned.split(/\s+/).filter(Boolean).sort((a, b) => b.length - a.length)[0] ?? name;
  return word.slice(0, 3).toUpperCase();
}

function emptyMapping(fields: FieldDef[]): ColumnMapping {
  return Object.fromEntries(fields.filter(field => field.required).map(field => [field.key, '']));
}

function toColumnMapping(mapping: DataSource['column_mapping'] | ColumnMapping | null | undefined): ColumnMapping {
  return Object.fromEntries(
    Object.entries(mapping ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function filterMappingForFields(mapping: ColumnMapping, fields: FieldDef[]): ColumnMapping {
  const validKeys = new Set(fields.map(field => field.key));
  return Object.fromEntries(Object.entries(mapping).filter(([key]) => validKeys.has(key)));
}

function ColumnMappingEditor({
  value,
  onChange,
  fields,
}: {
  value: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
  fields: FieldDef[];
}) {
  const requiredFields = fields.filter(f => f.required);
  const optionalFields = fields.filter(f => !f.required);
  const requiredKeys = new Set(requiredFields.map(f => f.key));

  const updateField = (field: keyof ColumnMapping, csvCol: string) => {
    const next = { ...value } as Record<string, string | undefined>;
    if (csvCol) next[field] = csvCol;
    else if (requiredKeys.has(field)) next[field] = '';
    else delete next[field];
    onChange(next as unknown as ColumnMapping);
  };

  const renderField = (f: FieldDef, isRequired: boolean) => (
    <div key={f.key} className="flex items-center gap-2.5 py-1.5">
      <Label className="w-36 text-xs flex items-center gap-1.5 shrink-0">
        {f.label}
        {isRequired && <span className="text-destructive text-[10px]">*</span>}
      </Label>
      <Input
        type="text"
        value={(value as unknown as Record<string, string | undefined>)[f.key] ?? ''}
        onChange={(e) => updateField(f.key as keyof ColumnMapping, e.target.value)}
        placeholder={`CSV column for ${f.label}`}
        className="font-mono flex-1 h-7 text-[11px]"
      />
    </div>
  );

  return (
    <div>
      <Label className="text-xs mb-2 block">Column mapping</Label>
      <div className="rounded-md border border-primary/20 bg-primary/5 p-3 mb-2.5">
        <div className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1">
          Required fields
        </div>
        {requiredFields.map(f => renderField(f, true))}
      </div>
      <div className="rounded-md border border-border bg-muted/30 p-3">
        <Label className="text-[10px] mb-1 block">Optional fields</Label>
        {optionalFields.map(f => renderField(f, false))}
      </div>
    </div>
  );
}

function SourceModal({
  onClose,
  onSaved,
  recordTypes,
}: {
  onClose: () => void;
  onSaved: (msg: string) => void;
  recordTypes: RecordTypeListResponse;
}) {
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [type, setType] = useState(recordTypes.types[0]?.key || '');
  const [description, setDescription] = useState('');
  const [delimiter, setDelimiter] = useState(';');

  const { data: recordType, isLoading: fieldsLoading, error: fieldsError } = useRecordType(type);
  const fields = useMemo(() => recordType?.fields ?? [], [recordType]);

  const [mapping, setMapping] = useState<ColumnMapping>(() => {
    return {};
  });
  const filteredMapping = useMemo(
    () => filterMappingForFields(mapping, fields),
    [fields, mapping],
  );
  const effectiveMapping = useMemo(
    () => ({ ...emptyMapping(fields), ...filteredMapping }),
    [fields, filteredMapping],
  );
  const [formError, setFormError] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      return api.post<DataSource>('/api/sources', {
        name,
        type,
        description: description.trim() || undefined,
        delimiter,
        column_mapping: effectiveMapping,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      onSaved('Source created');
      onClose();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (mutation.isPending) return;
    setFormError('');
    if (!name.trim()) {
      setFormError('Source name is required');
      return;
    }
    if (!type) {
      setFormError('Source type is required');
      return;
    }
    if (fieldsLoading) {
      setFormError('Field definitions are still loading');
      return;
    }
    if (fieldsError) {
      setFormError('Field definitions could not be loaded');
      return;
    }
    const missingRequired = fields
      .filter(f => f.required)
      .find(f => !(effectiveMapping as unknown as Record<string, string | undefined>)[f.key]);
    if (missingRequired) {
      setFormError(`${missingRequired.label} column mapping is required`);
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-w-lg max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden"
        showCloseButton={false}
      >
        <DialogHead className="px-4 pt-4 pb-0">
          <DialogTitle>New data source</DialogTitle>
        </DialogHead>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 overflow-hidden"
        >
          <ScrollArea className="flex-1 px-4 py-4">
            <div className="flex flex-col gap-3.5">
              {formError && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs text-destructive">
                  <AlertTriangleIcon className="size-3 shrink-0" />
                  {formError}
                </div>
              )}

              <div className="flex flex-col gap-1">
                <Label>
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. SAP Vendor Export"
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label>
                  Type <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={type}
                  onValueChange={(val) => {
                    setType(val);
                    setMapping({});
                  }}
                  required
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {recordTypes.types.map(rt => (
                      <SelectItem key={rt.key} value={rt.key}>{rt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <Label>Description</Label>
                <Textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Optional description"
                  rows={2}
                  className="resize-y min-h-0 py-1.5"
                />
              </div>

              <div className="flex gap-2.5">
                <div className="flex flex-col gap-1">
                  <Label>Delimiter</Label>
                  <Input
                    type="text"
                    value={delimiter}
                    onChange={e => setDelimiter(e.target.value)}
                    placeholder=";"
                    className="w-20 font-mono text-center"
                  />
                </div>
              </div>

              {fieldsLoading ? (
                <div className="text-xs text-muted-foreground px-1 py-3">
                  Loading field definitions…
                </div>
              ) : fieldsError ? (
                <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs text-destructive">
                  <AlertTriangleIcon className="size-3 shrink-0" />
                  Field definitions could not be loaded.
                </div>
              ) : (
                <ColumnMappingEditor value={effectiveMapping} onChange={setMapping} fields={fields} />
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="px-4 py-2.5 border-t">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={mutation.isPending}>
              {mutation.isPending && <Spinner size={12} />}
              Create source
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteConfirm({
  source,
  onClose,
  onDeleted,
}: {
  source: DataSource;
  onClose: () => void;
  onDeleted: (msg: string) => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.delete(`/api/sources/${source.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      queryClient.invalidateQueries({ queryKey: ['match-runs'] });
      queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['review-stats'] });
      onDeleted('Source deleted');
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm" showCloseButton={false}>
        <DialogHead>
          <DialogTitle className="text-destructive">Delete source</DialogTitle>
        </DialogHead>
        <div>
          <p className="text-sm mb-2">
            Delete <b>{source.name}</b>?
          </p>
          <p className="text-xs text-muted-foreground">
            This cannot be undone. All batches, staged records, and match candidates for this source will be deleted.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => !mutation.isPending && mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending && <Spinner size={12} />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type StatusFilter = 'all' | 'healthy' | 'stale';

function SourceRow({
  src,
  stats,
  fieldCount,
  onDelete,
}: {
  src: DataSource;
  stats: SourceStats;
  fieldCount: number;
  onDelete: (source: DataSource) => void;
}) {
  const { data: recordType } = useRecordType(src.type);
  const mapping = toColumnMapping(src.column_mapping);
  const fields = recordType?.fields ?? [];
  const totalFields = fields.length || fieldCount;
  const validMapping = fields.length > 0 ? filterMappingForFields(mapping, fields) : mapping;
  const mappedCount = Object.values(validMapping).filter(Boolean).length;
  const requiredFields = fields.filter(field => field.required);
  const allRequiredMapped = fields.length > 0
    ? requiredFields.every(field => Boolean(validMapping[field.key]))
    : fieldCount === 0;

  return (
    <TableRow className="h-12">
      <TableCell className="w-[50px]"><SourcePill short={shortFor(src.name)} title={src.name} /></TableCell>
      <TableCell>
        <div className="font-medium">{src.name}</div>
        {src.description && (
          <div className="text-[11px] text-muted-foreground mt-0.5">{src.description}</div>
        )}
      </TableCell>
      <TableCell className="text-right font-mono tabular-nums w-[90px]">
        {stats.rows > 0 ? stats.rows.toLocaleString() : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell
        className={`text-right font-mono tabular-nums w-[90px]${allRequiredMapped ? '' : ' text-amber-600 dark:text-amber-400'}`}
      >
        {totalFields > 0 ? `${mappedCount} / ${totalFields}` : `${mappedCount}`}
      </TableCell>
      <TableCell className="font-mono text-[11px] text-muted-foreground w-[110px]">
        {relativeTime(stats.lastSync)}
      </TableCell>
      <TableCell className="w-[100px]">
        {stats.status === 'healthy' ? (
          <Badge variant="secondary" className="text-emerald-700 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300">healthy</Badge>
        ) : stats.status === 'stale' ? (
          <Badge variant="secondary" className="text-amber-700 bg-amber-100 dark:bg-amber-950 dark:text-amber-300">stale</Badge>
        ) : (
          <Badge variant="outline">new</Badge>
        )}
      </TableCell>
      <TableCell className="w-[80px]">
        <div className="flex gap-1 justify-end">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onDelete(src)}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            aria-label={`Delete ${src.name}`}
          >
            <Trash2Icon className="size-3" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// Groups sources by a chosen key — swap `groupBy` to scaffold a different grouping.
const groupBy = (src: DataSource) => src.type;

function groupSources(sources: DataSource[]): { key: string; items: DataSource[] }[] {
  const order: string[] = [];
  const map: Record<string, DataSource[]> = {};
  for (const src of sources) {
    const k = groupBy(src);
    if (!(k in map)) { order.push(k); map[k] = []; }
    map[k].push(src);
  }
  return order.map(k => ({ key: k, items: map[k] }));
}

export default function Sources() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteSource, setDeleteSource] = useState<DataSource | null>(null);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const { data: sources, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.get<DataSource[]>('/api/sources'),
  });

  const { data: recordTypes, error: recordTypesError } = useRecordTypes();
  const canCreateSource = Boolean(recordTypes?.types.length);

  // All batches at once — small payload, used to derive per-source rows / batch count / last-sync
  const { data: batches } = useQuery({
    queryKey: ['batches', 'all'],
    queryFn: () => api.get<BatchResponse[]>('/api/import/batches'),
  });

  const statsBySource = useMemo<Map<number, SourceStats>>(() => {
    const map = new Map<number, SourceStats>();
    if (!batches) return map;
    for (const b of batches) {
      // Count only successful ingestions toward "rows" and "last sync"
      const ok = ['completed', 'complete'].includes(b.status.toLowerCase());
      const cur = map.get(b.data_source_id) ?? { rows: 0, batches: 0, lastSync: null, status: 'new' as const };
      cur.batches += 1;
      if (ok) {
        cur.rows += b.row_count ?? 0;
        if (!cur.lastSync || new Date(b.created_at) > new Date(cur.lastSync)) {
          cur.lastSync = b.created_at;
        }
      }
      map.set(b.data_source_id, cur);
    }
    // Final pass: derive status from last sync recency
    for (const [, s] of map) {
      s.status = s.lastSync ? sourceStatus(s.lastSync) : 'new';
    }
    return map;
  }, [batches]);

  // We need to look up fields per source type dynamically below
  // so we won't calculate a single requiredFieldCount here.

  // Counts for the toggle-group tabs
  const tabCounts = useMemo(() => {
    if (!sources) return { all: 0, healthy: 0, stale: 0 };
    let healthy = 0;
    let stale = 0;
    for (const src of sources) {
      const s = statsBySource.get(src.id);
      if (s?.status === 'healthy') healthy++;
      else if (s?.status === 'stale') stale++;
    }
    return { all: sources.length, healthy, stale };
  }, [sources, statsBySource]);

  // Filtered list used by the table
  const filteredSources = useMemo(() => {
    if (!sources) return [];
    const q = search.trim().toLowerCase();
    return sources.filter(src => {
      const stats = statsBySource.get(src.id);
      if (statusFilter === 'healthy' && stats?.status !== 'healthy') return false;
      if (statusFilter === 'stale' && stats?.status !== 'stale') return false;
      if (q) {
        const haystack = `${src.name} ${src.description ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [sources, statsBySource, statusFilter, search]);

  const handleSyncAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['sources'] });
    queryClient.invalidateQueries({ queryKey: ['batches', 'all'] });
    void refetch();
  }, [queryClient, refetch]);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToasts(prev => [...prev, { id: crypto.randomUUID(), message, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-3.5">
          <div>
            <h1 className="text-lg font-semibold">Sources</h1>
            <div className="text-xs text-muted-foreground mt-0.5">
              {(() => {
                if (!sources) return 'Loading…';
                if (sources.length === 0) return 'No sources connected yet';
                const totalRows = [...statsBySource.values()].reduce((a, s) => a + s.rows, 0);
                const stale = [...statsBySource.values()].filter(s => s.status === 'stale').length;
                return `${sources.length} connected · ${totalRows.toLocaleString()} rows${stale > 0 ? ` · ${stale} stale` : ''}`;
              })()}
            </div>
          </div>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncAll}
              disabled={isFetching}
              title="Refresh sources and batch stats"
            >
              {isFetching ? (
                <Spinner size={12} />
              ) : (
                <RefreshCwIcon className="size-3" />
              )}
              Sync all
            </Button>
            <Button
              size="sm"
              onClick={() => setShowCreate(true)}
              disabled={!canCreateSource}
            >
              <PlusIcon className="size-3" />
              New source
            </Button>
          </div>
        </div>

        {recordTypesError && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs text-destructive mb-3">
            <AlertTriangleIcon className="size-3 shrink-0" />
            Could not load field definitions — source creation is temporarily unavailable.
          </div>
        )}

        <Card>
          {/* Filter / search / advanced — only when there's at least one source */}
          {sources && sources.length > 0 && (
            <CardHeader className="flex-row items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2.5">
                <ToggleGroup
                  type="single"
                  value={statusFilter}
                  onValueChange={(v) => { if (v) setStatusFilter(v as StatusFilter); }}
                  variant="outline"
                  size="sm"
                  spacing={0}
                >
                  <ToggleGroupItem value="all">All <span className="ml-1 text-muted-foreground">{tabCounts.all}</span></ToggleGroupItem>
                  <ToggleGroupItem value="healthy">Healthy <span className="ml-1 text-muted-foreground">{tabCounts.healthy}</span></ToggleGroupItem>
                  <ToggleGroupItem value="stale">Stale <span className="ml-1 text-muted-foreground">{tabCounts.stale}</span></ToggleGroupItem>
                </ToggleGroup>
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Filter sources…"
                  className="w-56 h-7 text-[11px]"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                title="Advanced filters"
                aria-label="Advanced filters"
              >
                <FilterIcon className="size-3" />
                Advanced
              </Button>
            </CardHeader>
          )}

          <CardContent className="p-0">
            <LoadingErrorEmpty
              loading={isLoading}
              error={error}
            >
              {sources != null && sources.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                  <DatabaseIcon className="size-8 opacity-50" />
                  <div className="text-sm font-medium">No data sources yet</div>
                  <div className="text-xs text-center">
                    Create your first data source to begin mapping records for unification.
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setShowCreate(true)}
                    disabled={!canCreateSource}
                    className="mt-1"
                  >
                    <PlusIcon className="size-3" />
                    Create first source
                  </Button>
                </div>
              ) : filteredSources.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                  <SearchXIcon className="size-7 opacity-50" />
                  <div className="text-sm">No sources match the current filter</div>
                  <div className="text-xs">
                    Adjust the tab or clear the search to see all {sources?.length ?? 0} source{(sources?.length ?? 0) !== 1 ? 's' : ''}.
                  </div>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]" />
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right w-[90px]">Rows</TableHead>
                      <TableHead className="text-right w-[90px]">Mapped</TableHead>
                      <TableHead className="w-[110px]">Last sync</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead className="w-[80px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupSources(filteredSources).map(({ key: groupKey, items }) => {
                      const typeLabel = recordTypes?.types.find(rt => rt.key === groupKey)?.label ?? groupKey;
                      return (
                        <React.Fragment key={groupKey}>
                          <TableRow className="bg-muted/30 pointer-events-none hover:bg-muted/30">
                            <TableCell colSpan={7} className="py-1.5">
                              <Badge variant="secondary">{typeLabel}</Badge>
                            </TableCell>
                          </TableRow>
                          {items.map(src => {
                            const stats = statsBySource.get(src.id) ?? { rows: 0, batches: 0, lastSync: null, status: 'new' as const };
                            const typeSummary = recordTypes?.types.find(rt => rt.key === src.type);
                            return (
                              <SourceRow
                                key={src.id}
                                src={src}
                                stats={stats}
                                fieldCount={typeSummary?.field_count ?? 0}
                                onDelete={setDeleteSource}
                              />
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </LoadingErrorEmpty>
          </CardContent>
        </Card>
      </div>

      {showCreate && recordTypes && (
        <SourceModal
          recordTypes={recordTypes}
          onClose={() => setShowCreate(false)}
          onSaved={(msg) => showToast(msg)}
        />
      )}
      {deleteSource && (
        <DeleteConfirm
          source={deleteSource}
          onClose={() => setDeleteSource(null)}
          onDeleted={(msg) => showToast(msg)}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
