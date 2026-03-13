// ── Sources management page — full CRUD with column mapping ──

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { DataSource, DataSourceCreate, ColumnMapping } from '../api/types';

const REQUIRED_FIELDS: (keyof ColumnMapping)[] = ['supplier_name', 'supplier_code'];
const OPTIONAL_FIELDS: (keyof ColumnMapping)[] = [
  'short_name',
  'currency',
  'payment_terms',
  'contact_name',
  'supplier_type',
];

const FIELD_LABELS: Record<string, string> = {
  supplier_name: 'Supplier Name',
  supplier_code: 'Supplier Code',
  short_name: 'Short Name',
  currency: 'Currency',
  payment_terms: 'Payment Terms',
  contact_name: 'Contact Name',
  supplier_type: 'Supplier Type',
};

function emptyMapping(): ColumnMapping {
  return { supplier_name: '', supplier_code: '' };
}

// ── Notification toast ──
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 animate-[slideUp_0.3s_ease-out]">
      <div
        className={`flex items-center gap-3 rounded-xl border px-5 py-3.5 text-sm font-medium shadow-2xl backdrop-blur-sm ${
          type === 'success'
            ? 'border-success-500/20 bg-success-500/10 text-success-400'
            : 'border-danger-500/20 bg-danger-500/10 text-danger-400'
        }`}
      >
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {type === 'success' ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          )}
        </svg>
        {message}
        <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100 transition-opacity">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Column Mapping Editor ──
function ColumnMappingEditor({
  value,
  onChange,
}: {
  value: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
}) {
  const updateField = (field: keyof ColumnMapping, csvCol: string) => {
    const next = { ...value };
    if (csvCol) {
      next[field] = csvCol;
    } else {
      if (field === 'supplier_name' || field === 'supplier_code') {
        next[field] = '';
      } else {
        delete next[field];
      }
    }
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wider text-surface-500 mb-2">
        Column Mapping
      </p>
      <p className="text-xs text-surface-600 mb-3">
        Map the canonical fields to your CSV column headers
      </p>

      {/* Required fields */}
      {REQUIRED_FIELDS.map((field) => (
        <div key={field} className="flex items-center gap-3">
          <label className="w-36 text-sm text-gray-300 flex items-center gap-1.5">
            {FIELD_LABELS[field]}
            <span className="text-danger-400 text-xs">*</span>
          </label>
          <input
            type="text"
            value={value[field] ?? ''}
            onChange={(e) => updateField(field, e.target.value)}
            placeholder={`CSV column for ${FIELD_LABELS[field]}`}
            className="flex-1 rounded-lg border border-white/[0.08] bg-surface-800/50 px-3 py-2 text-sm text-white placeholder-surface-600 outline-none transition-all focus:border-accent-500/40 focus:ring-2 focus:ring-accent-500/10"
          />
        </div>
      ))}

      {/* Optional fields */}
      {OPTIONAL_FIELDS.map((field) => (
        <div key={field} className="flex items-center gap-3">
          <label className="w-36 text-sm text-surface-500">
            {FIELD_LABELS[field]}
          </label>
          <input
            type="text"
            value={value[field] ?? ''}
            onChange={(e) => updateField(field, e.target.value)}
            placeholder={`CSV column (optional)`}
            className="flex-1 rounded-lg border border-white/[0.08] bg-surface-800/50 px-3 py-2 text-sm text-white placeholder-surface-600 outline-none transition-all focus:border-accent-500/40 focus:ring-2 focus:ring-accent-500/10"
          />
        </div>
      ))}
    </div>
  );
}

// ── Source Form Modal ──
function SourceModal({
  source,
  onClose,
  onSaved,
}: {
  source?: DataSource;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const queryClient = useQueryClient();
  const isEditing = !!source;

  const [name, setName] = useState(source?.name ?? '');
  const [description, setDescription] = useState(source?.description ?? '');
  const [delimiter, setDelimiter] = useState(source?.delimiter ?? ';');
  const [mapping, setMapping] = useState<ColumnMapping>(
    source?.column_mapping ?? emptyMapping()
  );
  const [formError, setFormError] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const body: DataSourceCreate = {
        name,
        description: description || undefined,
        delimiter,
        column_mapping: mapping,
      };
      if (isEditing) {
        return api.put<DataSource>(`/api/sources/${source.id}`, body);
      }
      return api.post<DataSource>('/api/sources', body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      onSaved(isEditing ? 'Source updated successfully' : 'Source created successfully');
      onClose();
    },
    onError: (err: Error) => {
      setFormError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!mapping.supplier_name || !mapping.supplier_code) {
      setFormError('Supplier Name and Supplier Code column mappings are required');
      return;
    }
    mutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/[0.06] bg-surface-900 shadow-2xl shadow-black/30 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <h2 className="text-lg font-semibold text-white">
            {isEditing ? 'Edit Data Source' : 'Create Data Source'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-surface-500 hover:text-gray-200 hover:bg-white/[0.04] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {formError && (
            <div className="rounded-lg border border-danger-500/20 bg-danger-500/10 px-4 py-3 text-sm text-danger-400">
              {formError}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-surface-500">
              Name <span className="text-danger-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. SAP Vendor Export"
              className="w-full rounded-lg border border-white/[0.08] bg-surface-800/50 px-4 py-2.5 text-sm text-white placeholder-surface-600 outline-none transition-all focus:border-accent-500/40 focus:ring-2 focus:ring-accent-500/10"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-surface-500">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
              className="w-full rounded-lg border border-white/[0.08] bg-surface-800/50 px-4 py-2.5 text-sm text-white placeholder-surface-600 outline-none transition-all focus:border-accent-500/40 focus:ring-2 focus:ring-accent-500/10 resize-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-surface-500">
              Delimiter
            </label>
            <input
              type="text"
              value={delimiter}
              onChange={(e) => setDelimiter(e.target.value)}
              placeholder=";"
              className="w-24 rounded-lg border border-white/[0.08] bg-surface-800/50 px-4 py-2.5 text-sm text-white placeholder-surface-600 outline-none transition-all focus:border-accent-500/40 focus:ring-2 focus:ring-accent-500/10 font-mono text-center"
            />
          </div>

          <ColumnMappingEditor value={mapping} onChange={setMapping} />

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/[0.08] bg-surface-800/50 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-surface-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent-500/20 transition-all hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mutation.isPending && (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {isEditing ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Confirmation ──
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
      onDeleted('Source deleted successfully');
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/[0.06] bg-surface-900 p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-white mb-2">Delete Source</h3>
        <p className="text-sm text-surface-500 mb-6">
          Are you sure you want to delete <span className="text-gray-300 font-medium">"{source.name}"</span>?
          This action cannot be undone.
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/[0.08] bg-surface-800/50 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-surface-700"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-danger-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-danger-500/80 disabled:opacity-50"
          >
            {mutation.isPending && (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Loading Skeleton ──
function SourceSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-white/[0.04] bg-surface-900/50 p-5 animate-pulse"
        >
          <div className="flex items-start justify-between">
            <div className="space-y-2 flex-1">
              <div className="h-4 w-48 rounded bg-surface-700" />
              <div className="h-3 w-72 rounded bg-surface-800" />
            </div>
            <div className="h-8 w-20 rounded bg-surface-700" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ──
export default function Sources() {
  const [showCreate, setShowCreate] = useState(false);
  const [editSource, setEditSource] = useState<DataSource | null>(null);
  const [deleteSource, setDeleteSource] = useState<DataSource | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data: sources, isLoading, error } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.get<DataSource[]>('/api/sources'),
  });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-accent-500/10 border border-accent-500/20">
            <svg className="w-5 h-5 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Data Sources</h1>
            <p className="text-sm text-surface-500">Manage your supplier data sources and column mappings</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent-500/20 transition-all hover:bg-accent-600"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Source
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-danger-500/20 bg-danger-500/10 p-6 text-center">
          <p className="text-sm text-danger-400">
            Failed to load sources: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && <SourceSkeleton />}

      {/* Empty state */}
      {!isLoading && !error && sources?.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/[0.06] bg-surface-900/20 p-16">
          <svg className="w-14 h-14 text-surface-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
          </svg>
          <p className="text-base font-medium text-gray-300 mb-1">No data sources yet</p>
          <p className="text-sm text-surface-500 mb-6">Create one to get started with supplier data ingestion</p>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent-500/20 transition-all hover:bg-accent-600"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create First Source
          </button>
        </div>
      )}

      {/* Source list */}
      {!isLoading && sources && sources.length > 0 && (
        <div className="space-y-3">
          {sources.map((src) => (
            <div
              key={src.id}
              className="group rounded-xl border border-white/[0.06] bg-surface-900/60 p-5 transition-all hover:border-white/[0.1] hover:bg-surface-900/80"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-semibold text-white truncate">{src.name}</h3>
                    <span className="shrink-0 inline-flex items-center rounded-md bg-surface-700/60 px-2 py-0.5 text-xs font-mono text-surface-500">
                      delim: "{src.delimiter}"
                    </span>
                  </div>
                  {src.description && (
                    <p className="text-sm text-surface-500 mb-2 line-clamp-1">{src.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {Object.entries(src.column_mapping).map(([key, val]) => (
                      <span
                        key={key}
                        className="inline-flex items-center rounded-md border border-white/[0.04] bg-surface-800/50 px-2 py-0.5 text-xs"
                      >
                        <span className="text-surface-500">{key}:</span>
                        <span className="ml-1 text-gray-300 font-mono">{val}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-4">
                  <button
                    onClick={() => setEditSource(src)}
                    className="p-2 rounded-lg text-surface-500 hover:text-accent-400 hover:bg-accent-500/10 transition-colors"
                    title="Edit"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setDeleteSource(src)}
                    className="p-2 rounded-lg text-surface-500 hover:text-danger-400 hover:bg-danger-500/10 transition-colors"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-4 text-xs text-surface-600">
                <span>Created {new Date(src.created_at).toLocaleDateString()}</span>
                <span>Updated {new Date(src.updated_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <SourceModal
          onClose={() => setShowCreate(false)}
          onSaved={(msg) => showToast(msg)}
        />
      )}
      {editSource && (
        <SourceModal
          source={editSource}
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

      {/* Toast */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
