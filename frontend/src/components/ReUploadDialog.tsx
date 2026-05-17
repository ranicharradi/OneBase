// ── Re-upload preview — shows diff counts before committing ──

import { useMemo } from 'react';
import Panel, { PanelHead } from './ui/Panel';

interface ReUploadDialogProps {
  sourceName: string;
  preview: { inserted: number; updated: number; retired: number; unchanged: number };
  forceReplace: boolean;
  onForceReplaceChange: (v: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ReUploadDialog({
  sourceName, preview, forceReplace, onForceReplaceChange, onConfirm, onCancel,
}: ReUploadDialogProps) {
  const total = preview.inserted + preview.updated + preview.retired + preview.unchanged;
  const carryOverRatio = useMemo(
    () => (total > 0 ? (preview.updated + preview.unchanged) / total : 0),
    [total, preview.updated, preview.unchanged],
  );
  const lowOverlap = total >= 20 && carryOverRatio < 0.2;

  return (
    <div className="backdrop" onClick={onCancel} role="dialog" aria-modal="true">
      <Panel
        className="fade"
        style={{ width: '100%', maxWidth: 480, boxShadow: 'var(--shadow-lg)' }}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <PanelHead>
            <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--warn)' }}>
                difference
              </span>
              Re-upload preview
            </span>
            <button onClick={onCancel} className="btn btn-ghost btn-sm" style={{ padding: 4 }} aria-label="Close">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
            </button>
          </PanelHead>

          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 13, margin: 0, color: 'var(--fg-0)' }}>
              Re-uploading to <b>{sourceName}</b>. This is what will happen:
            </p>

            {lowOverlap && (
              <div
                className="pill warn"
                style={{ padding: '6px 10px', width: '100%', justifyContent: 'flex-start' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>warning</span>
                <span style={{ fontSize: 11 }}>
                  Only {Math.round(carryOverRatio * 100)}% of these rows exist in <b>{sourceName}</b>.
                  Are you sure this is a re-upload, not a new source?
                </span>
              </div>
            )}

            <ul style={{ fontSize: 12, paddingLeft: 16, margin: 0, lineHeight: 1.6 }}>
              <li><b>{preview.inserted}</b> new rows will be added</li>
              <li><b>{preview.updated}</b> rows will be updated in place</li>
              <li><b>{preview.retired}</b> rows missing from the new file will be retired</li>
              <li style={{ color: 'var(--fg-3)' }}>{preview.unchanged} rows unchanged</li>
            </ul>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--fg-1)' }}>
              <input
                type="checkbox"
                checked={forceReplace}
                onChange={(e) => onForceReplaceChange(e.target.checked)}
              />
              Force full replace — discard the prior snapshot entirely (loses match decisions)
            </label>
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
            <button onClick={onConfirm} className="btn btn-sm btn-accent">
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>cloud_upload</span>
              Continue upload
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
