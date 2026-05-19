import type { FieldComparison, RecordDetail } from '../api/types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { CheckIcon, ArrowRightIcon } from 'lucide-react';
import SourcePill from './ui/SourcePill';
import type { Layout } from './fieldComparisonLayout';

function statusPill(comp: FieldComparison, selections: Record<string, number> = {}) {
  if (comp.is_conflict && selections[comp.field] !== undefined) {
    return <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 text-xs">resolved</Badge>;
  }
  if (comp.is_conflict) return <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 text-xs">conflict</Badge>;
  if (comp.is_identical) return <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 text-xs">identical</Badge>;
  if (comp.is_a_only || comp.is_b_only) return <Badge variant="secondary" className="bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 text-xs">source-only</Badge>;
  return null;
}

interface LayoutProps {
  comparisons: FieldComparison[];
  recordA: RecordDetail;
  recordB: RecordDetail;
  selections?: Record<string, number>;
  onSelect?: (field: string, recordId: number) => void;
}

function ChoiceBtn({
  chosen, active, onClick, children,
}: {
  chosen: boolean;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      onClick={onClick}
      size="sm"
      variant={chosen ? 'default' : 'outline'}
      className={`font-mono text-xs ${active && !chosen ? 'opacity-50' : ''}`}
    >
      {children}
    </Button>
  );
}

function SideBySideLayout({ comparisons, recordA, recordB, selections = {}, onSelect }: LayoutProps) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className="w-[180px] text-left text-foreground font-medium">Field</th>
          <th className="border-l-2 border-primary text-primary text-left font-medium">
            <span className="inline-flex items-center gap-1.5">
              {recordA.data_source_name && <SourcePill short={recordA.data_source_name} />}
              {recordA.name || `#${recordA.id}`}
            </span>
          </th>
          <th className="w-10" />
          <th className="border-l-2 border-sky-600 text-sky-600 text-left font-medium">
            <span className="inline-flex items-center gap-1.5">
              {recordB.data_source_name && <SourcePill short={recordB.data_source_name} />}
              {recordB.name || `#${recordB.id}`}
            </span>
          </th>
          <th className="w-[90px] text-left font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        {comparisons.map(f => {
          const isSelected = selections[f.field] !== undefined;
          return (
            <tr key={f.field} className={f.is_conflict && !isSelected ? 'bg-amber-100' : ''}>
              <td className="px-4 py-3 align-top">
                <div className="font-medium">{f.label}</div>
                <div className="font-mono text-xs text-muted-foreground">{f.field}</div>
              </td>
              <td className="border-l-2 border-primary px-4 py-3 align-top">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-sm flex-1" style={{ color: f.value_a ? 'var(--tw-prose-body)' : 'var(--tw-prose-captions)' }}>
                    {f.value_a || '∅'}
                  </span>
                  {f.is_conflict && onSelect && (
                    <ChoiceBtn
                      chosen={selections[f.field] === recordA.id}
                      active={isSelected}
                      onClick={() => onSelect(f.field, recordA.id)}
                    >
                      Use A
                    </ChoiceBtn>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-center align-top text-muted-foreground">
                {f.is_conflict ? (
                  <span className="text-amber-600 text-xs font-semibold">vs</span>
                ) : f.is_identical ? (
                  <CheckIcon className="size-4 mx-auto" />
                ) : (
                  <ArrowRightIcon className="size-4 mx-auto" />
                )}
              </td>
              <td className="border-l-2 border-sky-600 px-4 py-3 align-top">
                <div className="flex items-center gap-1.5">
                  {f.is_conflict && onSelect && (
                    <ChoiceBtn
                      chosen={selections[f.field] === recordB.id}
                      active={isSelected}
                      onClick={() => onSelect(f.field, recordB.id)}
                    >
                      Use B
                    </ChoiceBtn>
                  )}
                  <span className="font-mono text-sm flex-1" style={{ color: f.value_b ? 'var(--tw-prose-body)' : 'var(--tw-prose-captions)' }}>
                    {f.value_b || '∅'}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 align-top">{statusPill(f, selections)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function StackedLayout({ comparisons, recordA, recordB, selections = {}, onSelect }: LayoutProps) {
  return (
    <div className="p-3">
      {comparisons.map(f => {
        const isSelected = selections[f.field] !== undefined;
        return (
          <div key={f.field} className="mb-2.5 p-2.5 bg-background border border-border rounded">
            <div className="flex items-baseline justify-between mb-1.5">
              <div>
                <span className="text-xs font-semibold">{f.label}</span>
                <span className="font-mono text-[10px] text-muted-foreground ml-2">{f.field}</span>
              </div>
              {statusPill(f, selections)}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {([['a', recordA, f.value_a] as const, ['b', recordB, f.value_b] as const]).map(([key, sup, val]) => {
                const chosen = f.is_conflict && selections[f.field] === sup.id;
                return (
                  <div
                    key={key}
                    onClick={() => f.is_conflict && onSelect && onSelect(f.field, sup.id)}
                    className={`p-2.5 border rounded transition-all ${
                      chosen
                        ? 'border-primary border-l-4 bg-primary/10'
                        : `border-l-4 bg-card ${key === 'a' ? 'border-primary' : 'border-sky-600'}`
                    } ${f.is_conflict && onSelect ? 'cursor-pointer' : 'cursor-default'} ${
                      f.is_conflict && isSelected && !chosen ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {sup.data_source_name && <SourcePill short={sup.data_source_name} />}
                      {chosen && (
                        <span className="text-[10px] text-primary font-semibold">✓ chosen</span>
                      )}
                    </div>
                    <div className="font-mono text-xs" style={{ color: val ? 'var(--tw-prose-body)' : 'var(--tw-prose-captions)' }}>
                      {val || '∅'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DiffLayout({ comparisons, recordA, recordB, selections = {}, onSelect }: LayoutProps) {
  return (
    <div>
      {comparisons.map((f, i) => {
        const isSelected = selections[f.field] !== undefined;
        return (
          <div key={f.field} className={`${i < comparisons.length - 1 ? 'border-b border-border' : ''} px-3.5 py-2.5`}>
            <div className="flex items-baseline justify-between mb-1.5">
              <div>
                <span className="text-xs font-medium">{f.label}</span>
                <span className="font-mono text-[10px] text-muted-foreground ml-2">{f.field}</span>
              </div>
              {statusPill(f, selections)}
            </div>
            <div className="font-mono text-xs bg-background border border-border rounded overflow-hidden">
              {([['a', recordA, f.value_a, f.is_conflict ? '−' : ' ', f.is_conflict ? 'text-destructive' : 'text-border', f.is_conflict ? 'bg-destructive/10' : 'transparent'] as const,
                 ['b', recordB, f.value_b, f.is_conflict ? '+' : ' ', f.is_conflict ? 'text-emerald-600' : 'text-border', f.is_conflict ? 'bg-emerald-100' : 'transparent'] as const]).map(([key, sup, val, symbol, borderClass, bgClass]) => {
                const chosen = f.is_conflict && selections[f.field] === sup.id;
                return (
                  <div
                    key={key}
                    onClick={() => f.is_conflict && onSelect && onSelect(f.field, sup.id)}
                    className={`px-2.5 py-1.5 flex items-center gap-2 border-l-4 transition-all ${
                      chosen ? 'border-primary bg-primary/10' : `${bgClass} border-l-[${borderClass}]`
                    } ${f.is_conflict && onSelect ? 'cursor-pointer' : 'cursor-default'} ${
                      f.is_conflict && isSelected && !chosen ? 'opacity-50' : ''
                    }`}
                  >
                    <span className="w-5 font-semibold" style={{ color: chosen ? 'var(--tw-prose-headings)' : (borderClass === 'text-destructive' ? '#ef4444' : borderClass === 'text-emerald-600' ? '#16a34a' : 'var(--tw-prose-captions)') }}>
                      {symbol}
                    </span>
                    {sup.data_source_name && <SourcePill short={sup.data_source_name} />}
                    <span className="flex-1 text-foreground">{val || '∅'}</span>
                    {chosen && (
                      <span className="text-[10px] text-primary font-semibold">✓</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface FieldComparisonPanelProps {
  comparisons: FieldComparison[];
  recordA: RecordDetail;
  recordB: RecordDetail;
  layout: Layout;
  onLayoutChange: (l: Layout) => void;
  conflictCount: number;
  resolvedCount?: number;
  selections?: Record<string, number>;
  onSelect?: (field: string, recordId: number) => void;
}

export default function FieldComparisonPanel({
  comparisons, recordA, recordB, layout, onLayoutChange,
  conflictCount, resolvedCount, selections, onSelect,
}: FieldComparisonPanelProps) {
  const allResolved = conflictCount === 0 || (resolvedCount ?? 0) === conflictCount;
  return (
    <Card className="mb-3">
      <CardHeader>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle>Field comparison</CardTitle>
            <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-amber-600 rounded-sm" />
                conflict
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-emerald-600 rounded-sm" />
                identical
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-sky-600 rounded-sm" />
                source-only
              </span>
            </div>
            {onSelect == null && conflictCount > 0 && (
              <span className="text-xs text-muted-foreground">
                conflicts resolved in <span className="text-primary font-semibold">Merge step</span>
              </span>
            )}
            {onSelect != null && conflictCount > 0 && resolvedCount !== undefined && (
              <span className={`px-2 py-0.5 rounded text-xs font-semibold tabular-nums ${
                allResolved
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
              }`}>
                {resolvedCount}/{conflictCount} conflicts resolved
              </span>
            )}
          </div>
          <div className="flex gap-1 border border-border rounded-md p-1 w-fit">
            <Button
              variant={layout === 'sideBySide' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onLayoutChange('sideBySide')}
              className="text-xs"
            >
              Side
            </Button>
            <Button
              variant={layout === 'stacked' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onLayoutChange('stacked')}
              className="text-xs"
            >
              Stacked
            </Button>
            <Button
              variant={layout === 'diff' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onLayoutChange('diff')}
              className="text-xs"
            >
              Diff
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {layout === 'sideBySide' && <SideBySideLayout comparisons={comparisons} recordA={recordA} recordB={recordB} selections={selections} onSelect={onSelect} />}
        {layout === 'stacked' && <StackedLayout comparisons={comparisons} recordA={recordA} recordB={recordB} selections={selections} onSelect={onSelect} />}
        {layout === 'diff' && <DiffLayout comparisons={comparisons} recordA={recordA} recordB={recordB} selections={selections} onSelect={onSelect} />}
      </CardContent>
    </Card>
  );
}
