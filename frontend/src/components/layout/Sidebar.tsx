import { useCallback, useState } from "react";
import { NavLink } from "react-router";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRightIcon,
  TagIcon,
  ChevronUpIcon,
  ChevronDownIcon,
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
} from "lucide-react";
import { useSelectedRecordType } from "../../contexts/RecordTypeContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const NAV_ITEM_BASE =
  "flex items-center gap-2.5 h-9 rounded-md text-sm text-foreground/80 hover:bg-muted hover:text-foreground transition-colors cursor-pointer relative";
const NAV_ITEM_ACTIVE = "bg-muted text-foreground";

interface NavItem {
  to: string;
  icon: LucideIcon;
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
      { to: "/dashboard", icon: HomeIcon, label: "Overview" },
      { to: "/upload", icon: CloudUploadIcon, label: "Upload" },
      { to: "/sources", icon: DatabaseIcon, label: "Sources" },
    ],
  },
  {
    section: "Matching",
    items: [
      { to: "/match", icon: ArrowRightLeftIcon, label: "Match" },
      { to: "/review", icon: SplitIcon, label: "Review queue" },
      { to: "/merge", icon: GitMergeIcon, label: "Merge queue" },
      { to: "/unified", icon: BadgeCheckIcon, label: "Unified" },
      { to: "/history", icon: HistoryIcon, label: "History" },
    ],
  },
  {
    section: "Utilities",
    items: [
      { to: "/insights", icon: BarChart3Icon, label: "Insights" },
      { to: "/file-checker", icon: ListChecksIcon, label: "File checker" },
      { to: "/ask", icon: MessageSquareIcon, label: "Ask" },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  reviewCount: number;
  mergeCount: number;
}

export default function Sidebar({ collapsed, onToggleCollapse, reviewCount, mergeCount }: SidebarProps) {
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
      style={{ width: collapsed ? 56 : 240, transition: "width 0.2s ease" }}
      className="bg-card border-r border-border flex flex-col flex-shrink-0"
    >
      <div
        className="border-b border-border flex items-center"
        style={{
          height: 48,
          padding: collapsed ? 0 : "0 10px 0 14px",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: 10,
        }}
      >
        {collapsed ? (
          <button
            onClick={onToggleCollapse}
            className={cn(NAV_ITEM_BASE, "justify-center w-full")}
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <span className="inline-flex text-muted-foreground">
              <ArrowRightIcon className="size-5" />
            </span>
          </button>
        ) : (
          <>
            <div
              className="bg-foreground text-card flex items-center justify-center font-bold font-mono flex-shrink-0"
              style={{
                width: 28,
                height: 28,
                fontSize: 14,
                fontFamily: "IBM Plex Mono, monospace",
                borderRadius: 5,
              }}
            >
              1B
            </div>
            <div className="flex flex-col min-w-0 flex-1" style={{ lineHeight: 1.1 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>OneBase</span>
              <span className="font-mono text-muted-foreground" style={{ fontSize: 9 }}>
                record unification
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onToggleCollapse}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              className="text-muted-foreground flex-shrink-0"
            >
              <span className="inline-flex rotate-180">
                <ArrowRightIcon className="size-3.5" />
              </span>
            </Button>
          </>
        )}
      </div>

      <div
        className="border-b border-border"
        style={{ padding: collapsed ? "8px 6px" : "10px 12px" }}
      >
        {collapsed ? (
          <div className="relative flex justify-center">
            <div
              className={cn(NAV_ITEM_BASE, "justify-center w-full pointer-events-none")}
              title={`Record type: ${selectedType}`}
              aria-label={`Record type: ${selectedType}`}
            >
              <span className="text-muted-foreground">
                <TagIcon className="size-5" />
              </span>
            </div>
            <select
              aria-label="Record type"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              disabled={isLoading || recordTypes.length === 0}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            >
              {recordTypes.map((type) => (
                <option key={type.key} value={type.key}>{type.label}</option>
              ))}
            </select>
          </div>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Record Type</span>
            <select
              aria-label="Record type"
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value)}
              disabled={isLoading || recordTypes.length === 0}
              className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs"
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

      <nav className="flex-1 overflow-y-auto py-2">
        {NAV.map((sec) => {
          const sectionOpen = openSections[sec.section] ?? true;
          return (
            <div key={sec.section}>
              {!collapsed && (
                <button
                  type="button"
                  aria-expanded={sectionOpen}
                  onClick={() => toggleSection(sec.section)}
                  className="w-full flex items-center justify-between px-3.5 pt-3 pb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground hover:text-foreground bg-transparent border-0 cursor-pointer font-[inherit] text-left"
                >
                  <span>{sec.section}</span>
                  {sectionOpen ? <ChevronUpIcon className="size-3.5" /> : <ChevronDownIcon className="size-3.5" />}
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
                  const badgeTone =
                    item.to === "/review"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                      : "bg-primary/10 text-primary";
                  const dotTone = item.to === "/review" ? "bg-amber-500" : "bg-primary";
                  const IconCmp = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={withRecordType(item.to)}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        cn(
                          NAV_ITEM_BASE,
                          collapsed ? "justify-center mx-1.5" : "mx-2 px-3",
                          isActive && NAV_ITEM_ACTIVE,
                        )
                      }
                    >
                      <IconCmp className={collapsed ? "size-5" : "size-[18px]"} />
                      {!collapsed && (
                        <span className="flex-1">{item.label}</span>
                      )}
                      {!collapsed && badge !== undefined && badge > 0 && (
                        <Badge variant="secondary" className={cn("font-mono px-1.5 h-4 text-[10px]", badgeTone)}>
                          {badge}
                        </Badge>
                      )}
                      {collapsed && badge !== undefined && badge > 0 && (
                        <span className={cn("absolute top-1.5 right-1.5 size-1.5 rounded-full", dotTone)} />
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
