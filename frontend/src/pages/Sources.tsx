// ── Sources management page — full CRUD with column mapping ──
// Dark Precision Editorial aesthetic — atmospheric modals, gradient cards, staggered animations

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

// ── Notification toast — glass card with accent border and entrance animation ──
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 animate-slideUp">
      <div
        className={`relative flex items-center gap-3 rounded-xl px-5 py-3.5 text-sm font-medium shadow-2xl overflow-hidden ${
          type === 'success'
            ? 'glass text-success-400'
            : 'glass text-danger-400'
        }`}
      >
        {/* Accent edge line */}
        <div
          className={`absolute left-0 top-0 bottom-0 w-[2px] ${
            type === 'success' ? 'bg-success-400' : 'bg-danger-400'
          }`}
        />
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {type === 'success' ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          )}
        </svg>
        <span className="font-body">{message}</span>
        <button onClick={onClose} className="ml-3 opacity-60 hover:opacity-100 transition-opacity">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Column Mapping Editor — sectioned with visual hierarchy ──
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
    <div className="space-y-4">
      {/* Section label */}
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
        <p className="text-xs font-semibold uppercase tracking-wider text-accent-400">
          Column Mapping
        </p>
      </div>
      <p className="text-xs text-surface-500 -mt-2">
        Map the canonical fields to your CSV column headers
      </p>

      {/* Required fields section */}
      <div className="rounded-lg border border-accent-500/10 bg-accent-500/[0.03] p-4 space-y-3">
        <div className="flex items-center gap-1.5 mb-1">
          <div className="w-1.5 h-1.5 rounded-full bg-accent-400" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-accent-300">Required Fields</span>
        </div>
        {REQUIRED_FIELDS.map((field) => (
          <div key={field} className="flex items-center gap-3">
            <label className="w-36 text-sm text-gray-300 flex items-center gap-1.5 font-medium">
              {FIELD_LABELS[field]}
              <span className="text-danger-400 text-xs">*</span>
            </label>
            <input
              type="text"
              value={value[field] ?? ''}
              onChange={(e) => updateField(field, e.target.value)}
              placeholder={`CSV column for ${FIELD_LABELS[field]}`}
              className="input-field flex-1"
            />
          </div>
        ))}
      </div>

      {/* Optional fields section */}
      <div className="rounded-lg border border-white/[0.04] bg-surface-800/20 p-4 space-y-3">
        <div className="flex items-center gap-1.5 mb-1">
          <div className="w-1.5 h-1.5 rounded-full bg-surface-500" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">Optional Fields</span>
        </div>
        {OPTIONAL_FIELDS.map((field) => (
          <div key={field} className="flex items-center gap-3">
            <label className="w-36 text-sm text-surface-500">
              {FIELD_LABELS[field]}
            </label>
            <input
              type="text"
              value={value[field] ?? ''}
              onChange={(e) => updateField(field, e.target.value)}
              placeholder="CSV column (optional)"
              className="input-field flex-1"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Source Form Modal — atmospheric with gradient border and scaleIn entrance ──
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop with atmospheric blur */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

      {/* Modal card */}
      <div
        className="relative w-full max-w-lg rounded-2xl border-gradient bg-surface-900 shadow-2xl shadow-black/50 max-h-[90vh] overflow-y-auto animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient glow at top */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-48 bg-accent-500/[0.06] rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="relative flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent-500/10 border border-accent-500/20">
              <svg className="w-4 h-4 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                {isEditing ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                )}
              </svg>
            </div>
            <h2 className="text-lg font-display text-white">
              {isEditing ? 'Edit Data Source' : 'New Data Source'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-surface-500 hover:text-gray-200 hover:bg-white/[0.06] transition-all duration-200"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="relative p-6 space-y-5">
          {formError && (
            <div className="rounded-lg border border-danger-500/20 bg-danger-500/[0.06] px-4 py-3 text-sm text-danger-400 flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
              {formError}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-surface-500">
              Name <span className="text-danger-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. SAP Vendor Export"
              className="input-field"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-surface-500">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
              className="input-field resize-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-surface-500">
              Delimiter
            </label>
            <input
              type="text"
              value={delimiter}
              onChange={(e) => setDelimiter(e.target.value)}
              placeholder=";"
              className="input-field w-24 font-mono text-center"
            />
          </div>

          <ColumnMappingEditor value={mapping} onChange={setMapping} />

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.04]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/[0.08] bg-surface-800/50 px-4 py-2.5 text-sm font-medium text-gray-400 transition-all duration-200 hover:bg-surface-700 hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn-primary"
            >
              {mutation.isPending && (
                <div className="w-3.5 h-3.5 border-2 border-surface-950/30 border-t-surface-950 rounded-full animate-spin" />
              )}
              {isEditing ? 'Update Source' : 'Create Source'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Confirmation — danger-themed atmospheric modal ──
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

      {/* Modal */}
      <div
        className="relative w-full max-w-sm rounded-2xl bg-surface-900 border border-danger-500/15 shadow-2xl shadow-danger-500/10 animate-scaleIn overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Danger ambient glow */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-48 h-40 bg-danger-500/[0.08] rounded-full blur-3xl pointer-events-none" />

        <div className="relative p-6">
          {/* Warning icon — large and prominent */}
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-danger-500/10 border border-danger-500/20 mx-auto mb-4">
            <svg className="w-7 h-7 text-danger-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>

          <h3 className="text-lg font-display text-white text-center mb-2">Delete Source</h3>
          <p className="text-sm text-surface-500 text-center mb-6 leading-relaxed">
            Are you sure you want to delete{' '}
            <span className="text-gray-200 font-semibold">"{source.name}"</span>?
            <br />
            <span className="text-danger-400/70 text-xs mt-1 inline-block">This action cannot be undone.</span>
          </p>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-white/[0.08] bg-surface-800/50 px-4 py-2.5 text-sm font-medium text-gray-400 transition-all duration-200 hover:bg-surface-700 hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-danger-500 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-danger-400 disabled:opacity-50 shadow-lg shadow-danger-500/20"
            >
              {mutation.isPending && (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Loading Skeleton — shimmer animation with card layout ──
function SourceSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-white/[0.04] bg-surface-900/30 p-5"
          style={{ animationDelay: `${i * 0.1}s` }}
        >
          <div className="flex items-start justify-between">
            <div className="space-y-3 flex-1">
              <div className="flex items-center gap-3">
                <div className="h-5 w-44 rounded-md animate-shimmer" />
                <div className="h-5 w-16 rounded-md animate-shimmer" />
              </div>
              <div className="h-3 w-64 rounded animate-shimmer" />
              <div className="flex gap-2 mt-1">
                <div className="h-5 w-28 rounded-md animate-shimmer" />
                <div className="h-5 w-32 rounded-md animate-shimmer" />
                <div className="h-5 w-24 rounded-md animate-shimmer" />
              </div>
            </div>
          </div>
          <div className="mt-3 flex gap-4">
            <div className="h-3 w-24 rounded animate-shimmer" />
            <div className="h-3 w-24 rounded animate-shimmer" />
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
      {/* Header — display font with atmospheric button */}
      <div className="flex items-center justify-between mb-8 animate-fadeIn">
        <div className="flex items-center gap-4">
          <div className="relative flex items-center justify-center w-11 h-11 rounded-xl bg-accent-500/10 border border-accent-500/20 glow-accent">
            <svg className="w-5 h-5 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-display text-white tracking-tight text-glow-accent">
              Data Sources
            </h1>
            <p className="text-sm text-surface-500 font-body">
              Manage your supplier data feeds and column mappings
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Source
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-danger-500/20 bg-danger-500/[0.06] p-6 text-center animate-fadeIn">
          <svg className="w-8 h-8 text-danger-400/60 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
          <p className="text-sm text-danger-400">
            Failed to load sources: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && <SourceSkeleton />}

      {/* Empty state — atmospheric with compelling CTA */}
      {!isLoading && !error && sources?.length === 0 && (
        <div className="relative flex flex-col items-center justify-center rounded-2xl border border-white/[0.04] bg-surface-900/20 p-20 overflow-hidden animate-fadeIn">
          {/* Atmospheric background */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-accent-500/[0.03] rounded-full blur-3xl" />
            <div
              className="absolute inset-0 opacity-[0.02]"
              style={{
                backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.3) 1px, transparent 0)`,
                backgroundSize: '24px 24px',
              }}
            />
          </div>

          <div className="relative">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-accent-500/[0.06] border border-accent-500/15 mx-auto mb-5 animate-float">
              <svg className="w-8 h-8 text-accent-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
              </svg>
            </div>
            <p className="text-lg font-display text-gray-200 mb-1 text-center">No data sources yet</p>
            <p className="text-sm text-surface-500 mb-8 text-center max-w-xs leading-relaxed">
              Create your first data source to begin mapping supplier data for deduplication
            </p>
            <div className="flex justify-center">
              <button
                onClick={() => setShowCreate(true)}
                className="btn-primary"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Create First Source
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Source list — cards with depth and staggered entrance */}
      {!isLoading && sources && sources.length > 0 && (
        <div className="space-y-3">
          {sources.map((src, index) => (
            <div
              key={src.id}
              className={`group card card-hover p-5 animate-slideUp stagger-${Math.min(index + 1, 8)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    {/* Source icon */}
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent-500/[0.06] border border-accent-500/15 shrink-0">
                      <svg className="w-4 h-4 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" />
                      </svg>
                    </div>
                    <h3 className="text-base font-semibold text-white truncate">{src.name}</h3>
                    <span className="shrink-0 inline-flex items-center rounded-md bg-surface-700/40 border border-white/[0.04] px-2 py-0.5 text-xs font-mono text-surface-500">
                      delim: "{src.delimiter}"
                    </span>
                  </div>
                  {src.description && (
                    <p className="text-sm text-surface-500 mb-2 ml-11 line-clamp-1">{src.description}</p>
                  )}

                  {/* Column mapping tags — visual hierarchy between field name and CSV header */}
                  <div className="flex flex-wrap gap-1.5 mt-2 ml-11">
                    {Object.entries(src.column_mapping).map(([key, val]) => (
                      <span
                        key={key}
                        className="inline-flex items-center rounded-md border border-white/[0.04] bg-surface-800/40 px-2 py-0.5 text-xs transition-colors group-hover:border-white/[0.06]"
                      >
                        <span className="text-accent-400/70 font-medium">{key}</span>
                        <svg className="w-2.5 h-2.5 mx-1 text-surface-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                        </svg>
                        <span className="text-gray-300 font-mono">{val}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Action buttons — appear on hover */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 shrink-0 ml-4">
                  <button
                    onClick={() => setEditSource(src)}
                    className="p-2 rounded-lg text-surface-500 hover:text-accent-400 hover:bg-accent-500/10 transition-all duration-200"
                    title="Edit"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setDeleteSource(src)}
                    className="p-2 rounded-lg text-surface-500 hover:text-danger-400 hover:bg-danger-500/10 transition-all duration-200"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Footer metadata */}
              <div className="mt-3 ml-11 flex items-center gap-4 text-xs text-surface-600">
                <span className="flex items-center gap-1.5">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Created {new Date(src.created_at).toLocaleDateString()}
                </span>
                <span className="flex items-center gap-1.5">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                  </svg>
                  Updated {new Date(src.updated_at).toLocaleDateString()}
                </span>
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
