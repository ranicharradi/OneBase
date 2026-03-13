// ── Visual column mapper for new data sources — dark industrial theme ──

import { useState } from 'react';
import type { ColumnMapping, DataSourceCreate } from '../api/types';

interface ColumnMapperProps {
  columns: string[];
  onSubmit: (sourceData: DataSourceCreate) => void;
  isSubmitting?: boolean;
}

const CANONICAL_FIELDS: { key: keyof ColumnMapping; label: string; required: boolean }[] = [
  { key: 'supplier_name', label: 'Supplier Name', required: true },
  { key: 'supplier_code', label: 'Supplier Code', required: true },
  { key: 'short_name', label: 'Short Name', required: false },
  { key: 'currency', label: 'Currency', required: false },
  { key: 'payment_terms', label: 'Payment Terms', required: false },
  { key: 'contact_name', label: 'Contact Name', required: false },
  { key: 'supplier_type', label: 'Supplier Type', required: false },
];

export default function ColumnMapper({ columns, onSubmit, isSubmitting = false }: ColumnMapperProps) {
  const [sourceName, setSourceName] = useState('');
  const [description, setDescription] = useState('');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

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
    if (!mapping.supplier_name) newErrors.supplier_name = 'Supplier Name mapping is required';
    if (!mapping.supplier_code) newErrors.supplier_code = 'Supplier Code mapping is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const columnMapping: ColumnMapping = {
      supplier_name: mapping.supplier_name,
      supplier_code: mapping.supplier_code,
      ...(mapping.short_name && { short_name: mapping.short_name }),
      ...(mapping.currency && { currency: mapping.currency }),
      ...(mapping.payment_terms && { payment_terms: mapping.payment_terms }),
      ...(mapping.contact_name && { contact_name: mapping.contact_name }),
      ...(mapping.supplier_type && { supplier_type: mapping.supplier_type }),
    };

    onSubmit({
      name: sourceName.trim(),
      description: description.trim() || undefined,
      column_mapping: columnMapping,
    });
  };

  // Track which CSV columns are already used
  const usedColumns = new Set(Object.values(mapping));

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-white/[0.06] bg-surface-900/60 overflow-hidden">
      {/* Step 1: Name your source */}
      <div className="p-6 border-b border-white/[0.06]">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-accent-500/10 border border-accent-500/20 text-xs font-bold text-accent-400">
            1
          </div>
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Name your source</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-surface-500 uppercase tracking-wider">
              Source Name <span className="text-danger-400">*</span>
            </label>
            <input
              type="text"
              value={sourceName}
              onChange={(e) => {
                setSourceName(e.target.value);
                if (errors.sourceName) setErrors((prev) => { const n = { ...prev }; delete n.sourceName; return n; });
              }}
              placeholder="e.g. SAP Vendor Export"
              className={`w-full rounded-lg border px-4 py-2.5 text-sm text-white placeholder-surface-600 outline-none transition-all bg-surface-800/50 ${
                errors.sourceName
                  ? 'border-danger-500/40 focus:border-danger-400 focus:ring-2 focus:ring-danger-500/10'
                  : 'border-white/[0.08] focus:border-accent-500/40 focus:ring-2 focus:ring-accent-500/10'
              }`}
            />
            {errors.sourceName && (
              <p className="mt-1.5 text-xs text-danger-400">{errors.sourceName}</p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-surface-500 uppercase tracking-wider">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full rounded-lg border border-white/[0.08] bg-surface-800/50 px-4 py-2.5 text-sm text-white placeholder-surface-600 outline-none transition-all focus:border-accent-500/40 focus:ring-2 focus:ring-accent-500/10"
            />
          </div>
        </div>
      </div>

      {/* Step 2: Map columns */}
      <div className="p-6 border-b border-white/[0.06]">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-accent-500/10 border border-accent-500/20 text-xs font-bold text-accent-400">
            2
          </div>
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Map columns</h3>
        </div>

        <p className="text-xs text-surface-500 mb-5">
          Map each canonical field to a column from your CSV file. Required fields are marked with <span className="text-danger-400">*</span>
        </p>

        {/* Column headers */}
        <div className="grid grid-cols-2 gap-4 mb-3 px-1">
          <p className="text-xs font-semibold text-surface-500 uppercase tracking-widest">Canonical Field</p>
          <p className="text-xs font-semibold text-surface-500 uppercase tracking-widest">CSV Column</p>
        </div>

        {/* Mapping rows */}
        <div className="space-y-2.5">
          {CANONICAL_FIELDS.map((field) => (
            <div key={field.key} className={`grid grid-cols-2 gap-4 items-center rounded-lg px-1 py-1 ${
              errors[field.key] ? 'bg-danger-500/[0.03]' : ''
            }`}>
              {/* Left: canonical field label */}
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  mapping[field.key]
                    ? 'bg-success-400'
                    : field.required
                      ? 'bg-danger-400/60'
                      : 'bg-surface-600'
                }`} />
                <span className={`text-sm ${field.required ? 'text-gray-200 font-medium' : 'text-surface-500'}`}>
                  {field.label}
                  {field.required && <span className="text-danger-400 ml-1">*</span>}
                </span>
              </div>

              {/* Right: CSV column dropdown */}
              <select
                value={mapping[field.key] ?? ''}
                onChange={(e) => updateMapping(field.key, e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-all bg-surface-800/50 appearance-none cursor-pointer ${
                  errors[field.key]
                    ? 'border-danger-500/40 text-danger-300'
                    : mapping[field.key]
                      ? 'border-success-500/20 text-white'
                      : 'border-white/[0.08] text-surface-500'
                } focus:border-accent-500/40 focus:ring-2 focus:ring-accent-500/10`}
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%233d4f6a' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19.5 8.25l-7.5 7.5-7.5-7.5'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.5rem center',
                  backgroundSize: '1.25rem',
                  paddingRight: '2rem',
                }}
              >
                <option value="">— Select column —</option>
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
            </div>
          ))}
        </div>

        {/* Validation errors */}
        {(errors.supplier_name || errors.supplier_code) && (
          <div className="mt-4 rounded-lg border border-danger-500/20 bg-danger-500/[0.06] px-4 py-2.5 text-xs text-danger-400">
            {errors.supplier_name && <p>{errors.supplier_name}</p>}
            {errors.supplier_code && <p>{errors.supplier_code}</p>}
          </div>
        )}

        {/* Mapping progress */}
        <div className="mt-4 flex items-center gap-2 text-xs text-surface-500">
          <span className="tabular-nums">{Object.keys(mapping).length} / {CANONICAL_FIELDS.length}</span>
          <span>columns mapped</span>
          <div className="flex-1 h-1 rounded-full bg-surface-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-accent-500/60 transition-all duration-300"
              style={{ width: `${(Object.keys(mapping).length / CANONICAL_FIELDS.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="flex items-center justify-end gap-3 p-6">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-2 rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent-500/20 transition-all hover:bg-accent-600 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
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
