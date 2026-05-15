import { SIGNAL_CONFIG } from '../utils/signals';
import Panel, { PanelHead } from './ui/Panel';
import Hbar from './ui/Hbar';

interface MatchSignalsPanelProps {
  signals: Record<string, number>;
  confidence: number;
  tone: 'ok' | 'warn' | 'danger';
}

export default function MatchSignalsPanel({ signals, confidence, tone }: MatchSignalsPanelProps) {
  return (
    <Panel className="fade" style={{ marginBottom: 12 }}>
      <PanelHead title="Signals" />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Object.keys(signals).length + 1}, 1fr)`, gap: 0 }}>
        {Object.entries(signals).map(([k, v]) => {
          const meta = SIGNAL_CONFIG[k] ?? { label: k, shortLabel: k, icon: '·' };
          const pct = Math.round(v * 100);
          const t = pct >= 85 ? 'ok' : pct >= 60 ? 'warn' : 'danger';
          return (
            <div key={k} style={{ padding: '10px 14px', borderRight: '1px solid var(--border-0)' }}>
              <div className="label">{meta.label}</div>
              <div className="mono tnum" style={{ fontSize: 18, fontWeight: 600, color: `var(--${t})`, marginTop: 4 }}>
                {v.toFixed(2)}
              </div>
              <Hbar value={pct} tone={t} style={{ marginTop: 6 }} />
            </div>
          );
        })}
        <div style={{ padding: '10px 14px', background: 'var(--bg-2)' }}>
          <div className="label">Overall</div>
          <div className="mono tnum" style={{ fontSize: 20, fontWeight: 600, color: `var(--${tone})`, marginTop: 4 }}>
            {confidence.toFixed(3)}
          </div>
          <Hbar value={Math.round(confidence * 100)} tone={tone} style={{ marginTop: 6 }} />
        </div>
      </div>
    </Panel>
  );
}
