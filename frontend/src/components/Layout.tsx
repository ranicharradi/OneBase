import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";
import { useMatchingNotifications } from "../hooks/useMatchingNotifications";
import { useNotifications } from "../hooks/useNotifications";
import { ToastContainer } from "./Toast";
import type { ToastData } from "./Toast";
import type { MatchingNotification, ReviewStats } from "../api/types";
import NotificationCenter from "./NotificationCenter";
import CommandPalette from "./CommandPalette";
import { SearchProvider } from "../contexts/SearchContext";
import { RecordTypeProvider, useSelectedRecordType } from "../contexts/RecordTypeContext";
import { api } from "../api/client";
import Sidebar from "./layout/Sidebar";
import TopBar from "./layout/TopBar";

const DENSITY_ROUTE_PREFIXES = [
  "/upload",
  "/file-checker",
  "/sources",
  "/review",
  "/merge",
  "/unified",
  "/users",
];

function routeHasDensity(pathname: string): boolean {
  return DENSITY_ROUTE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

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

const NEXT_DENSITY: Record<
  "compact" | "comfortable" | "spacious",
  "compact" | "comfortable" | "spacious"
> = {
  compact: "comfortable",
  comfortable: "spacious",
  spacious: "compact",
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
  const { theme, toggleTheme, density, setDensity } = useTheme();
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
  const notifs = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);

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
        if (notification.type === "matching_complete") {
          const { candidate_count = 0, group_count = 0 } = notification.data;
          addToast({
            type: "success",
            message: "Matching complete",
            detail: `${candidate_count} candidate pairs found in ${group_count} groups`,
            action: { label: "View results →", href: withRecordType("/review") },
          });
          notifs.add(
            "matching_complete",
            `Matching complete: ${candidate_count} candidates in ${group_count} groups`,
          );
        } else if (notification.type === "matching_failed") {
          addToast({
            type: "error",
            message: "Matching failed",
            detail:
              notification.data.error ||
              "An unexpected error occurred during matching",
          });
          notifs.add(
            "matching_failed",
            `Matching failed: ${notification.data.error || "Unknown error"}`,
          );
        } else if (notification.type === "comparison_complete") {
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
              href: withRecordType(`/review?comparison_run_id=${runId}`),
            },
          });
          notifs.add(
            "comparison_complete",
            `Comparison run #${runId} complete: ${candidateCount} candidates`,
          );
        }
      },
      [addToast, notifs, withRecordType],
    ),
  );

  const handleLogout = useCallback(() => {
    logout();
    navigate("/login");
  }, [logout, navigate]);

  const cycleDensity = useCallback(() => {
    setDensity(NEXT_DENSITY[density]);
  }, [density, setDensity]);

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
          density={density}
          onCycleDensity={cycleDensity}
          showDensity={routeHasDensity(location.pathname)}
          theme={theme}
          onToggleTheme={toggleTheme}
          username={user?.username}
          isAdmin={user?.role === "admin"}
          onLogout={handleLogout}
          notificationCenter={
            <NotificationCenter
              notifications={notifs.notifications}
              unreadCount={notifs.unreadCount}
              isOpen={notifOpen}
              onToggle={() => setNotifOpen((p) => !p)}
              onMarkRead={notifs.markRead}
              onMarkAllRead={notifs.markAllRead}
              onRemove={notifs.remove}
              onClearAll={notifs.clearAll}
            />
          }
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
