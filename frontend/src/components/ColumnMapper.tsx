// ── ColumnMapper — terminal aesthetic, record-type-driven ──

import { useState, useEffect, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangleIcon, ArrowRightIcon, AsteriskIcon, TagIcon, XCircleIcon } from 'lucide-react';
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
import { Card, CardHeader, CardTitle, CardAction, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import Hbar from './ui/Hbar';
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

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
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
      <Card>
        <CardContent className="p-7 text-center text-xs text-muted-foreground">
          Loading field definitions…
        </CardContent>
      </Card>
    );
  }
  if (error || !recordType) {
    return (
      <Card>
        <CardContent className="p-7 text-center">
          <XCircleIcon className="mx-auto size-7 text-destructive" />
          <div className="mt-2 text-xs text-destructive">
            Failed to load record type fields. Refresh and try again.
          </div>
        </CardContent>
      </Card>
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
      <Card className="mb-3">
        <CardHeader className="border-b">
          <CardTitle>Source identity</CardTitle>
          {detectedDelimiter && (
            <CardAction>
              <span className="font-mono text-[11px] text-muted-foreground">
                detected delimiter: &quot;{detectedDelimiter}&quot;
              </span>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-2.5 pt-3">
          {recordTypes && recordTypes.types.length > 1 && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="record-type-select">
                Type <span className="text-destructive">*</span>
              </Label>
              <Select value={type} onValueChange={onTypeChange}>
                <SelectTrigger id="record-type-select" className="w-full">
                  <SelectValue placeholder="Select type…" />
                </SelectTrigger>
                <SelectContent>
                  {recordTypes.types.map(rt => (
                    <SelectItem key={rt.key} value={rt.key}>{rt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="source-name">
              Source name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="source-name"
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
              aria-invalid={!!errors.sourceName}
            />
            {errors.sourceName && (
              <span className="text-[11px] text-destructive">{errors.sourceName}</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="source-description">Description</Label>
            <Input
              id="source-description"
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>
        </CardContent>
      </Card>

      {/* Column mapping panel */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Column mapping</CardTitle>
          <CardAction>
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className={
                  requiredMapped === requiredTotal
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                }
              >
                {requiredMapped}/{requiredTotal} required
              </Badge>
              {(recordTypeKey ?? type) && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onSuggestClick}
                    disabled={suggestMutation.isPending}
                  >
                    {suggestMutation.isPending
                      ? <><Spinner size={10} />&nbsp;Suggesting…</>
                      : <>✨&nbsp;Suggest with AI</>
                    }
                  </Button>
                  {suggestMutation.isError && (
                    <span className="text-[11px] text-destructive">
                      {(suggestMutation.error as ApiError | Error).message}
                    </span>
                  )}
                </>
              )}
            </div>
          </CardAction>
        </CardHeader>

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
                    {field.required ? (
                      <AsteriskIcon className="size-3.5 text-destructive" />
                    ) : (
                      <TagIcon className="size-3.5 text-muted-foreground" />
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 500 }}>{field.label}</span>
                      {field.required && (
                        <span className="text-destructive text-[10px]">required</span>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {field.key}
                    </div>
                  </td>
                  <td>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {field.role}
                    </span>
                  </td>
                  <td>
                    <Select
                      value={value}
                      onValueChange={(v) => updateMapping(field.key, v === '__clear__' ? '' : v)}
                    >
                      <SelectTrigger
                        className={`w-full font-mono text-[11px] h-6 py-0 px-2${errors[field.key] ? ' border-destructive' : ''}`}
                        aria-invalid={!!errors[field.key]}
                        aria-label={`Map ${field.label}`}
                      >
                        <SelectValue placeholder="— select column —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__clear__">— select column —</SelectItem>
                        {uniqueColumns.map(col => (
                          <SelectItem
                            key={col}
                            value={col}
                            disabled={usedColumns.has(col) && value !== col}
                          >
                            {col}
                            {usedColumns.has(col) && value !== col ? ' (used)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="num">
                    {isMapped ? (
                      autoMapped.has(field.key) ? (
                        <span className="font-mono text-[10px] text-primary">auto</span>
                      ) : (
                        <span className="font-mono text-[10px] text-muted-foreground">manual</span>
                      )
                    ) : (
                      <span className="font-mono text-[10px] text-muted-foreground/70">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Identity column picker */}
        <div className="mx-3.5 mb-2.5 rounded-md border border-border bg-card p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-medium">
                Identity column
                <span className="ml-1 text-destructive">*</span>
              </div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                Used to recognize the same row across re-uploads
              </div>
            </div>
            <Select
              value={identityFieldKey}
              onValueChange={(v) => {
                setIdentityFieldKey(v === '__none__' ? '' : v);
                if (errors.identityFieldKey) {
                  setErrors((prev) => {
                    const n = { ...prev };
                    delete n.identityFieldKey;
                    return n;
                  });
                }
              }}
              disabled={Object.keys(mapping).filter((k) => mapping[k]).length === 0}
            >
              <SelectTrigger
                className={`min-w-[220px] font-mono text-[11px] h-6 py-0 px-2${errors.identityFieldKey ? ' border-destructive' : ''}`}
                aria-invalid={!!errors.identityFieldKey}
                aria-label="Identity column"
              >
                <SelectValue placeholder="— pick the column that uniquely identifies a row —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— pick the column that uniquely identifies a row —</SelectItem>
                {Object.keys(mapping)
                  .filter((k) => mapping[k])
                  .map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {errors.identityFieldKey && (
            <div className="mt-1.5 text-[11px] text-destructive">
              {errors.identityFieldKey}
            </div>
          )}
        </div>

        {/* Footer */}
        <CardFooter className="gap-3">
          <span className="font-mono tabular-nums text-[11px] text-muted-foreground">
            {mappedCount}/{totalFields}
          </span>
          <Hbar
            value={progress}
            fillClassName={mappedCount === totalFields ? 'bg-emerald-500' : 'bg-primary'}
            className="flex-1 h-1"
          />
          <span className="font-mono text-[11px] text-muted-foreground">
            {columns.length} CSV columns
          </span>
          <Button
            type="submit"
            disabled={isSubmitting}
            size="sm"
          >
            {isSubmitting && <Spinner size={10} />}
            Create &amp; upload
            <ArrowRightIcon className="size-3" />
          </Button>
        </CardFooter>

        {/* Validation summary */}
        {Object.keys(errors).filter(k => k !== 'sourceName').length > 0 && (
          <Badge
            variant="destructive"
            className="mx-3.5 mb-2.5 h-auto w-[calc(100%-28px)] justify-start gap-1.5 rounded-md px-2.5 py-1.5 text-xs"
          >
            <AlertTriangleIcon className="size-3" />
            {Object.values(errors).filter((_, i, arr) => arr.indexOf(arr[i]) === i).join(' · ')}
          </Badge>
        )}
      </Card>
    </form>
  );
}
