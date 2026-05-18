import Panel, { PanelHead } from './ui/Panel';
import type { OverlapMatch } from '../api/types';

interface Props {
  matches: OverlapMatch[];
  onReuploadTo: (sourceId: number) => void;
  onCreateAnyway: () => void;
  onCancel: () => void;
}

export default function SourceOverlapDialog({
  matches,
  onReuploadTo,
  onCreateAnyway,
  onCancel,
}: Props) {
  if (matches.length === 0) return null;
  const titleId = 'source-overlap-dialog-title';

  return (
    <div
      className="backdrop"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <Panel
        className="fade"
        style={{ width: '100%', maxWidth: 480, boxShadow: 'var(--shadow-lg)' }}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <PanelHead>
            <span
              id={titleId}
              className="panel-title"
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--warn)' }}>
                content_copy
              </span>
              This file looks like an existing source
            </span>
            <button onClick={onCancel} className="btn btn-ghost btn-sm" style={{ padding: 4 }} aria-label="Close">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
            </button>
          </PanelHead>

          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 13, margin: 0, color: 'var(--fg-0)' }}>
              We found significant row overlap with sources you already have:
            </p>

            <ul style={{ fontSize: 12, paddingLeft: 16, margin: 0, lineHeight: 1.6 }}>
              {matches.map((match) => (
                <li key={match.source_id} style={{ marginBottom: 8 }}>
                  <b>{match.source_name}</b>
                  {' '}
                  <span className="mono">{Math.round(match.overlap_ratio * 100)}%</span>
                  {' '}
                  of rows already exist there
                  <button
                    className="btn btn-sm"
                    style={{ marginLeft: 8 }}
                    aria-label={`Re-upload to ${match.source_name}`}
                    onClick={() => onReuploadTo(match.source_id)}
                  >
                    Re-upload here
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div
            style={{
              padding: '10px 14px',
              borderTop: '1px solid var(--border-0)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
            }}
          >
            <button onClick={onCancel} className="btn btn-sm">Cancel</button>
            <button onClick={onCreateAnyway} className="btn btn-sm btn-accent">
              Create new anyway
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
