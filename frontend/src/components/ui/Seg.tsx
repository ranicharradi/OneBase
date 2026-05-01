import type { ReactNode } from 'react';

interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

interface SegProps<T extends string> {
  options: SegOption<T>[];
  value: T;
  onChange: (value: T) => void;
  fullWidth?: boolean;
}

export default function Seg<T extends string>({ options, value, onChange, fullWidth }: SegProps<T>) {
  return (
    <div className="seg" style={fullWidth ? { width: '100%' } : undefined}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={active ? 'active' : ''}
            style={fullWidth ? { flex: 1 } : undefined}
          >
            {o.label}
            {typeof o.count === 'number' && (
              <span className="mono tnum" style={{ opacity: 0.6, marginLeft: 4 }}>
                {o.count.toLocaleString()}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
