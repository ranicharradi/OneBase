import { SearchIcon, ChevronRightIcon, MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import AvatarMenu from "./AvatarMenu";

interface TopBarProps {
  breadcrumb: string[];
  onOpenPalette: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  username: string | undefined;
  isAdmin: boolean;
  onLogout: () => void;
}

export default function TopBar({
  breadcrumb,
  onOpenPalette,
  theme,
  onToggleTheme,
  username,
  isAdmin,
  onLogout,
}: TopBarProps) {
  return (
    <div className="flex items-center gap-3 h-12 px-4 border-b border-border bg-card">
      {breadcrumb.length > 0 && (
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          {breadcrumb.map((b, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5"
            >
              {i > 0 && <ChevronRightIcon className="size-2.5" />}
              <span
                className={
                  i === breadcrumb.length - 1
                    ? "text-foreground font-medium"
                    : "text-muted-foreground font-normal"
                }
              >
                {b}
              </span>
            </span>
          ))}
        </div>
      )}

      <div className="flex-1" />

      <button
        onClick={onOpenPalette}
        className="flex items-center gap-2.5 px-2.5 h-[26px] min-w-[260px] bg-muted border border-border rounded cursor-pointer text-muted-foreground font-[inherit] text-xs"
        aria-label="Open command palette"
      >
        <SearchIcon className="size-3 shrink-0" />
        <span className="flex-1 text-left">
          Jump to, search, run…
        </span>
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted text-muted-foreground">⌘</span>
      </button>

      <Button
        variant="ghost"
        size="xs"
        onClick={onToggleTheme}
        className="p-1"
        title={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
        aria-label="Toggle theme"
      >
        {theme === "light" ? <MoonIcon className="size-3.5" /> : <SunIcon className="size-3.5" />}
      </Button>

      <AvatarMenu username={username} isAdmin={isAdmin} onLogout={onLogout} />
    </div>
  );
}
