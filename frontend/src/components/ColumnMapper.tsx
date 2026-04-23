// ── Visual column mapper for new data sources ──
// Light Glassmorphism — polished step indicators, airy form, styled mapping rows

import { useState } from 'react';
import type { CanonicalField, ColumnMapping, DataSourceCreate, GuessMappingResponse } from '../api/types';
import { useCanonicalFields } from '../hooks/useCanonicalFields';

interface ColumnMapperProps {
  columns: string[];
  onSubmit: (sourceData: DataSourceCreate) => void;
  isSubmitting?: boolean;
  initialSourceName?: string;
  guessedMapping?: GuessMappingResponse;
  detectedDelimiter?: string;
}

export default function ColumnMapper({ columns, onSubmit, isSubmitting = false, initialSourceName, guessedMapping, detectedDelimiter }: ColumnMapperProps) {
  const { data: registry, isLoading: registryLoading, error: registryError } = useCanonicalFields();
  // Derive canonicalFields early so validate/handleSubmit can close over it.
  // The loading/error guards below ensure we never reach the main render with this empty.
  const canonicalFields: CanonicalField[] = registry?.fields ?? [];

  const [sourceName, setSourceName] = useState(initialSourceName ?? '');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize mapping from guessed values
  const initialMapping: Record<string, string> = {};
  const guessRecord = guessedMapping as unknown as Record<string, { column: string | null; confidence: number }> | undefined;
  if (guessRecord) {
    for (const [field, guess] of Object.entries(guessRecord)) {
      if (guess?.column) {
        initialMapping[field] = guess.column;
      }
    }
  }
  const [mapping, setMapping] = useState<Record<string, string>>(initialMapping);

  const updateMapping = (field: string, csvColumn: string) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (csvColumn) {
        next[field] = csvColumn;
      } else {
        delete next[field];
      }
      return next;
    });
    // Clear error when user maps
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!sourceName.trim()) newErrors.sourceName = 'Source name is required';
    for (const f of canonicalFields) {
      if (f.required && !(mapping as Record<string, string>)[f.key]) {
        newErrors[f.key] = `${f.label} mapping is required`;
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const columnMapping: Partial<Record<string, string>> = {};
    for (const f of canonicalFields) {
      if ((mapping as Record<string, string>)[f.key]) columnMapping[f.key] = (mapping as Record<string, string>)[f.key];
    }

    onSubmit({
      name: sourceName.trim(),
      description: description.trim() || undefined,
      delimiter: detectedDelimiter || ',',
      // Cast: validate() ensures required canonical fields are present before we get here.
      // The static ColumnMapping type's required fields (supplier_name, supplier_code)
      // are therefore guaranteed; the drift-check test in test_canonical_fields.py keeps the
      // registry and Pydantic schema aligned.
      column_mapping: columnMapping as ColumnMapping,
    });
  };

  if (registryLoading) {
    return (
      <div className="card p-6 text-sm text-on-surface-variant/60">
        Loading field definitions…
      </div>
    );
  }
  if (registryError || !registry) {
    return (
      <div className="card p-6 text-sm text-danger-500">
        Failed to load canonical fields. Please refresh and try again.
      </div>
    );
  }

  // Track which CSV columns are already used
  const usedColumns = new Set(Object.values(mapping));
  const mappedCount = Object.keys(mapping).length;
  const totalFields = canonicalFields.length;
  const requiredMapped = canonicalFields.filter(f => f.required && (mapping as Record<string, string>)[f.key]).length;
  const requiredTotal = canonicalFields.filter(f => f.required).length;

  return (
    <form onSubmit={handleSubmit} className="card overflow-hidden">
      {/* ── Step progress header ── */}
      <div className="px-6 pt-6 pb-5 border-b border-on-surface/5">
        <div className="flex items-center gap-6">
          {/* Step 1 indicator */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent-600/15 border border-accent-600/30 text-xs font-bold text-accent-600">
              1
            </div>
            <div>
              <p className="text-xs font-semibold text-accent-600 uppercase tracking-wider">Define</p>
              <p className="text-[10px] text-accent-600/60">Name & describe</p>
            </div>
          </div>

          {/* Connecting line with gradient fill */}
          <div className="flex-1 h-[2px] rounded-full bg-on-surface/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent-600/60 to-accent-600/40 transition-all duration-700 ease-out"
              style={{ width: sourceName.trim() ? '100%' : '0%' }}
            />
          </div>

          {/* Step 2 indicator */}
          <div className="flex items-center gap-2.5">
            <div className={`flex items-center justify-center w-8 h-8 rounded-lg border text-xs font-bold transition-all duration-500 ${
              sourceName.trim()
                ? 'bg-accent-600/15 border-accent-600/30 text-accent-600'
                : 'bg-white/30 border-on-surface/5 text-outline'
            }`}>
              2
            </div>
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wider transition-colors duration-300 ${
                sourceName.trim() ? 'text-accent-600' : 'text-outline'
              }`}>Map</p>
              <p className={`text-[10px] transition-colors duration-300 ${
                sourceName.trim() ? 'text-accent-600/60' : 'text-outline/60'
              }`}>CSV columns</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Step 1: Name your source ── */}
      <div className="p-6 border-b border-on-surface/5">
        <div className="flex items-center gap-3 mb-5">
          <svg className="w-4 h-4 text-accent-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75" />
          </svg>
          <h3 className="text-sm font-display font-bold text-on-surface tracking-wide">Name your source</h3>
        </div>

        <div className="space-y-4 max-w-md">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-on-surface-variant/60 uppercase tracking-wider">
              Source Name <span className="text-danger-500">*</span>
            </label>
            <input
              type="text"
              value={sourceName}
              onChange={(e) => {
                setSourceName(e.target.value);
                if (errors.sourceName) setErrors((prev) => { const n = { ...prev }; delete n.sourceName; return n; });
              }}
              placeholder="e.g. SAP Vendor Export"
              className={`input-field w-full ${
                errors.sourceName
                  ? '!border-danger-500/40 focus:!border-danger-500 focus:!ring-danger-500/10'
                  : ''
              }`}
            />
            {errors.sourceName && (
              <p className="mt-1.5 text-xs text-danger-500 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                {errors.sourceName}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-on-surface-variant/60 uppercase tracking-wider">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="input-field w-full"
            />
          </div>
        </div>
      </div>

      {/* ── Step 2: Map columns ── */}
      <div className="p-6 border-b border-on-surface/5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <svg className="w-4 h-4 text-accent-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
            <h3 className="text-sm font-display font-bold text-on-surface tracking-wide">Map columns</h3>
          </div>

          {/* Required field counter */}
          <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
            requiredMapped === requiredTotal
              ? 'bg-success-bg text-success-500 border border-success-500/15'
              : 'bg-white/30 text-on-surface-variant border border-on-surface/[0.06]'
          }`}>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {requiredMapped}/{requiredTotal} required
          </div>
        </div>

        <p className="text-xs text-on-surface-variant/60 mb-5">
          Map each canonical field to a column from your CSV file. Required fields are marked with <span className="text-danger-500">*</span>
        </p>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr,auto,1fr] gap-3 mb-3 px-3">
          <p className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest">Canonical Field</p>
          <div className="w-6" />
          <p className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest">CSV Column</p>
        </div>

        {/* Mapping rows */}
        <div className="space-y-1.5">
          {canonicalFields.map((field, index) => {
            const isMapped = !!mapping[field.key];
            const hasError = !!errors[field.key];

            return (
              <div
                key={field.key}
                className={`
                  grid grid-cols-[1fr,auto,1fr] gap-3 items-center rounded-xl px-3 py-2.5
                  transition-all duration-300 group
                  animate-slideUp
                  ${hasError
                    ? 'bg-danger-500/[0.06] border border-danger-500/10'
                    : isMapped
                      ? 'bg-success-500/[0.06] border border-[#E8F8EE]/60 hover:bg-success-500/[0.08]'
                      : 'bg-white/20 border border-transparent hover:bg-white/30 hover:border-on-surface/[0.06]'
                  }
                `}
                style={{ animationDelay: `${index * 40}ms` }}
              >
                {/* Left: canonical field label */}
                <div className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full shrink-0 transition-all duration-300 ${
                    isMapped
                      ? 'bg-success-500 shadow-sm shadow-success-500/30'
                      : field.required
                        ? 'bg-danger-500/60 animate-pulse'
                        : 'bg-outline/40'
                  }`} />
                  <span className={`text-sm transition-colors ${
                    field.required
                      ? 'text-on-surface font-medium'
                      : 'text-on-surface-variant'
                  }`}>
                    {field.label}
                    {field.required && <span className="text-danger-500 ml-0.5 text-xs">*</span>}
                  </span>
                  {field.required && (
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-accent-600/50 bg-accent-600/[0.06] px-1.5 py-0.5 rounded">
                      req
                    </span>
                  )}
                </div>

                {/* Arrow connector */}
                <div className={`flex items-center justify-center w-6 transition-colors duration-300 ${
                  isMapped ? 'text-success-500/60' : 'text-outline/40'
                }`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </div>

                {/* Right: CSV column dropdown + confidence indicator */}
                <div className="flex items-center gap-2">
                  <select
                    value={mapping[field.key] ?? ''}
                    onChange={(e) => updateMapping(field.key, e.target.value)}
                    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-all bg-white/40 appearance-none cursor-pointer ${
                      hasError
                        ? 'border-danger-500/40 text-danger-500'
                        : isMapped
                          ? 'border-success-500/20 text-on-surface'
                          : 'border-white/60 text-on-surface-variant hover:border-on-surface/20'
                    } focus:border-accent-600/40 focus:ring-2 focus:ring-accent-600/10`}
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%234f6a8f' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19.5 8.25l-7.5 7.5-7.5-7.5'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 0.5rem center',
                      backgroundSize: '1.25rem',
                      paddingRight: '2rem',
                    }}
                  >
                    <option value="">-- Select column --</option>
                    {columns.map((col) => (
                      <option
                        key={col}
                        value={col}
                        disabled={usedColumns.has(col) && mapping[field.key] !== col}
                      >
                        {col}{usedColumns.has(col) && mapping[field.key] !== col ? ' (used)' : ''}
                      </option>
                    ))}
                  </select>
                  {/* Confidence indicator for auto-guessed fields */}
                  {(() => {
                    const guess = guessRecord?.[field.key];
                    if (!guess?.column || guess.confidence <= 0) return null;
                    return (
                      <span
                        className={`shrink-0 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          guess.confidence > 0.7
                            ? 'bg-success-bg text-success-500 border border-success-500/15'
                            : guess.confidence > 0.4
                              ? 'bg-warning-500/10 text-warning-500 border border-warning-500/15'
                              : 'bg-white/30 text-on-surface-variant/60 border border-on-surface/[0.06]'
                        }`}
                        title={`Auto-detected with ${Math.round(guess.confidence * 100)}% confidence`}
                      >
                        {guess.confidence > 0.7 ? 'auto' : 'guess'}
                      </span>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Validation errors */}
        {canonicalFields.some((f) => f.required && errors[f.key]) && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-danger-500/20 bg-danger-500/[0.08] px-4 py-3 animate-slideUp">
            <svg className="w-4 h-4 text-danger-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div className="text-xs text-danger-500 space-y-0.5">
              {canonicalFields
                .filter((f) => f.required && errors[f.key])
                .map((f) => (
                  <p key={f.key}>{errors[f.key]}</p>
                ))}
            </div>
          </div>
        )}

        {/* Mapping progress bar */}
        <div className="mt-5 flex items-center gap-3 text-xs text-on-surface-variant/60">
          <span className="tabular-nums font-mono text-[11px]">{mappedCount}/{totalFields}</span>
          <span>mapped</span>
          <div className="flex-1 h-1.5 rounded-full bg-white/30 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                mappedCount === totalFields
                  ? 'bg-gradient-to-r from-success-500/80 to-success-500/60'
                  : 'bg-gradient-to-r from-accent-600/60 to-accent-600/40'
              }`}
              style={{ width: `${(mappedCount / totalFields) * 100}%` }}
            />
          </div>
          {mappedCount === totalFields && (
            <span className="text-success-500 flex items-center gap-1 animate-fadeIn">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Complete
            </span>
          )}
        </div>
      </div>

      {/* ── Submit footer ── */}
      <div className="flex items-center justify-between gap-3 p-6 bg-white/30">
        <p className="text-xs text-outline">
          {columns.length} CSV columns detected
        </p>
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary"
        >
          {isSubmitting && (
            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          Create & Upload
        </button>
      </div>
    </form>
  );
}
