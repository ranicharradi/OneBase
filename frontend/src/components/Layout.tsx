import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";
import { useMatchingNotifications } from "../hooks/useMatchingNotifications";
import { ToastContainer } from "./Toast";
import type { ToastData } from "./Toast";
import type { MatchingNotification, ReviewStats } from "../api/types";
import CommandPalette from "./CommandPalette";
import { SearchProvider } from "../contexts/SearchContext";
import { RecordTypeProvider, useSelectedRecordType } from "../contexts/RecordTypeContext";
import { api } from "../api/client";
import Sidebar from "./layout/Sidebar";
import TopBar from "./layout/TopBar";

const BREADCRUMBS: Record<string, string[]> = {
  "/dashboard": ["Pipeline", "Overview"],
  "/insights": ["Utilities", "Insights"],
  "/upload": ["Pipeline", "Upload"],
  "/compare": ["Matching", "Compare"],
  "/file-checker": ["Utilities", "File checker"],
  "/sources": ["Pipeline", "Sources"],
  "/history": ["Matching", "History"],
  "/review": ["Matching", "Review queue"],
  "/merge": ["Matching", "Merge queue"],
  "/unified": ["Matching", "Unified"],
  "/ask": ["Utilities", "Ask"],
  "/users": ["Utilities", "Admin access"],
};

export default function Layout() {
  return (
    <SearchProvider>
      <RecordTypeProvider>
        <LayoutContent />
      </RecordTypeProvider>
    </SearchProvider>
  );
}

function LayoutContent() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { selectedType, withRecordType } = useSelectedRecordType();

  const { data: reviewStats } = useQuery({
    queryKey: ["review-stats", selectedType],
    queryFn: () => api.get<ReviewStats>(`/api/review/stats?type=${selectedType}`),
    refetchInterval: 30_000,
  });
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback((toast: Omit<ToastData, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useMatchingNotifications(
    useCallback(
      (notification: MatchingNotification) => {
        if (notification.type === "ingestion_complete") {
          const { candidate_count = 0, group_count = 0 } = notification.data;
          addToast({
            type: "success",
            message: "Matching complete",
            detail: `${candidate_count} candidate pairs found in ${group_count} groups`,
            action: { label: "View results →", href: withRecordType("/review") },
          });
        } else if (notification.type === "ingestion_failed") {
          addToast({
            type: "error",
            message: "Matching failed",
            detail:
              notification.data.error ||
              "An unexpected error occurred during matching",
          });
        } else if (notification.type === "match_complete") {
          const runId = notification.data.run_id;
          const candidateCount =
            notification.data.stats?.candidate_count ??
            notification.data.candidate_count ??
            0;
          addToast({
            type: "success",
            message: `Comparison run #${runId} complete`,
            detail: `${candidateCount} candidates found`,
            action: {
              label: "Review →",
              href: withRecordType(`/review?match_run_id=${runId}`),
            },
          });
        }
      },
      [addToast, withRecordType],
    ),
  );

  const handleLogout = useCallback(() => {
    logout();
    navigate("/login");
  }, [logout, navigate]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((p) => !p);
        return;
      }
      if (e.key === "[" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target as HTMLElement | null;
        const tag = t?.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA" && !t?.isContentEditable) {
          e.preventDefault();
          setCollapsed((c) => !c);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const breadcrumb = useMemo(() => {
    const path = location.pathname;
    const matched = Object.keys(BREADCRUMBS)
      .sort((a, b) => b.length - a.length)
      .find((prefix) => path === prefix || path.startsWith(prefix + "/"));
    if (!matched) return ["OneBase"];
    const base = BREADCRUMBS[matched];
    const rest = path.slice(matched.length).split("/").filter(Boolean);
    return rest.length > 0 ? [...base, rest[rest.length - 1]] : base;
  }, [location.pathname]);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        reviewCount={reviewStats?.total_pending ?? 0}
        mergeCount={reviewStats?.total_confirmed ?? 0}
      />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        <TopBar
          breadcrumb={breadcrumb}
          onOpenPalette={() => setPaletteOpen(true)}
          theme={theme}
          onToggleTheme={toggleTheme}
          username={user?.username}
          isAdmin={user?.role === "admin"}
          onLogout={handleLogout}
        />

        <main
          style={{
            flex: 1,
            minHeight: 0,
            background: "var(--bg-0)",
            overflow: "hidden",
          }}
        >
          <Outlet />
        </main>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
