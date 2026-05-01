// ── ColumnMapper — terminal aesthetic, canonical-field-driven ──

import { useState } from 'react';
import type {
  CanonicalField,
  ColumnMapping,
  DataSourceCreate,
  GuessMappingResponse,
} from '../api/types';
import { useCanonicalFields } from '../hooks/useCanonicalFields';
import Panel, { PanelHead } from './ui/Panel';
import Hbar from './ui/Hbar';
import Pill from './ui/Pill';
import Spinner from './ui/Spinner';

interface ColumnMapperProps {
  columns: string[];
  onSubmit: (sourceData: DataSourceCreate) => void;
  isSubmitting?: boolean;
  initialSourceName?: string;
  guessedMapping?: GuessMappingResponse;
  detectedDelimiter?: string;
}

function previewFor(col: string): string {
  // Simple heuristic preview — empty by default
  return col || '—';
}

export default function ColumnMapper({
  columns,
  onSubmit,
  isSubmitting = false,
  initialSourceName,
  guessedMapping,
  detectedDelimiter,
}: ColumnMapperProps) {
  const { data: registry, isLoading: registryLoading, error: registryError } = useCanonicalFields();
  const canonicalFields: CanonicalField[] = registry?.fields ?? [];

  const [sourceName, setSourceName] = useState(initialSourceName ?? '');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const initialMapping: Record<string, string> = {};
  if (guessedMapping) {
    for (const [field, guess] of Object.entries(guessedMapping.guesses)) {
      if (guess?.column) initialMapping[field] = guess.column;
    }
  }
  const [mapping, setMapping] = useState<Record<string, string>>(initialMapping);

  const updateMapping = (field: string, csvColumn: string) => {
    setMapping(prev => {
      const next = { ...prev };
      if (csvColumn) next[field] = csvColumn;
      else delete next[field];
      return next;
    });
    if (errors[field]) {
      setErrors(prev => {
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
      if (f.required && !mapping[f.key]) {
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
      if (mapping[f.key]) columnMapping[f.key] = mapping[f.key];
    }

    onSubmit({
      name: sourceName.trim(),
      description: description.trim() || undefined,
      delimiter: detectedDelimiter || ',',
      column_mapping: columnMapping as unknown as ColumnMapping,
    });
  };

  if (registryLoading) {
    return (
      <Panel>
        <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: 'var(--fg-2)' }}>
          Loading field definitions…
        </div>
      </Panel>
    );
  }
  if (registryError || !registry) {
    return (
      <Panel>
        <div style={{ padding: 28, textAlign: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--danger)' }}>error</span>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>
            Failed to load canonical fields. Refresh and try again.
          </div>
        </div>
      </Panel>
    );
  }

  const usedColumns = new Set(Object.values(mapping));
  const mappedCount = Object.keys(mapping).length;
  const totalFields = canonicalFields.length;
  const requiredMapped = canonicalFields.filter(f => f.required && mapping[f.key]).length;
  const requiredTotal = canonicalFields.filter(f => f.required).length;
  const autoMapped = canonicalFields.filter(f => {
    const g = guessedMapping?.guesses[f.key];
    return g?.column && g.confidence > 0.4 && mapping[f.key] === g.column;
  }).length;

  const step1Done = sourceName.trim().length > 0;
  const step2Done = step1Done && requiredMapped === requiredTotal;

  return (
    <form onSubmit={handleSubmit}>
      {/* Step indicator */}
      <div
        className="panel fade"
        style={{
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 12,
        }}
      >
        {[
          {
            n: 1,
            label: 'Identify',
            sub: 'Name the source',
            active: !step1Done,
            done: step1Done,
          },
          {
            n: 2,
            label: 'Map',
            sub: `${requiredMapped}/${requiredTotal} required mapped`,
            active: step1Done && !step2Done,
            done: step2Done,
          },
        ].map((s, i, arr) => (
          <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: i < arr.length - 1 ? '1 1 0' : '0 0 auto' }}>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 4,
                background: s.done ? 'var(--ok)' : s.active ? 'var(--accent)' : 'var(--bg-2)',
                color: s.done || s.active ? '#fff' : 'var(--fg-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 600,
                fontFamily: 'IBM Plex Mono, monospace',
                flexShrink: 0,
              }}
            >
              {s.done ? <span className="material-symbols-outlined" style={{ fontSize: 12 }}>check</span> : s.n}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
              <span style={{ fontSize: 12, fontWeight: s.active ? 600 : 500, color: s.active ? 'var(--fg-0)' : s.done ? 'var(--fg-1)' : 'var(--fg-2)' }}>
                {s.label}
              </span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--fg-2)', marginTop: 2 }}>
                {s.sub}
              </span>
            </div>
            {i < arr.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 1,
                  background: s.done ? 'var(--ok)' : 'var(--border-0)',
                  transition: 'background 0.3s ease',
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Source identity panel */}
      <Panel className="fade" style={{ marginBottom: 12 }}>
        <PanelHead>
          <span className="panel-title">Source identity</span>
          {detectedDelimiter && (
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>
              detected delimiter: "{detectedDelimiter}"
            </span>
          )}
        </PanelHead>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="label">
              Source name <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="text"
              value={sourceName}
              onChange={e => {
                setSourceName(e.target.value);
                if (errors.sourceName) {
                  setErrors(prev => {
                    const n = { ...prev };
                    delete n.sourceName;
                    return n;
                  });
                }
              }}
              placeholder="e.g. SAP Vendor Export"
              className="input"
              style={{
                borderColor: errors.sourceName ? 'var(--danger)' : undefined,
                boxShadow: errors.sourceName ? '0 0 0 3px var(--danger-soft)' : undefined,
              }}
            />
            {errors.sourceName && (
              <span style={{ fontSize: 11, color: 'var(--danger)' }}>{errors.sourceName}</span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="label">Description</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description"
              className="input"
            />
          </div>
        </div>
      </Panel>

      {/* Column mapping panel */}
      <Panel className="fade">
        <PanelHead>
          <span className="panel-title">Column mapping</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {autoMapped > 0 && (
              <Pill tone="accent" icon="auto_awesome">
                {autoMapped}/{totalFields} auto-mapped
              </Pill>
            )}
            <Pill tone={requiredMapped === requiredTotal ? 'ok' : 'warn'}>
              {requiredMapped}/{requiredTotal} required
            </Pill>
          </div>
        </PanelHead>

        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 36 }} />
              <th style={{ width: 220 }}>Canonical field</th>
              <th style={{ width: 60 }}>Type</th>
              <th>Source column</th>
              <th style={{ width: 140 }} className="num">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {canonicalFields.map(field => {
              const value = mapping[field.key] ?? '';
              const guess = guessedMapping?.guesses[field.key];
              const conf = guess?.confidence ?? 0;
              const isMapped = !!value;
              const tone = conf >= 0.9 ? 'ok' : conf >= 0.75 ? 'warn' : conf > 0 ? 'danger' : null;
              return (
                <tr key={field.key} style={{ cursor: 'default' }}>
                  <td>
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: 14,
                        color: field.required ? 'var(--danger)' : 'var(--fg-2)',
                      }}
                    >
                      {field.required ? 'label_important' : 'label'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 500 }}>{field.label}</span>
                      {field.required && (
                        <span style={{ color: 'var(--danger)', fontSize: 10 }}>required</span>
                      )}
                    </div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--fg-2)' }}>
                      {field.key}
                    </div>
                  </td>
                  <td>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--fg-2)' }}>
                      str
                    </span>
                  </td>
                  <td>
                    <select
                      value={value}
                      onChange={e => updateMapping(field.key, e.target.value)}
                      className="input mono"
                      style={{
                        height: 24,
                        fontSize: 11,
                        padding: '0 8px',
                        borderColor: errors[field.key] ? 'var(--danger)' : undefined,
                        width: '100%',
                      }}
                    >
                      <option value="">— select column —</option>
                      {columns.map(col => (
                        <option
                          key={col}
                          value={col}
                          disabled={usedColumns.has(col) && value !== col}
                        >
                          {col}
                          {usedColumns.has(col) && value !== col ? ' (used)' : ''}
                        </option>
                      ))}
                    </select>
                    {value && (
                      <div className="mono" style={{ fontSize: 10, color: 'var(--fg-2)', marginTop: 2 }}>
                        preview: {previewFor(value)}
                      </div>
                    )}
                  </td>
                  <td className="num">
                    {tone && conf > 0 ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                        <Hbar value={conf * 100} tone={tone} width={70} height={4} />
                        <span
                          className="mono tnum"
                          style={{ width: 32, color: `var(--${tone})`, fontWeight: 600 }}
                        >
                          {conf.toFixed(2)}
                        </span>
                      </span>
                    ) : isMapped ? (
                      <span className="mono" style={{ fontSize: 10, color: 'var(--fg-2)' }}>manual</span>
                    ) : (
                      <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Footer */}
        <div
          style={{
            padding: '10px 14px',
            borderTop: '1px solid var(--border-0)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span className="mono tnum" style={{ fontSize: 11, color: 'var(--fg-2)' }}>
            {mappedCount}/{totalFields}
          </span>
          <Hbar
            value={(mappedCount / totalFields) * 100}
            tone={mappedCount === totalFields ? 'ok' : 'accent'}
            style={{ flex: 1, height: 4 }}
          />
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>
            {columns.length} CSV columns
          </span>
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn btn-sm btn-accent"
          >
            {isSubmitting && <Spinner size={10} color="#fff" />}
            Create & upload
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>arrow_forward</span>
          </button>
        </div>

        {/* Validation summary */}
        {Object.keys(errors).filter(k => k !== 'sourceName').length > 0 && (
          <div
            className="pill danger"
            style={{
              margin: '0 14px 10px',
              padding: '6px 10px',
              width: 'calc(100% - 28px)',
              justifyContent: 'flex-start',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>warning</span>
            {Object.values(errors).filter((_, i, arr) => arr.indexOf(arr[i]) === i).join(' · ')}
          </div>
        )}
      </Panel>
    </form>
  );
}
