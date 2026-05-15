import { type ReactNode, useEffect } from 'react';
import Panel, { PanelHead } from './Panel';

type ModalSize = 'sm' | 'md' | 'lg';

const SIZE_MAX_WIDTH: Record<ModalSize, number> = {
  sm: 400,
  md: 520,
  lg: 680,
};

interface ModalProps {
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  size?: ModalSize;
  /** Extra panel style overrides (e.g. maxHeight, overflow). */
  panelStyle?: React.CSSProperties;
}

export function Modal({ onClose, title, children, size = 'md', panelStyle }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <Panel
        className="fade"
        style={{ width: '100%', maxWidth: SIZE_MAX_WIDTH[size], boxShadow: 'var(--shadow-lg)', ...panelStyle }}
        onClick={(e) => e.stopPropagation()}
      >
        <PanelHead>
          {typeof title === 'string' ? (
            <span className="panel-title">{title}</span>
          ) : (
            title
          )}
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            style={{ padding: 4 }}
            aria-label="Close"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
          </button>
        </PanelHead>
        {children}
      </Panel>
    </div>
  );
}
