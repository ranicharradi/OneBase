interface IconProps {
  name: string;
  size?: number;
  filled?: boolean;
}

export default function Icon({ name, size = 14, filled = false }: IconProps) {
  return (
    <span
      className={"material-symbols-outlined" + (filled ? " filled" : "")}
      style={{
        fontSize: size,
        width: size,
        height: size,
        lineHeight: `${size}px`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        verticalAlign: "middle",
        flexShrink: 0,
        userSelect: "none",
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
