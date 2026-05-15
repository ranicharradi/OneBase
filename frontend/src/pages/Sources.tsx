// ── Sources management — terminal aesthetic, full CRUD ──

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type {
  BatchResponse,
  ColumnMapping,
  DataSource,
  DataSourceUpdate,
  FieldDef,
  RecordTypeListResponse,
} from '../api/types';
import { ToastContainer, type ToastData } from '../components/Toast';
import { useRecordType, useRecordTypes } from '../hooks/useRecordTypes';
import Panel, { PanelHead } from '../components/ui/Panel';
import { Modal } from '../components/ui/Modal';
import Pill from '../components/ui/Pill';
import Seg from '../components/ui/Seg';
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
    <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
      <label style={{ width: 150, fontSize: 12, color: 'var(--fg-1)', display: 'flex', alignItems: 'center', gap: 6 }}>
        {f.label}
        {isRequired && <span style={{ color: 'var(--danger)', fontSize: 10 }}>*</span>}
      </label>
      <input
        type="text"
        value={(value as unknown as Record<string, string | undefined>)[f.key] ?? ''}
        onChange={(e) => updateField(f.key as keyof ColumnMapping, e.target.value)}
        placeholder={`CSV column for ${f.label}`}
        className="input mono"
        style={{ flex: 1, fontSize: 11 }}
      />
    </div>
  );

  return (
    <div>
      <div className="label" style={{ marginBottom: 8 }}>Column mapping</div>
      <div
        style={{
          background: 'var(--accent-soft)',
          border: '1px solid var(--accent-border)',
          borderRadius: 4,
          padding: '10px 12px',
          marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          Required fields
        </div>
        {requiredFields.map(f => renderField(f, true))}
      </div>
      <div
        style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--border-0)',
          borderRadius: 4,
          padding: '10px 12px',
        }}
      >
        <div className="label" style={{ marginBottom: 4 }}>Optional fields</div>
        {optionalFields.map(f => renderField(f, false))}
      </div>
    </div>
  );
}

function SourceModal({
  source,
  onClose,
  onSaved,
  recordTypes,
}: {
  source?: DataSource;
  onClose: () => void;
  onSaved: (msg: string) => void;
  recordTypes: RecordTypeListResponse;
}) {
  const queryClient = useQueryClient();
  const isEditing = !!source;

  const [name, setName] = useState(source?.name ?? '');
  const [type, setType] = useState(source?.type ?? (recordTypes.types[0]?.key || ''));
  const [description, setDescription] = useState(source?.description ?? '');
  const [delimiter, setDelimiter] = useState(source?.delimiter ?? ';');
  const [filenamePattern, setFilenamePattern] = useState(source?.filename_pattern ?? '');

  const { data: recordType, isLoading: fieldsLoading, error: fieldsError } = useRecordType(type);
  const fields = useMemo(() => recordType?.fields ?? [], [recordType]);

  const [mapping, setMapping] = useState<ColumnMapping>(() => {
    return source ? toColumnMapping(source.column_mapping) : {};
  });
  const effectiveMapping = useMemo(
    () => (isEditing ? mapping : { ...emptyMapping(fields), ...mapping }),
    [fields, isEditing, mapping],
  );
  const [formError, setFormError] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEditing) {
        const update: DataSourceUpdate = {
          name,
          description: description.trim() || null,
          delimiter,
          column_mapping: effectiveMapping,
          filename_pattern: filenamePattern.trim() || null,
        };
        return api.put<DataSource>(`/api/sources/${source.id}`, update);
      }

      return api.post<DataSource>('/api/sources', {
        name,
        type,
        description: description.trim() || undefined,
        delimiter,
        column_mapping: effectiveMapping,
        filename_pattern: filenamePattern.trim() || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      onSaved(isEditing ? 'Source updated' : 'Source created');
      onClose();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
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
    <Modal
      onClose={onClose}
      title={isEditing ? 'Edit data source' : 'New data source'}
      size="lg" // lg gives column-mapper room
      panelStyle={{ maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
    >
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
      >
        <div className="scroll" style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {formError && (
            <div className="pill danger" style={{ width: '100%', padding: '6px 10px', justifyContent: 'flex-start' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>error</span>
              {formError}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="label">
              Name <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. SAP Vendor Export"
              className="input"
              autoFocus
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="label">
              Type <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            {!isEditing ? (
              <select
                className="input"
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  setMapping({});
                }}
                required
              >
                {recordTypes.types.map(rt => (
                  <option key={rt.key} value={rt.key}>{rt.label}</option>
                ))}
              </select>
            ) : (
              <input className="input" value={source.type} disabled />
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="label">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
              className="input"
              style={{ height: 'auto', padding: '6px 10px', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="label">Delimiter</label>
              <input
                type="text"
                value={delimiter}
                onChange={e => setDelimiter(e.target.value)}
                placeholder=";"
                className="input mono"
                style={{ width: 80, textAlign: 'center' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
              <label className="label">Filename pattern</label>
              <input
                type="text"
                value={filenamePattern}
                onChange={e => setFilenamePattern(e.target.value)}
                placeholder="regex (optional)"
                className="input mono"
              />
            </div>
          </div>

          {fieldsLoading ? (
            <div style={{ padding: 12, fontSize: 12, color: 'var(--fg-2)' }}>
              Loading field definitions…
            </div>
          ) : fieldsError ? (
            <div className="pill danger" style={{ width: '100%', padding: '6px 10px', justifyContent: 'flex-start' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>error</span>
              Field definitions could not be loaded.
            </div>
          ) : (
            <ColumnMappingEditor value={effectiveMapping} onChange={setMapping} fields={fields} />
          )}
        </div>

        <div
          style={{
            padding: '10px 14px',
            borderTop: '1px solid var(--border-0)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button type="button" onClick={onClose} className="btn btn-sm">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="btn btn-sm btn-accent">
            {mutation.isPending && <Spinner size={10} color="#fff" />}
            {isEditing ? 'Update source' : 'Create source'}
          </button>
        </div>
      </form>
    </Modal>
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
      queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['review-stats'] });
      onDeleted('Source deleted');
      onClose();
    },
  });

  return (
    <Modal
      onClose={onClose}
      title={<span className="panel-title" style={{ color: 'var(--danger)' }}>Delete source</span>}
      size="sm"
    >
      <div style={{ padding: 16 }}>
        <p style={{ fontSize: 13, margin: 0, marginBottom: 8 }}>
          Delete <b>{source.name}</b>?
        </p>
        <p style={{ fontSize: 11, color: 'var(--fg-2)', margin: 0 }}>
          This cannot be undone. Existing batches and unified records will be preserved, but new uploads will fail.
        </p>
      </div>
      <div
        style={{
          padding: '10px 14px',
          borderTop: '1px solid var(--border-0)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
        }}
      >
        <button onClick={onClose} className="btn btn-sm">Cancel</button>
        <button
          onClick={() => !mutation.isPending && mutation.mutate()}
          disabled={mutation.isPending}
          className="btn btn-sm btn-danger"
        >
          {mutation.isPending && <Spinner size={10} color="var(--danger)" />}
          Delete
        </button>
      </div>
    </Modal>
  );
}

type StatusFilter = 'all' | 'healthy' | 'stale';

function SourceRow({
  src,
  stats,
  fieldCount,
  onEdit,
  onDelete,
}: {
  src: DataSource;
  stats: SourceStats;
  fieldCount: number;
  onEdit: (source: DataSource) => void;
  onDelete: (source: DataSource) => void;
}) {
  const { data: recordType } = useRecordType(src.type);
  const mapping = toColumnMapping(src.column_mapping);
  const mappedCount = Object.values(mapping).filter(Boolean).length;
  const fields = recordType?.fields ?? [];
  const totalFields = fields.length || fieldCount;
  const requiredFields = fields.filter(field => field.required);
  const allRequiredMapped = fields.length > 0
    ? requiredFields.every(field => Boolean(mapping[field.key]))
    : fieldCount === 0;

  return (
    <tr>
      <td><SourcePill short={shortFor(src.name)} title={src.name} /></td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontWeight: 500 }}>{src.name}</div>
          <Pill tone="neutral">{src.type}</Pill>
        </div>
        {src.description && (
          <div style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 2 }}>{src.description}</div>
        )}
      </td>
      <td className="num mono">
        {stats.rows > 0 ? stats.rows.toLocaleString() : <span style={{ color: 'var(--fg-3)' }}>—</span>}
      </td>
      <td className="num mono" style={{ color: allRequiredMapped ? 'var(--fg-0)' : 'var(--warn)' }}>
        {totalFields > 0 ? `${mappedCount} / ${totalFields}` : `${mappedCount}`}
      </td>
      <td className="num mono">
        {stats.batches > 0 ? stats.batches : <span style={{ color: 'var(--fg-3)' }}>—</span>}
      </td>
      <td className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>
        {relativeTime(stats.lastSync)}
      </td>
      <td>
        {stats.status === 'healthy' ? (
          <Pill tone="ok" dot>healthy</Pill>
        ) : stats.status === 'stale' ? (
          <Pill tone="warn" dot>stale</Pill>
        ) : (
          <Pill tone="neutral" dot>new</Pill>
        )}
      </td>
      <td>
        <div className="row-actions" style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          <button
            onClick={() => onEdit(src)}
            className="btn btn-ghost btn-sm"
            style={{ padding: 4 }}
            aria-label={`Edit ${src.name}`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>edit</span>
          </button>
          <button
            onClick={() => onDelete(src)}
            className="btn btn-ghost btn-sm"
            style={{ padding: 4, color: 'var(--danger)' }}
            aria-label={`Delete ${src.name}`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>delete</span>
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function Sources() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editSource, setEditSource] = useState<DataSource | null>(null);
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

  // Counts for the seg tabs
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
    <div className="scroll" style={{ height: '100%' }}>
      <div style={{ padding: 20 }}>
        {/* Header */}
        <div className="fade" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Sources</h1>
            <div style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 2 }}>
              {(() => {
                if (!sources) return 'Loading…';
                if (sources.length === 0) return 'No sources connected yet';
                const totalRows = [...statsBySource.values()].reduce((a, s) => a + s.rows, 0);
                const stale = [...statsBySource.values()].filter(s => s.status === 'stale').length;
                return `${sources.length} connected · ${totalRows.toLocaleString()} rows${stale > 0 ? ` · ${stale} stale` : ''}`;
              })()}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={handleSyncAll}
              disabled={isFetching}
              className="btn btn-sm"
              title="Refresh sources and batch stats"
            >
              {isFetching ? (
                <Spinner size={10} />
              ) : (
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>refresh</span>
              )}
              Sync all
            </button>
            <button
              onClick={() => setShowCreate(true)}
              disabled={!canCreateSource}
              className="btn btn-sm btn-primary"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>add</span>
              New source
            </button>
          </div>
        </div>

        {recordTypesError && (
          <div
            className="pill danger"
            style={{ width: '100%', padding: '6px 10px', justifyContent: 'flex-start', marginBottom: 12 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>warning</span>
            Could not load field definitions — source creation is temporarily unavailable.
          </div>
        )}

        <Panel className="fade">
          {/* Filter / search / advanced — only when there's at least one source */}
          {sources && sources.length > 0 && (
            <PanelHead>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Seg<StatusFilter>
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { value: 'all', label: 'All', count: tabCounts.all },
                    { value: 'healthy', label: 'Healthy', count: tabCounts.healthy },
                    { value: 'stale', label: 'Stale', count: tabCounts.stale },
                  ]}
                />
                <input
                  className="input"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Filter sources…"
                  style={{ width: 220, height: 24, fontSize: 11 }}
                />
              </div>
              <button
                className="btn btn-sm btn-ghost"
                title="Advanced filters"
                aria-label="Advanced filters"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>filter_list</span>
                Advanced
              </button>
            </PanelHead>
          )}

          <LoadingErrorEmpty
            isLoading={isLoading}
            error={error}
            isEmpty={sources != null && sources.length === 0}
            errorPrefix="Failed to load sources"
            emptyMessage={
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--fg-3)' }}>storage</span>
                <div style={{ fontSize: 14, fontWeight: 500, marginTop: 10 }}>No data sources yet</div>
                <div style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 4, marginBottom: 12 }}>
                  Create your first data source to begin mapping records for unification.
                </div>
                <button
                  onClick={() => setShowCreate(true)}
                  disabled={!canCreateSource}
                  className="btn btn-sm btn-accent"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>add</span>
                  Create first source
                </button>
              </>
            }
          >
            {filteredSources.length === 0 ? (
              <div style={{ padding: 36, textAlign: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--fg-3)' }}>search_off</span>
                <div style={{ fontSize: 13, marginTop: 8 }}>No sources match the current filter</div>
                <div style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 4 }}>
                  Adjust the tab or clear the search to see all {sources?.length ?? 0} source{(sources?.length ?? 0) !== 1 ? 's' : ''}.
                </div>
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 50 }} />
                    <th>Name</th>
                    <th className="num" style={{ width: 90 }}>Rows</th>
                    <th className="num" style={{ width: 90 }}>Mapped</th>
                    <th className="num" style={{ width: 80 }}>Batches</th>
                    <th style={{ width: 110 }}>Last sync</th>
                    <th style={{ width: 100 }}>Status</th>
                    <th style={{ width: 80 }} />
                  </tr>
                </thead>
                <tbody>
                  {filteredSources.map(src => {
                    const stats = statsBySource.get(src.id) ?? { rows: 0, batches: 0, lastSync: null, status: 'new' as const };
                    const typeSummary = recordTypes?.types.find(rt => rt.key === src.type);
                    return (
                      <SourceRow
                        key={src.id}
                        src={src}
                        stats={stats}
                        fieldCount={typeSummary?.field_count ?? 0}
                        onEdit={setEditSource}
                        onDelete={setDeleteSource}
                      />
                    );
                  })}
                </tbody>
              </table>
            )}
          </LoadingErrorEmpty>
        </Panel>
      </div>

      {showCreate && recordTypes && (
        <SourceModal
          recordTypes={recordTypes}
          onClose={() => setShowCreate(false)}
          onSaved={(msg) => showToast(msg)}
        />
      )}
      {editSource && recordTypes && (
        <SourceModal
          source={editSource}
          recordTypes={recordTypes}
          onClose={() => setEditSource(null)}
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
