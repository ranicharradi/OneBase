import { useNavigate } from "react-router";
import { UsersIcon, LogOutIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

interface AvatarMenuProps {
  username: string | undefined;
  isAdmin: boolean;
  onLogout: () => void;
}

export default function AvatarMenu({ username, isAdmin, onLogout }: AvatarMenuProps) {
  const navigate = useNavigate();
  const initial = (username?.[0] ?? "?").toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Account menu"
          title={username ?? "Account"}
          className="flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[11px] font-semibold border-none cursor-pointer flex-shrink-0 size-[22px]"
        >
          {initial}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[160px]">
        {username && (
          <>
            <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-block size-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="truncate">{username}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}

        {isAdmin && (
          <>
            <DropdownMenuItem onClick={() => navigate("/users")}>
              <UsersIcon className="mr-2 size-4" />
              Admin access
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuItem onClick={onLogout}>
          <LogOutIcon className="mr-2 size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
