import { useCallback, useState } from "react";
import { NavLink } from "react-router";
import { useSelectedRecordType } from "../../contexts/RecordTypeContext";
import Icon from "../ui/Icon";

interface NavItem {
  to: string;
  icon: string;
  label: string;
  badge?: number;
}

interface NavSection {
  section: string;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    section: "Pipeline",
    items: [
      { to: "/dashboard", icon: "home", label: "Overview" },
      { to: "/upload", icon: "cloud_upload", label: "Upload" },
      { to: "/sources", icon: "storage", label: "Sources" },
    ],
  },
  {
    section: "Matching",
    items: [
      { to: "/compare", icon: "compare_arrows", label: "Compare" },
      { to: "/review", icon: "swap_horiz", label: "Review queue" },
      { to: "/merge", icon: "merge", label: "Merge queue" },
      { to: "/unified", icon: "verified", label: "Unified" },
      { to: "/history", icon: "history", label: "History" },
    ],
  },
  {
    section: "Utilities",
    items: [
      { to: "/insights", icon: "insights", label: "Insights" },
      { to: "/file-checker", icon: "rule", label: "File checker" },
      { to: "/ask", icon: "forum", label: "Ask" },
    ],
  },
];

export default function Sidebar({
  collapsed,
  onToggleCollapse,
  reviewCount,
  mergeCount,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  reviewCount: number;
  mergeCount: number;
}) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(NAV.map((sec) => [sec.section, true])),
  );
  const toggleSection = useCallback((section: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [section]: !(prev[section] ?? true),
    }));
  }, []);
  const { selectedType, recordTypes, isLoading, setSelectedType, withRecordType } = useSelectedRecordType();

  return (
    <aside
      style={{
        width: collapsed ? 56 : 240,
        transition: "width 0.2s ease",
        background: "var(--bg-1)",
        borderRight: "1px solid var(--border-0)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          height: 48,
          padding: collapsed ? 0 : "0 10px 0 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: 10,
          borderBottom: "1px solid var(--border-0)",
        }}
      >
        {collapsed ? (
          <button
            onClick={onToggleCollapse}
            className="nav-item"
            title="Expand sidebar"
            aria-label="Expand sidebar"
            style={{ justifyContent: "center", padding: 0, color: "var(--fg-2)" }}
          >
            <span style={{ display: "inline-flex" }}>
              <Icon name="arrow_forward" size={20} />
            </span>
          </button>
        ) : (
          <>
            <div
              style={{
                width: 28,
                height: 28,
                background: "var(--fg-0)",
                color: "var(--bg-1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 14,
                fontFamily: "IBM Plex Mono, monospace",
                borderRadius: 5,
                flexShrink: 0,
              }}
            >
              1B
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                lineHeight: 1.1,
                minWidth: 0,
                flex: 1,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>OneBase</span>
              <span className="mono" style={{ fontSize: 9, color: "var(--fg-2)" }}>
                record unification
              </span>
            </div>
            <button
              onClick={onToggleCollapse}
              className="btn btn-ghost btn-sm"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              style={{ padding: 4, color: "var(--fg-3)", flexShrink: 0 }}
            >
              <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
                <Icon name="arrow_forward" size={14} />
              </span>
            </button>
          </>
        )}
      </div>

      <div
        style={{
          padding: collapsed ? "8px 6px" : "10px 12px",
          borderBottom: "1px solid var(--border-0)",
        }}
      >
        {collapsed ? (
          <button
            type="button"
            className="nav-item"
            title={`Record type: ${selectedType}`}
            aria-label={`Record type: ${selectedType}`}
            style={{ justifyContent: "center", padding: 0, color: "var(--fg-2)" }}
          >
            <Icon name="category" size={20} />
          </button>
        ) : (
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span className="label" style={{ fontSize: 10 }}>Record Type</span>
            <select
              className="input"
              aria-label="Record type"
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value)}
              disabled={isLoading || recordTypes.length === 0}
              style={{ height: 28, fontSize: 12, padding: "0 8px", width: "100%" }}
            >
              {recordTypes.length === 0 ? (
                <option value={selectedType}>{selectedType}</option>
              ) : recordTypes.map((type) => (
                <option key={type.key} value={type.key}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <nav className="scroll" style={{ flex: 1, padding: "8px 0" }}>
        {NAV.map((sec) => {
          const sectionOpen = openSections[sec.section] ?? true;
          return (
            <div key={sec.section}>
              {!collapsed && (
                <button
                  type="button"
                  className="label"
                  aria-expanded={sectionOpen}
                  onClick={() => toggleSection(sec.section)}
                  style={{
                    width: "100%",
                    padding: "12px 14px 6px",
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "transparent",
                    border: 0,
                    color: "var(--fg-2)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                  }}
                >
                  <span>{sec.section}</span>
                  <Icon
                    name={sectionOpen ? "expand_less" : "expand_more"}
                    size={14}
                  />
                </button>
              )}
              {(collapsed || sectionOpen) &&
                sec.items.map((item) => {
                  const badge =
                    item.to === "/review"
                      ? reviewCount
                      : item.to === "/merge"
                        ? mergeCount
                        : undefined;
                  const badgeColor =
                    item.to === "/review" ? "var(--warn)" : "var(--accent)";
                  return (
                    <NavLink
                      key={item.to}
                      to={withRecordType(item.to)}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        `nav-item${isActive ? " active" : ""}`
                      }
                      style={{
                        justifyContent: collapsed ? "center" : "flex-start",
                        padding: collapsed ? 0 : "0 12px",
                      }}
                    >
                      <Icon name={item.icon} size={collapsed ? 20 : 18} />
                      {!collapsed && (
                        <span style={{ flex: 1 }}>{item.label}</span>
                      )}
                      {!collapsed && badge !== undefined && badge > 0 && (
                        <span
                          className="nav-badge mono"
                          style={{ background: badgeColor }}
                        >
                          {badge}
                        </span>
                      )}
                      {collapsed && badge !== undefined && badge > 0 && (
                        <span
                          style={{
                            position: "absolute",
                            top: 6,
                            right: 6,
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: badgeColor,
                          }}
                        />
                      )}
                    </NavLink>
                  );
                })}
            </div>
          );
        })}
      </nav>

    </aside>
  );
}
