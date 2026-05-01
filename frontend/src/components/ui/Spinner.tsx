interface SpinnerProps {
  size?: number;
  color?: string;
}

export default function Spinner({ size = 14, color = 'var(--accent)' }: SpinnerProps) {
  return (
    <span
      className="spin"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: '2px solid var(--border-1)',
        borderTopColor: color,
        borderRadius: '50%',
      }}
      aria-hidden="true"
    />
  );
}
