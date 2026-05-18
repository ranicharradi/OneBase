// TEMPORARY: scheduled for deletion in Phase 6.
// Wraps Lucide so existing <Icon name="..." /> callers keep working
// during the page-by-page migration. Each migrated page should
// replace `<Icon name="x" />` with direct Lucide imports.
import {
  Plus, Pencil, Trash2, Search, Info, AlertTriangle, XCircle,
  CheckCircle2, Users, LogOut, LogIn, Eye, EyeOff, Upload, Download,
  MoreVertical, MoreHorizontal, Filter, Settings, RefreshCw, Play,
  Pause, Command, Zap, UserCircle, Database, BarChart3, FileText,
  CheckSquare, X, Check, ChevronRight, ChevronLeft, ChevronDown,
  ChevronUp, ArrowLeft, ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, LucideIcon> = {
  add: Plus, edit: Pencil, delete: Trash2, search: Search,
  info: Info, warning: AlertTriangle, error: XCircle,
  check_circle: CheckCircle2, group: Users, people: Users,
  logout: LogOut, login: LogIn, visibility: Eye,
  visibility_off: EyeOff, upload: Upload, download: Download,
  more_vert: MoreVertical, more_horiz: MoreHorizontal,
  filter_list: Filter, settings: Settings, refresh: RefreshCw,
  play_arrow: Play, pause: Pause, keyboard_command_key: Command,
  bolt: Zap, account_circle: UserCircle, database: Database,
  storage: Database, analytics: BarChart3, description: FileText,
  task: CheckSquare, close: X, check: Check,
  chevron_right: ChevronRight, chevron_left: ChevronLeft,
  chevron_down: ChevronDown, chevron_up: ChevronUp,
  arrow_back: ArrowLeft, arrow_forward: ArrowRight,
};

interface IconProps {
  name: string;
  size?: number;
  className?: string;
}

export default function Icon({ name, size = 16, className }: IconProps) {
  const Cmp = ICON_MAP[name] ?? Info;
  return <Cmp className={cn(className)} style={{ width: size, height: size }} aria-hidden />;
}
