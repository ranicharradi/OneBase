import Hbar from './Hbar';
import { confidenceTone } from '../../utils/confidence';

interface ConfMiniProps {
  /** 0–1 confidence */
  value: number;
  width?: number;
}

export default function ConfMini({ value, width = 56 }: ConfMiniProps) {
  const pct = Math.round(value * 100);
  const tone = confidenceTone(value);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Hbar value={pct} tone={tone} width={width} height={4} />
      <span
        className="mono tnum"
        style={{
          fontSize: 11,
          width: 30,
          textAlign: 'right',
          color: `var(--${tone})`,
          fontWeight: 600,
        }}
      >
        {value.toFixed(2)}
      </span>
    </span>
  );
}
