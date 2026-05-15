import type { FieldComparison, RecordDetail } from '../api/types';
import Panel, { PanelHead } from './ui/Panel';
import SourcePill from './ui/SourcePill';
import type { Layout } from './fieldComparisonLayout';

function statusPill(comp: FieldComparison) {
  if (comp.is_conflict) return <span className="pill warn" style={{ padding: '1px 6px', fontSize: 10 }}>conflict</span>;
  if (comp.is_identical) return <span className="pill ok" style={{ padding: '1px 6px', fontSize: 10 }}>identical</span>;
  if (comp.is_a_only || comp.is_b_only) return <span className="pill info" style={{ padding: '1px 6px', fontSize: 10 }}>source-only</span>;
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
    <button
      onClick={onClick}
      className="btn btn-sm"
      style={{
        padding: '2px 8px', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace',
        background: chosen ? 'var(--accent-soft)' : 'transparent',
        border: `1px solid ${chosen ? 'var(--accent)' : 'var(--border-0)'}`,
        color: chosen ? 'var(--accent)' : 'var(--fg-0)',
        opacity: active && !chosen ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function SideBySideLayout({ comparisons, recordA, recordB, selections = {}, onSelect }: LayoutProps) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th style={{ width: 180 }}>Field</th>
          <th style={{ borderLeft: '2px solid var(--accent-border)', color: 'var(--accent)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {recordA.data_source_name && <SourcePill short={recordA.data_source_name} />}
              {recordA.name || `#${recordA.id}`}
            </span>
          </th>
          <th style={{ width: 40 }} />
          <th style={{ borderLeft: '2px solid var(--info-border)', color: 'var(--info)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {recordB.data_source_name && <SourcePill short={recordB.data_source_name} />}
              {recordB.name || `#${recordB.id}`}
            </span>
          </th>
          <th style={{ width: 90 }}>Status</th>
        </tr>
      </thead>
      <tbody>
        {comparisons.map(f => {
          const isSelected = selections[f.field] !== undefined;
          return (
            <tr key={f.field} style={{ background: f.is_conflict ? 'var(--warn-soft)' : 'transparent' }}>
              <td>
                <div style={{ fontWeight: 500 }}>{f.label}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--fg-2)' }}>{f.field}</div>
              </td>
              <td style={{ borderLeft: '2px solid var(--accent-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="mono" style={{ fontSize: 12, color: f.value_a ? 'var(--fg-0)' : 'var(--fg-3)', flex: 1 }}>
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
              <td style={{ textAlign: 'center', color: 'var(--fg-3)' }}>
                {f.is_conflict ? (
                  <span style={{ color: 'var(--warn)', fontSize: 11, fontWeight: 600 }}>vs</span>
                ) : f.is_identical ? (
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>check</span>
                ) : (
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>arrow_forward</span>
                )}
              </td>
              <td style={{ borderLeft: '2px solid var(--info-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {f.is_conflict && onSelect && (
                    <ChoiceBtn
                      chosen={selections[f.field] === recordB.id}
                      active={isSelected}
                      onClick={() => onSelect(f.field, recordB.id)}
                    >
                      Use B
                    </ChoiceBtn>
                  )}
                  <span className="mono" style={{ fontSize: 12, color: f.value_b ? 'var(--fg-0)' : 'var(--fg-3)', flex: 1 }}>
                    {f.value_b || '∅'}
                  </span>
                </div>
              </td>
              <td>{statusPill(f)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function StackedLayout({ comparisons, recordA, recordB, selections = {}, onSelect }: LayoutProps) {
  return (
    <div style={{ padding: 12 }}>
      {comparisons.map(f => {
        const isSelected = selections[f.field] !== undefined;
        return (
          <div key={f.field} style={{ marginBottom: 10, padding: 10, background: 'var(--bg-0)', border: '1px solid var(--border-0)', borderRadius: 4 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{f.label}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-2)', marginLeft: 8 }}>{f.field}</span>
              </div>
              {statusPill(f)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {([['a', recordA, f.value_a] as const, ['b', recordB, f.value_b] as const]).map(([key, sup, val]) => {
                const chosen = f.is_conflict && selections[f.field] === sup.id;
                return (
                  <div
                    key={key}
                    onClick={() => f.is_conflict && onSelect && onSelect(f.field, sup.id)}
                    style={{
                      padding: '8px 10px',
                      border: chosen
                        ? '2px solid var(--accent)'
                        : `1px solid ${key === 'a' ? 'var(--accent-border)' : 'var(--info-border)'}`,
                      borderLeft: chosen
                        ? '3px solid var(--accent)'
                        : `3px solid ${key === 'a' ? 'var(--accent-border)' : 'var(--info-border)'}`,
                      background: chosen ? 'var(--accent-soft)' : 'var(--bg-1)',
                      borderRadius: 4,
                      cursor: f.is_conflict && onSelect ? 'pointer' : 'default',
                      opacity: f.is_conflict && isSelected && !chosen ? 0.5 : 1,
                      transition: 'border-color 0.1s, background 0.1s, opacity 0.1s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      {sup.data_source_name && <SourcePill short={sup.data_source_name} />}
                      {chosen && (
                        <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>✓ chosen</span>
                      )}
                    </div>
                    <div className="mono" style={{ fontSize: 12, color: val ? 'var(--fg-0)' : 'var(--fg-3)' }}>
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
          <div key={f.field} style={{ borderBottom: i < comparisons.length - 1 ? '1px solid var(--border-0)' : 'none', padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{f.label}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-2)', marginLeft: 8 }}>{f.field}</span>
              </div>
              {statusPill(f)}
            </div>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, background: 'var(--bg-0)', border: '1px solid var(--border-0)', borderRadius: 4, overflow: 'hidden' }}>
              {([['a', recordA, f.value_a, f.is_conflict ? '−' : ' ', f.is_conflict ? 'var(--danger)' : 'var(--border-0)', f.is_conflict ? 'var(--danger-soft)' : 'transparent'] as const,
                 ['b', recordB, f.value_b, f.is_conflict ? '+' : ' ', f.is_conflict ? 'var(--ok)' : 'var(--border-0)', f.is_conflict ? 'var(--ok-soft)' : 'transparent'] as const]).map(([key, sup, val, symbol, borderColor, bg]) => {
                const chosen = f.is_conflict && selections[f.field] === sup.id;
                return (
                  <div
                    key={key}
                    onClick={() => f.is_conflict && onSelect && onSelect(f.field, sup.id)}
                    style={{
                      padding: '6px 10px',
                      background: chosen ? 'var(--accent-soft)' : bg,
                      borderLeft: `3px solid ${chosen ? 'var(--accent)' : borderColor}`,
                      display: 'flex', alignItems: 'center', gap: 8,
                      cursor: f.is_conflict && onSelect ? 'pointer' : 'default',
                      opacity: f.is_conflict && isSelected && !chosen ? 0.5 : 1,
                      transition: 'background 0.1s, opacity 0.1s',
                    }}
                  >
                    <span className="mono" style={{ width: 20, color: borderColor, fontWeight: 600 }}>{symbol}</span>
                    {sup.data_source_name && <SourcePill short={sup.data_source_name} />}
                    <span style={{ color: 'var(--fg-0)', flex: 1 }}>{val || '∅'}</span>
                    {chosen && (
                      <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>✓</span>
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
    <Panel className="fade" style={{ marginBottom: 12 }}>
      <PanelHead>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="panel-title">Field comparison</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--fg-2)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, background: 'var(--warn)', borderRadius: 2 }} />
              conflict
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, background: 'var(--ok)', borderRadius: 2 }} />
              identical
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, background: 'var(--info)', borderRadius: 2 }} />
              source-only
            </span>
          </div>
          {onSelect == null && conflictCount > 0 && (
            <span style={{ fontSize: 11, color: 'var(--fg-2)' }}>
              conflicts resolved in <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Merge step</span>
            </span>
          )}
          {onSelect != null && conflictCount > 0 && resolvedCount !== undefined && (
            <span style={{
              padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
              background: allResolved ? 'var(--ok-soft)' : 'var(--warn-soft)',
              color: allResolved ? 'var(--ok)' : 'var(--warn)',
            }}>
              <span className="mono tnum">{resolvedCount}/{conflictCount}</span> conflicts resolved
            </span>
          )}
        </div>
        <div className="seg">
          <button className={layout === 'sideBySide' ? 'active' : ''} onClick={() => onLayoutChange('sideBySide')}>Side</button>
          <button className={layout === 'stacked' ? 'active' : ''} onClick={() => onLayoutChange('stacked')}>Stacked</button>
          <button className={layout === 'diff' ? 'active' : ''} onClick={() => onLayoutChange('diff')}>Diff</button>
        </div>
      </PanelHead>
      {layout === 'sideBySide' && <SideBySideLayout comparisons={comparisons} recordA={recordA} recordB={recordB} selections={selections} onSelect={onSelect} />}
      {layout === 'stacked' && <StackedLayout comparisons={comparisons} recordA={recordA} recordB={recordB} selections={selections} onSelect={onSelect} />}
      {layout === 'diff' && <DiffLayout comparisons={comparisons} recordA={recordA} recordB={recordB} selections={selections} onSelect={onSelect} />}
    </Panel>
  );
}
