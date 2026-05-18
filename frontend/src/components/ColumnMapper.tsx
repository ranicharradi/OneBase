// ── ColumnMapper — terminal aesthetic, record-type-driven ──

import { useState, useEffect, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import type {
  ColumnMapping,
  DataSourceCreate,
  FieldDef,
  RecordTypeListResponse,
  SuggestMappingRequest,
  SuggestMappingResponse,
} from '../api/types';
import { api, ApiError } from '../api/client';
import { useRecordType } from '../hooks/useRecordTypes';
import Panel, { PanelHead } from './ui/Panel';
import Hbar from './ui/Hbar';
import Pill from './ui/Pill';
import Spinner from './ui/Spinner';

function autoMap(cols: string[], fieldList: FieldDef[]): Record<string, string> {
  const result: Record<string, string> = {};
  const used = new Set<string>();
  for (const field of fieldList) {
    for (const syn of field.synonyms ?? []) {
      const match = cols.find(c => c.trim().toLowerCase() === syn.toLowerCase());
      if (match && !used.has(match)) {
        result[field.key] = match;
        used.add(match);
        break;
      }
    }
  }
  return result;
}

interface ColumnMapperProps {
  columns: string[];
  type: string;
  onTypeChange?: (type: string) => void;
  recordTypes?: RecordTypeListResponse;
  onSubmit: (sourceData: DataSourceCreate) => void;
  isSubmitting?: boolean;
  initialSourceName?: string;
  detectedDelimiter?: string;
  recordTypeKey?: string;
  sampleRows?: Record<string, unknown>[];
}

export default function ColumnMapper({
  columns,
  type,
  onTypeChange,
  recordTypes,
  onSubmit,
  isSubmitting = false,
  initialSourceName,
  detectedDelimiter,
  recordTypeKey,
  sampleRows,
}: ColumnMapperProps) {
  const { data: recordType, isLoading, error } = useRecordType(type);
  const fields: FieldDef[] = useMemo(() => recordType?.fields ?? [], [recordType]);

  const [sourceName, setSourceName] = useState(initialSourceName ?? '');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [autoMapped, setAutoMapped] = useState<Set<string>>(new Set());
  const [identityFieldKey, setIdentityFieldKey] = useState<string>('');

  // Seed user-untouched fields with autoMap suggestions whenever the source
  // columns or record-type fields change. Synchronously calling setState
  // here is intentional — this is a one-shot merge from props, not a render
  // cascade, and re-runs are gated by the stable deps above.
  useEffect(() => {
    if (fields.length === 0 || columns.length === 0) return;
    const auto = autoMap(columns, fields);
    /* eslint-disable react-hooks/set-state-in-effect */
    setMapping((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(auto)) {
        if (next[k] === undefined) next[k] = v;
      }
      return next;
    });
    setAutoMapped((prev) => {
      const next = new Set(prev);
      for (const k of Object.keys(auto)) next.add(k);
      return next;
    });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [fields, columns]);

  // Auto-select the identity field to the first mapped 'code'-role field (unique identifiers like BIC, IBAN).
  useEffect(() => {
    if (identityFieldKey || fields.length === 0) return;
    const codeField = fields.find(f => f.role === 'code' && mapping[f.key]);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (codeField) setIdentityFieldKey(codeField.key);
  }, [identityFieldKey, fields, mapping]);

  const updateMapping = (field: string, csvColumn: string) => {
    setAutoMapped(prev => { const s = new Set(prev); s.delete(field); return s; });
    setMapping(prev => {
      const next = { ...prev };
      if (csvColumn) next[field] = csvColumn;
      else delete next[field];
      return next;
    });
    // If the identity field is being un-mapped, reset the selection
    if (!csvColumn && field === identityFieldKey) {
      setIdentityFieldKey('');
    }
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const suggestMutation = useMutation({
    mutationFn: (req: SuggestMappingRequest) =>
      api.post<SuggestMappingResponse>('/api/sources/suggest-mapping', req),
    onSuccess: (data) => {
      const nonNull = Object.fromEntries(
        Object.entries(data.suggestions).filter((entry): entry is [string, string] => entry[1] !== null),
      );
      setMapping((prev) => ({ ...prev, ...nonNull }));
    },
  });

  const onSuggestClick = () => {
    suggestMutation.mutate({ record_type: recordTypeKey ?? type, headers: columns, sample_rows: sampleRows ?? [] });
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!sourceName.trim()) newErrors.sourceName = 'Source name is required';
    for (const f of fields) {
      if (f.required && !mapping[f.key]) {
        newErrors[f.key] = `${f.label} mapping is required`;
      }
    }
    if (!identityFieldKey) newErrors.identityFieldKey = 'Pick an identity column';
    else if (!mapping[identityFieldKey]) newErrors.identityFieldKey = 'Identity column must be mapped';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const columnMapping: Partial<Record<string, string>> = {};
    for (const f of fields) {
      if (mapping[f.key]) columnMapping[f.key] = mapping[f.key];
    }

    onSubmit({
      name: sourceName.trim(),
      type,
      description: description.trim() || undefined,
      delimiter: detectedDelimiter || ',',
      column_mapping: columnMapping as unknown as ColumnMapping,
      identity_field_key: identityFieldKey,
    });
  };

  if (isLoading) {
    return (
      <Panel>
        <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: 'var(--fg-2)' }}>
          Loading field definitions…
        </div>
      </Panel>
    );
  }
  if (error || !recordType) {
    return (
      <Panel>
        <div style={{ padding: 28, textAlign: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--danger)' }}>error</span>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>
            Failed to load record type fields. Refresh and try again.
          </div>
        </div>
      </Panel>
    );
  }

  const usedColumns = new Set(Object.values(mapping));
  const uniqueColumns = [...new Set(columns)];
  const mappedCount = Object.keys(mapping).length;
  const totalFields = fields.length;
  const requiredMapped = fields.filter(f => f.required && mapping[f.key]).length;
  const requiredTotal = fields.filter(f => f.required).length;

  const progress = totalFields > 0 ? (mappedCount / totalFields) * 100 : 0;

  return (
    <form onSubmit={handleSubmit}>
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
          {recordTypes && recordTypes.types.length > 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="label">
                Type <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <select
                className="input"
                value={type}
                onChange={e => onTypeChange?.(e.target.value)}
                required
              >
                {recordTypes.types.map(rt => (
                  <option key={rt.key} value={rt.key}>{rt.label}</option>
                ))}
              </select>
            </div>
          )}
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
            <Pill tone={requiredMapped === requiredTotal ? 'ok' : 'warn'}>
              {requiredMapped}/{requiredTotal} required
            </Pill>
            {(recordTypeKey ?? type) && (
              <>
                <button
                  type="button"
                  onClick={onSuggestClick}
                  disabled={suggestMutation.isPending}
                  className="btn btn-sm btn-ghost"
                >
                  {suggestMutation.isPending
                    ? <><Spinner size={10} />&nbsp;Suggesting…</>
                    : <><span className="material-symbols-outlined" style={{ fontSize: 12 }}>auto_awesome</span>&nbsp;Suggest with AI</>
                  }
                </button>
                {suggestMutation.isError && (
                  <span style={{ fontSize: 11, color: 'var(--err, var(--danger))' }}>
                    {(suggestMutation.error as ApiError | Error).message}
                  </span>
                )}
              </>
            )}
          </div>
        </PanelHead>

        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 36 }} />
              <th style={{ width: 220 }}>Record field</th>
              <th style={{ width: 80 }}>Role</th>
              <th>Source column</th>
              <th style={{ width: 100 }} className="num">Status</th>
            </tr>
          </thead>
          <tbody>
            {fields.map(field => {
              const value = mapping[field.key] ?? '';
              const isMapped = !!value;
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
                      {field.role}
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
                      {uniqueColumns.map(col => (
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
                  </td>
                  <td className="num">
                    {isMapped ? (
                      autoMapped.has(field.key) ? (
                        <span className="mono" style={{ fontSize: 10, color: 'var(--accent)' }}>auto</span>
                      ) : (
                        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-2)' }}>manual</span>
                      )
                    ) : (
                      <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Identity column picker */}
        <div
          style={{
            margin: '0 14px 10px',
            padding: '10px 12px',
            background: 'var(--bg-1)',
            border: '1px solid var(--border-0)',
            borderRadius: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>
                Identity column
                <span style={{ color: 'var(--danger)', marginLeft: 4 }}>*</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--fg-2)', marginTop: 2 }}>
                Used to recognize the same row across re-uploads
              </div>
            </div>
            <select
              value={identityFieldKey}
              onChange={(e) => {
                setIdentityFieldKey(e.target.value);
                if (errors.identityFieldKey) {
                  setErrors((prev) => {
                    const n = { ...prev };
                    delete n.identityFieldKey;
                    return n;
                  });
                }
              }}
              className="input mono"
              style={{
                height: 24,
                fontSize: 11,
                padding: '0 8px',
                minWidth: 220,
                borderColor: errors.identityFieldKey ? 'var(--danger)' : undefined,
              }}
              disabled={Object.keys(mapping).filter((k) => mapping[k]).length === 0}
            >
              <option value="">— pick the column that uniquely identifies a row —</option>
              {Object.keys(mapping)
                .filter((k) => mapping[k])
                .map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
            </select>
          </div>
          {errors.identityFieldKey && (
            <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 6 }}>
              {errors.identityFieldKey}
            </div>
          )}
        </div>

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
            value={progress}
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
