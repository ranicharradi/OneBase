import React from 'react';

type StageKey = 'match' | 'review' | 'merge' | 'unified';

interface StageSlot {
  count?: { value: number | string; unit: string };
  onClick?: () => void;
  title?: string;
}

interface WorkflowStageRailProps {
  activeStage: StageKey;
  match?: StageSlot;
  review?: StageSlot;
  merge?: StageSlot;
  unified?: StageSlot;
}

const STAGE_META: Record<StageKey, { num: string; label: string; subtitle: string; color: string }> = {
  match:   { num: '01', label: 'Match',   subtitle: 'Candidate pairs',  color: 'info'   },
  review:  { num: '02', label: 'Review',  subtitle: 'Same record?',     color: 'warn'   },
  merge:   { num: '03', label: 'Merge',   subtitle: 'Reconcile fields', color: 'accent' },
  unified: { num: '04', label: 'Unified', subtitle: 'Unified records',  color: 'ok'     },
};

const STAGE_ORDER: StageKey[] = ['match', 'review', 'merge', 'unified'];

export default function WorkflowStageRail({ activeStage, match, review, merge, unified }: WorkflowStageRailProps) {
  const slots: Record<StageKey, StageSlot | undefined> = { match, review, merge, unified };

  return (
    <div className="fade" style={{
      display: 'flex', alignItems: 'stretch',
      background: 'var(--bg-1)', border: '1px solid var(--border-0)', borderRadius: 6,
      overflow: 'hidden', marginBottom: 12,
    }}>
      {STAGE_ORDER.map((key, i) => {
        const meta = STAGE_META[key];
        const slot = slots[key] ?? {};
        const isActive = key === activeStage;
        const isLast = i === STAGE_ORDER.length - 1;
        return (
          <React.Fragment key={key}>
            <div
              onClick={slot.onClick}
              title={slot.title}
              style={{
                padding: '10px 16px',
                ...(isLast ? { flex: 1 } : { minWidth: 210 }),
                background: isActive ? `var(--${meta.color}-soft)` : 'var(--bg-2)',
                ...(!isLast ? { borderRight: '1px solid var(--border-0)' } : {}),
                position: 'relative', overflow: 'hidden',
                ...(slot.onClick ? { cursor: 'pointer', opacity: 0.5 } : {}),
              }}
            >
              <span className="mono" style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                fontSize: 52, fontWeight: 700,
                color: isActive ? `var(--${meta.color})` : 'var(--fg-0)',
                opacity: isActive ? 0.08 : 0.05,
                lineHeight: 1, pointerEvents: 'none', userSelect: 'none',
              }}>{meta.num}</span>
              <div className="label" style={{ color: isActive ? `var(--${meta.color})` : 'var(--fg-2)', fontWeight: 600, position: 'relative' }}>
                {meta.label}
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-1)', marginTop: 2, position: 'relative' }}>
                {meta.subtitle}
              </div>
              <div className="mono tnum" style={{ fontSize: 18, fontWeight: 600, color: isActive ? `var(--${meta.color})` : 'var(--fg-1)', marginTop: 4, position: 'relative' }}>
                {slot.count?.value ?? '—'}{' '}
                <span style={{ fontSize: 10, color: 'var(--fg-2)', fontWeight: 400 }}>{slot.count?.unit ?? ''}</span>
              </div>
            </div>
            {!isLast && <div style={{ alignSelf: 'center', padding: '0 8px', color: 'var(--fg-3)', fontSize: 14 }}>→</div>}
          </React.Fragment>
        );
      })}
    </div>
  );
}
