import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  SearchIcon,
  HomeIcon,
  CloudUploadIcon,
  DatabaseIcon,
  ArrowRightLeftIcon,
  SplitIcon,
  GitMergeIcon,
  BadgeCheckIcon,
  HistoryIcon,
  BarChart3Icon,
  ListChecksIcon,
  MessageSquareIcon,
  PlusIcon,
  SparklesIcon,
  ArrowRightIcon,
} from "lucide-react";
import { api } from "../api/client";
import type { UnifiedRecordListResponse } from "../api/types";
import { useSelectedRecordType } from "../contexts/RecordTypeContext";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface PaletteItem {
  section: "Navigate" | "Actions" | "Records";
  label: string;
  hint?: string;
  icon: LucideIcon;
  onSelect: () => void;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { selectedType, withRecordType } = useSelectedRecordType();
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      // focus after the dialog mounts
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Record search — only fires when palette is open and query has 2+ chars
  const trimmed = query.trim();
  const recordEnabled = open && trimmed.length >= 2;
  const { data: recordResults } = useQuery<UnifiedRecordListResponse>({
    queryKey: ["command-palette-records", trimmed, selectedType],
    queryFn: () => {
      const params = new URLSearchParams({
        search: trimmed,
        limit: "8",
        type: selectedType,
      });
      return api.get(`/api/unified/records?${params}`);
    },
    enabled: recordEnabled,
    staleTime: 30_000,
  });

  const items = useMemo<PaletteItem[]>(() => {
    const navItems: PaletteItem[] = [
      // Pipeline
      { section: "Navigate", label: "Go to Overview",      icon: HomeIcon,           onSelect: () => navigate("/dashboard") },
      { section: "Navigate", label: "Go to Upload",        icon: CloudUploadIcon,    onSelect: () => navigate("/upload") },
      { section: "Navigate", label: "Go to Sources",       icon: DatabaseIcon,       onSelect: () => navigate("/sources") },
      // Matching
      { section: "Navigate", label: "Go to Match",         icon: ArrowRightLeftIcon, onSelect: () => navigate("/match") },
      { section: "Navigate", label: "Go to Review queue",  icon: SplitIcon,          onSelect: () => navigate(withRecordType("/review")) },
      { section: "Navigate", label: "Go to Merge queue",   icon: GitMergeIcon,       onSelect: () => navigate(withRecordType("/merge")) },
      { section: "Navigate", label: "Go to Unified",       icon: BadgeCheckIcon,     onSelect: () => navigate(withRecordType("/unified")) },
      { section: "Navigate", label: "Go to History",       icon: HistoryIcon,        onSelect: () => navigate("/history") },
      // Utilities
      { section: "Navigate", label: "Go to Insights",      icon: BarChart3Icon,      onSelect: () => navigate("/insights") },
      { section: "Navigate", label: "Go to File checker",  icon: ListChecksIcon,     onSelect: () => navigate("/file-checker") },
      { section: "Navigate", label: "Go to Ask",           icon: MessageSquareIcon,  onSelect: () => navigate("/ask") },
      // Actions
      { section: "Actions",  label: "New data source",     icon: PlusIcon,           onSelect: () => navigate("/sources") },
      { section: "Actions",  label: "Upload CSV batch",    icon: CloudUploadIcon,    onSelect: () => navigate("/upload") },
      { section: "Actions",  label: "Retrain model",       icon: SparklesIcon,       onSelect: () => navigate(withRecordType("/review")) },
      { section: "Actions",  label: "Browse unified",      icon: ArrowRightIcon,     onSelect: () => navigate(withRecordType("/unified")) },
    ];

    const recordItems: PaletteItem[] = (recordResults?.items ?? []).map(
      (s) => ({
        section: "Records" as const,
        label: s.name || `Record #${s.id}`,
        hint: `${s.type} · ${s.source_count} source${s.source_count === 1 ? "" : "s"}`,
        icon: BadgeCheckIcon,
        onSelect: () => navigate(withRecordType(`/unified/${s.id}`)),
      }),
    );

    const lower = trimmed.toLowerCase();
    const filtered = lower
      ? navItems.filter((i) => i.label.toLowerCase().includes(lower))
      : navItems;
    return [...filtered, ...recordItems];
  }, [navigate, recordResults, trimmed, withRecordType]);

  // Reset selection when items change
  useEffect(() => {
    setActiveIdx(0);
  }, [items.length]);

  // Group items by section in render order
  const grouped = useMemo(() => {
    const out: Record<string, { item: PaletteItem; idx: number }[]> = {};
    items.forEach((item, idx) => {
      (out[item.section] ||= []).push({ item, idx });
    });
    return out;
  }, [items]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[activeIdx];
      if (item) {
        item.onSelect();
        onClose();
      }
    }
  };

  return (
    <div
      className="backdrop backdrop-top"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="w-[560px] bg-card border border-border rounded-lg shadow-lg overflow-hidden"
      >
        <div className="px-3.5 py-3 border-b border-border flex items-center gap-2.5">
          <SearchIcon className="size-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, search records, paste an ID…"
            className="flex-1 bg-transparent border-none outline-none font-[inherit] text-[14px] text-foreground placeholder:text-muted-foreground"
            aria-label="Command palette query"
          />
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted text-muted-foreground">
            ESC
          </span>
        </div>

        <div className="overflow-y-auto max-h-[50vh]">
          {items.length === 0 && (
            <div className="p-7 text-center text-xs text-muted-foreground">
              No matches
            </div>
          )}
          {Object.entries(grouped).map(([section, entries]) => (
            <div key={section}>
              <div className="px-3.5 pt-2.5 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {section}
              </div>
              {entries.map(({ item, idx }) => {
                const active = idx === activeIdx;
                const IconCmp = item.icon;
                return (
                  <button
                    key={`${section}-${idx}`}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => {
                      item.onSelect();
                      onClose();
                    }}
                    className={`w-full px-3.5 py-2 flex items-center gap-2.5 border-none cursor-pointer font-[inherit] text-foreground text-[13px] text-left transition-colors ${active ? "bg-muted" : "bg-transparent hover:bg-muted/50"}`}
                  >
                    <IconCmp className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {item.hint && (
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {item.hint}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="px-3.5 py-2 border-t border-border flex gap-3.5 text-muted-foreground text-[10px]">
          <span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted text-muted-foreground">↑↓</span>
            {" "}navigate
          </span>
          <span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted text-muted-foreground">↵</span>
            {" "}select
          </span>
          <span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted text-muted-foreground">⌘</span>
            {" "}open
          </span>
        </div>
      </div>
    </div>
  );
}
