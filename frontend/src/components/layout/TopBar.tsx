import Icon from "../ui/Icon";
import AvatarMenu from "./AvatarMenu";

type Density = "compact" | "comfortable" | "spacious";

const DENSITY_ICON: Record<Density, string> = {
  compact: "density_small",
  comfortable: "density_medium",
  spacious: "density_large",
};

interface TopBarProps {
  breadcrumb: string[];
  onOpenPalette: () => void;
  density: Density;
  onCycleDensity: () => void;
  showDensity: boolean;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  username: string | undefined;
  isAdmin: boolean;
  onLogout: () => void;
}

export default function TopBar({
  breadcrumb,
  onOpenPalette,
  density,
  onCycleDensity,
  showDensity,
  theme,
  onToggleTheme,
  username,
  isAdmin,
  onLogout,
}: TopBarProps) {
  return (
    <div className="topbar">
      {breadcrumb.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: "var(--fg-2)",
            fontSize: 12,
          }}
        >
          {breadcrumb.map((b, i) => (
            <span
              key={i}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              {i > 0 && <Icon name="chevron_right" size={10} />}
              <span
                style={{
                  color:
                    i === breadcrumb.length - 1 ? "var(--fg-0)" : "var(--fg-2)",
                  fontWeight: i === breadcrumb.length - 1 ? 500 : 400,
                }}
              >
                {b}
              </span>
            </span>
          ))}
        </div>
      )}

      <div style={{ flex: 1 }} />

      <button
        onClick={onOpenPalette}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 10px",
          height: 26,
          minWidth: 260,
          background: "var(--bg-2)",
          border: "1px solid var(--border-0)",
          borderRadius: 4,
          cursor: "pointer",
          color: "var(--fg-2)",
          fontFamily: "inherit",
          fontSize: 12,
        }}
        aria-label="Open command palette"
      >
        <Icon name="search" size={13} />
        <span style={{ flex: 1, textAlign: "left" }}>
          Jump to, search, run…
        </span>
        <span className="kbd">⌘K</span>
      </button>

      {showDensity && (
        <button
          onClick={onCycleDensity}
          className="btn btn-ghost btn-sm"
          style={{ padding: 4 }}
          title={`Density: ${density}`}
          aria-label={`Density: ${density}. Click to cycle.`}
        >
          <Icon name={DENSITY_ICON[density]} size={14} />
        </button>
      )}

      <button
        onClick={onToggleTheme}
        className="btn btn-ghost btn-sm"
        style={{ padding: 4 }}
        title={
          theme === "light" ? "Switch to dark theme" : "Switch to light theme"
        }
        aria-label="Toggle theme"
      >
        <Icon name={theme === "light" ? "dark_mode" : "light_mode"} size={14} />
      </button>

      <AvatarMenu username={username} isAdmin={isAdmin} onLogout={onLogout} />
    </div>
  );
}
