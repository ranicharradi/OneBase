import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import Icon from "../ui/Icon";

export default function AvatarMenu({
  username,
  isAdmin,
  onLogout,
}: {
  username: string | undefined;
  isAdmin: boolean;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const initial = (username?.[0] ?? "?").toUpperCase();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "var(--accent)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 600,
          border: "none",
          cursor: "pointer",
          flexShrink: 0,
        }}
        title={username ?? "Account"}
      >
        {initial}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            minWidth: 160,
            background: "var(--bg-1)",
            border: "1px solid var(--border-0)",
            borderRadius: 6,
            boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
            zIndex: 100,
            overflow: "hidden",
          }}
        >
          {username && (
            <div
              style={{
                padding: "8px 12px",
                borderBottom: "1px solid var(--border-0)",
                fontSize: 11,
                color: "var(--fg-2)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span className="pill-dot" style={{ background: "var(--ok)", flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {username}
              </span>
            </div>
          )}
          {isAdmin && (
            <button
              onClick={() => { navigate("/users"); setOpen(false); }}
              style={{
                width: "100%",
                padding: "7px 12px",
                background: "transparent",
                border: "none",
                borderBottom: "1px solid var(--border-0)",
                cursor: "pointer",
                fontSize: 12,
                color: "var(--fg-1)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              <Icon name="group" size={13} />
              Admin access
            </button>
          )}
          <button
            onClick={() => { onLogout(); setOpen(false); }}
            style={{
              width: "100%",
              padding: "7px 12px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              color: "var(--fg-1)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "inherit",
              textAlign: "left",
            }}
          >
            <Icon name="logout" size={13} />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
