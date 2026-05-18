// ── Users management ──

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import type { User, UserCreate } from '../api/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import Spinner from '../components/ui/Spinner';
import { LoadingErrorEmpty } from '../components/ui/LoadingErrorEmpty';
import {
  UserPlusIcon,
  EyeIcon,
  EyeOffIcon,
  PencilIcon,
  XCircleIcon,
  CheckCircle2Icon,
  CheckIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';

const ROLES = ['admin', 'reviewer', 'viewer'] as const;

// Deterministic per-user palette so each username has a stable colored avatar
const AVATAR_CLASSES: Array<{ bg: string; fg: string }> = [
  { bg: 'bg-primary/10',          fg: 'text-primary'       },
  { bg: 'bg-sky-100 dark:bg-sky-950',    fg: 'text-sky-700 dark:text-sky-300'     },
  { bg: 'bg-emerald-100 dark:bg-emerald-950', fg: 'text-emerald-700 dark:text-emerald-300' },
  { bg: 'bg-amber-100 dark:bg-amber-950',   fg: 'text-amber-700 dark:text-amber-300'   },
  { bg: 'bg-destructive/10',       fg: 'text-destructive'   },
  { bg: 'bg-secondary',            fg: 'text-secondary-foreground' },
];

function avatarClasses(name: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_CLASSES[Math.abs(hash) % AVATAR_CLASSES.length];
}

function Avatar({ username, size = 28 }: { username: string; size?: number }) {
  const tone = avatarClasses(username);
  return (
    <div
      className={`shrink-0 rounded-md flex items-center justify-center font-mono font-bold uppercase tracking-tight ${tone.bg} ${tone.fg}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.4)),
        letterSpacing: '-0.02em',
      }}
    >
      {username.slice(0, 2)}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === 'admin') {
    return <Badge variant="secondary">{role}</Badge>;
  }
  if (role === 'reviewer') {
    return (
      <Badge variant="secondary" className="bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
        {role}
      </Badge>
    );
  }
  return <Badge variant="outline">{role}</Badge>;
}

function CreateUserModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (msg: string) => void;
}) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const body: UserCreate = { username, password };
      return api.post<User>('/api/auth/users', body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onCreated(`User "${username}" created`);
      onClose();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    if (!username.trim()) return setFormError('Username is required');
    if (password.length < 4) return setFormError('Password must be at least 4 characters');
    mutation.mutate();
  };

  const handleClose = () => {
    setUsername('');
    setPassword('');
    setFormError('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New user</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {formError && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <XCircleIcon className="size-4 shrink-0" />
              {formError}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="create-username">
              Username <span className="text-destructive">*</span>
            </Label>
            <Input
              id="create-username"
              type="text"
              required
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. jane.smith"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="create-password">
              Password <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="create-password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="min 4 characters"
                className="pr-8"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-0.5 top-0.5"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Spinner size={14} />}
              Create user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserModal({
  target,
  currentUser,
  open,
  onClose,
  onSaved,
}: {
  target: User | null;
  currentUser: User;
  open: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState(target?.username ?? '');
  const [role, setRole] = useState(target?.role ?? 'viewer');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isSelf = target?.id === currentUser.id;

  const updateMutation = useMutation({
    mutationFn: () => api.put<User>(`/api/users/${target?.id}`, { username, role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onSaved(`User "${username}" updated`);
      onClose();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const passwordMutation = useMutation({
    mutationFn: () =>
      api.post<User>(`/api/users/${target?.id}/change-password`, { new_password: newPassword }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onSaved(`Password changed for "${target?.username}"`);
      onClose();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: () => api.post<User>(`/api/users/${target?.id}/toggle-active`, {}),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onSaved(`User "${target?.username}" ${updated.is_active ? 'activated' : 'deactivated'}`);
      onClose();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/users/${target?.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onSaved(`User "${target?.username}" deleted`);
      onClose();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    if (!username.trim()) return setFormError('Username is required');
    updateMutation.mutate();
  };

  const handlePasswordReset = () => {
    setFormError('');
    if (newPassword.length < 4) return setFormError('Password must be at least 4 characters');
    passwordMutation.mutate();
  };

  const handleClose = () => {
    setFormError('');
    setConfirmDelete(false);
    setNewPassword('');
    onClose();
  };

  const isPending =
    updateMutation.isPending ||
    passwordMutation.isPending ||
    toggleMutation.isPending ||
    deleteMutation.isPending;

  if (!target) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2.5">
              <Avatar username={target.username} size={26} />
              <span>
                Edit user —{' '}
                <span className="font-mono font-medium">{target.username}</span>
                {isSelf && <span className="ml-1.5 text-sm font-normal text-muted-foreground">(you)</span>}
              </span>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {formError && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <XCircleIcon className="size-4 shrink-0" />
              {formError}
            </div>
          )}

          {/* Profile */}
          <form onSubmit={handleSave} className="flex flex-col gap-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Profile</div>
            <div className="grid grid-cols-[1fr_160px] gap-2.5">
              <Input
                id="edit-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
              />
              <Select
                value={role}
                onValueChange={(v) => setRole(v)}
                disabled={isSelf}
              >
                <SelectTrigger className="font-mono text-xs w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => (
                    <SelectItem key={r} value={r} className="font-mono text-xs">{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isSelf && (
              <span className="font-mono text-[10px] text-muted-foreground">
                Cannot change your own role
              </span>
            )}
            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                disabled={isPending || (username === target.username && role === target.role)}
              >
                {updateMutation.isPending && <Spinner size={12} />}
                Save changes
              </Button>
            </div>
          </form>

          <div className="border-t border-border" />

          {/* Password reset */}
          <div className="flex flex-col gap-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reset password</div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password (min 4 chars)"
                  className="pr-8"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-0.5 top-0.5"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePasswordReset}
                disabled={isPending || !newPassword}
              >
                {passwordMutation.isPending && <Spinner size={12} />}
                Reset
              </Button>
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Danger zone */}
          <div className="flex flex-col gap-2">
            <div className="text-xs font-medium text-destructive uppercase tracking-wide">Danger zone</div>
            {isSelf ? (
              <span className="font-mono text-[11px] text-muted-foreground">
                You cannot deactivate or delete your own account.
              </span>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={target.is_active ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={() => toggleMutation.mutate()}
                  disabled={isPending}
                >
                  {toggleMutation.isPending ? (
                    <Spinner size={12} />
                  ) : target.is_active ? (
                    <XCircleIcon className="size-3.5" />
                  ) : (
                    <CheckCircle2Icon className="size-3.5" />
                  )}
                  {target.is_active ? 'Deactivate' : 'Activate'}
                </Button>

                {!confirmDelete ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmDelete(true)}
                    disabled={isPending}
                  >
                    <Trash2Icon className="size-3.5" />
                    Delete user
                  </Button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-destructive">Confirm?</span>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteMutation.mutate()}
                      disabled={isPending}
                    >
                      {deleteMutation.isPending && <Spinner size={12} />}
                      Yes, delete
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Users() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data: users, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<User[]>('/api/users'),
  });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const adminCount = users?.filter(u => u.role === 'admin').length ?? 0;
  const activeCount = users?.filter(u => u.is_active).length ?? 0;

  return (
    <div className="overflow-y-auto h-full">
      <div className="p-5">
        <div className="flex items-center justify-between mb-3.5">
          <div>
            <h1 className="text-lg font-semibold">Users &amp; access</h1>
            <div className="text-xs text-muted-foreground mt-0.5">
              {users
                ? `${users.length} user${users.length === 1 ? '' : 's'} · ${activeCount} active · ${adminCount} admin`
                : 'Loading…'}
            </div>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <UserPlusIcon className="size-3.5" />
              Add user
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="pt-4">
            <LoadingErrorEmpty
              loading={isLoading}
              error={error ? `Failed to load users: ${error instanceof Error ? error.message : String(error)}` : null}
              empty={!users || users.length === 0}
              emptyMessage="No users yet"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-9" />
                    <TableHead>Username</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    {isAdmin && <TableHead className="w-20" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(users ?? []).map(user => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <Avatar username={user.username} size={26} />
                      </TableCell>
                      <TableCell>
                        <span className="font-mono font-medium">{user.username}</span>
                        {user.id === currentUser?.id && (
                          <span className="ml-1.5 text-[10px] text-primary">(you)</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <RoleBadge role={user.role} />
                      </TableCell>
                      <TableCell>
                        {user.is_active ? (
                          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                            active
                          </Badge>
                        ) : (
                          <Badge variant="outline">inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditTarget(user)}
                            aria-label={`Edit ${user.username}`}
                          >
                            <PencilIcon className="size-3.5" />
                            Edit
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </LoadingErrorEmpty>
          </CardContent>
        </Card>
      </div>

      <CreateUserModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(msg) => showToast(msg)}
      />

      {currentUser && (
        <EditUserModal
          target={editTarget}
          currentUser={currentUser}
          open={editTarget !== null}
          onClose={() => setEditTarget(null)}
          onSaved={(msg) => showToast(msg)}
        />
      )}

      {/* Inline toast — bottom-right */}
      {toast && (
        <div
          role="alert"
          className="fixed bottom-9 right-4 z-[250] flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground shadow-lg"
          style={{ borderLeft: `3px solid ${toast.type === 'success' ? 'var(--color-emerald-500, #10b981)' : 'hsl(var(--destructive))'}` }}
        >
          {toast.type === 'success' ? (
            <CheckIcon className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <XCircleIcon className="size-3.5 text-destructive shrink-0" />
          )}
          {toast.message}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
          >
            <XIcon className="size-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
