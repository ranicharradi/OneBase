// ── Users management page — list + create + edit + deactivate ──
// Light glassmorphism aesthetic — glass cards, clean typography, subtle borders

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import type { User, UserCreate } from '../api/types';

const ROLES = ['admin', 'reviewer', 'viewer'] as const;

// ── Deterministic gradient from username — gives each avatar unique personality ──
function avatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const gradients = [
    'from-accent-600/20 to-accent-700/10',
    'from-cyan-500/20 to-blue-600/10',
    'from-teal-500/20 to-cyan-600/10',
    'from-sky-500/20 to-indigo-600/10',
    'from-emerald-500/15 to-teal-600/10',
    'from-blue-500/20 to-cyan-600/10',
  ];
  return gradients[Math.abs(hash) % gradients.length];
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    admin: 'text-accent-600 bg-accent-600/10 border-accent-600/20',
    reviewer: 'text-secondary-500 bg-secondary-500/10 border-secondary-500/20',
    viewer: 'text-on-surface-variant/70 bg-white/30 border-on-surface/10',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${styles[role] || styles.viewer}`}>
      {role}
    </span>
  );
}

// ── Notification toast — glass card with accent edge ──
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 animate-slideUp">
      <div
        className={`relative flex items-center gap-3 rounded-xl px-5 py-3.5 text-sm font-medium shadow-2xl overflow-hidden bg-white backdrop-blur-sm ${
          type === 'success' ? 'text-success-500' : 'text-danger-500'
        }`}
      >
        <div className={`absolute left-0 top-0 bottom-0 w-[2px] ${type === 'success' ? 'bg-success-500' : 'bg-danger-500'}`} />
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {type === 'success' ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          )}
        </svg>
        <span className="font-body">{message}</span>
        <button onClick={onClose} className="ml-3 opacity-60 hover:opacity-100 transition-opacity">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Create User Modal ──
function CreateUserModal({
  onClose,
  onCreated,
}: {
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
      onCreated(`User "${username}" created successfully`);
      onClose();
    },
    onError: (err: Error) => {
      setFormError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!username.trim()) { setFormError('Username is required'); return; }
    if (password.length < 4) { setFormError('Password must be at least 4 characters'); return; }
    mutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-md" />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl animate-scaleIn" onClick={(e) => e.stopPropagation()}>
        <div className="relative flex items-center justify-between border-b border-on-surface/5 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent-600/10">
              <span className="material-symbols-outlined text-base text-accent-600">person_add</span>
            </div>
            <h2 className="text-lg font-display font-extrabold text-on-surface">New User</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-on-surface-variant/60 hover:text-on-surface hover:bg-white/40 transition-all duration-200">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="relative p-6 space-y-5">
          {formError && (
            <div className="rounded-lg border border-danger-500/20 bg-danger-500/[0.08] px-4 py-3 text-sm text-danger-500 flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
              {formError}
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-on-surface-variant/60">
              Username <span className="text-danger-500">*</span>
            </label>
            <input type="text" required autoFocus value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. jane.smith" className="input-field" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-on-surface-variant/60">
              Password <span className="text-danger-500">*</span>
            </label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 4 characters" className="input-field pr-10" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-on-surface-variant/60 hover:text-accent-600 transition-colors">
                <span className="material-symbols-outlined text-base">{showPassword ? 'visibility_off' : 'visibility'}</span>
              </button>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-on-surface/[0.06]">
            <button type="button" onClick={onClose} className="rounded-lg border border-white/60 bg-white/40 px-4 py-2.5 text-sm font-medium text-on-surface-variant transition-all duration-200 hover:bg-white/60 hover:text-on-surface">
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary">
              {mutation.isPending && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Create User
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit User Modal ──
function EditUserModal({
  target,
  currentUser,
  onClose,
  onSaved,
}: {
  target: User;
  currentUser: User;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState(target.username);
  const [role, setRole] = useState(target.role);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isSelf = target.id === currentUser.id;

  const updateMutation = useMutation({
    mutationFn: () => api.put<User>(`/api/users/${target.id}`, { username, role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onSaved(`User "${username}" updated`);
      onClose();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const passwordMutation = useMutation({
    mutationFn: () => api.post<User>(`/api/users/${target.id}/change-password`, { new_password: newPassword }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onSaved(`Password changed for "${target.username}"`);
      onClose();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: () => api.post<User>(`/api/users/${target.id}/toggle-active`, {}),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onSaved(`User "${target.username}" ${updated.is_active ? 'activated' : 'deactivated'}`);
      onClose();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/users/${target.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onSaved(`User "${target.username}" deleted`);
      onClose();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!username.trim()) { setFormError('Username is required'); return; }
    updateMutation.mutate();
  };

  const handlePasswordReset = () => {
    setFormError('');
    if (newPassword.length < 4) { setFormError('Password must be at least 4 characters'); return; }
    passwordMutation.mutate();
  };

  const isPending = updateMutation.isPending || passwordMutation.isPending || toggleMutation.isPending || deleteMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-md" />
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl animate-scaleIn" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="relative flex items-center justify-between border-b border-on-surface/5 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className={`flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br ${avatarGradient(target.username)} border border-accent-600/15 text-xs font-bold text-accent-600 uppercase`}>
              {target.username.slice(0, 2)}
            </div>
            <div>
              <h2 className="text-lg font-display font-extrabold text-on-surface">Edit User</h2>
              <p className="text-xs text-on-surface-variant/60">{target.username}{isSelf ? ' (you)' : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-on-surface-variant/60 hover:text-on-surface hover:bg-white/40 transition-all">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {formError && (
            <div className="rounded-lg border border-danger-500/20 bg-danger-500/[0.08] px-4 py-3 text-sm text-danger-500 flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
              {formError}
            </div>
          )}

          {/* Profile section */}
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-on-surface-variant/60">Username</label>
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-on-surface-variant/60">Role</label>
                <select value={role} onChange={(e) => setRole(e.target.value)} className="input-field text-sm" disabled={isSelf}>
                  {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
                {isSelf && <p className="text-[10px] text-on-surface-variant/40 mt-1">Cannot change your own role</p>}
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={isPending || (username === target.username && role === target.role)} className="btn-primary text-sm px-4 py-2">
                {updateMutation.isPending && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Save Changes
              </button>
            </div>
          </form>

          <hr className="border-on-surface/[0.06]" />

          {/* Password reset */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant/60">Reset Password</label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password (min 4 chars)"
                  className="input-field pr-10 text-sm"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-on-surface-variant/60 hover:text-accent-600 transition-colors">
                  <span className="material-symbols-outlined text-base">{showPassword ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
              <button
                type="button"
                onClick={handlePasswordReset}
                disabled={isPending || !newPassword}
                className="rounded-lg border border-on-surface/10 bg-white/40 px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-white/60 hover:text-on-surface transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {passwordMutation.isPending ? <div className="w-3 h-3 border-2 border-on-surface/30 border-t-on-surface rounded-full animate-spin" /> : 'Reset'}
              </button>
            </div>
          </div>

          <hr className="border-on-surface/[0.06]" />

          {/* Danger zone */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-danger-500/60">Danger Zone</label>
            <div className="flex items-center gap-3">
              {/* Toggle active */}
              {!isSelf && (
                <button
                  type="button"
                  onClick={() => toggleMutation.mutate()}
                  disabled={isPending}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all disabled:opacity-40 ${
                    target.is_active
                      ? 'border-danger-500/20 bg-danger-500/[0.06] text-danger-500 hover:bg-danger-500/10'
                      : 'border-success-500/20 bg-success-bg text-success-500 hover:bg-success-500/15'
                  }`}
                >
                  {toggleMutation.isPending
                    ? <div className="w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    : target.is_active ? 'Deactivate' : 'Activate'
                  }
                </button>
              )}

              {/* Delete */}
              {!isSelf && !confirmDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={isPending}
                  className="rounded-lg border border-danger-500/20 bg-danger-500/[0.06] px-4 py-2 text-sm font-medium text-danger-500 hover:bg-danger-500/10 transition-all disabled:opacity-40"
                >
                  Delete User
                </button>
              )}
              {!isSelf && confirmDelete && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-danger-500 font-medium">Are you sure?</span>
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate()}
                    disabled={isPending}
                    className="rounded-lg bg-danger-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-danger-500/90 transition-colors"
                  >
                    {deleteMutation.isPending ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Yes, delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-lg border border-on-surface/10 bg-white/40 px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:bg-white/60 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {isSelf && (
                <p className="text-xs text-on-surface-variant/40">You cannot deactivate or delete your own account</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Loading Skeleton ──
function UsersSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-on-surface/[0.06] card">
      <table className="w-full">
        <thead>
          <tr className="border-b border-on-surface/5">
            <th className="px-5 py-3.5 text-left"><div className="h-3 w-20 rounded animate-shimmer" /></th>
            <th className="px-5 py-3.5 text-left"><div className="h-3 w-14 rounded animate-shimmer" /></th>
            <th className="px-5 py-3.5 text-left"><div className="h-3 w-16 rounded animate-shimmer" /></th>
            <th className="px-5 py-3.5 text-left"><div className="h-3 w-16 rounded animate-shimmer" /></th>
          </tr>
        </thead>
        <tbody>
          {[...Array(3)].map((_, i) => (
            <tr key={i} className="border-b border-on-surface/[0.06]">
              <td className="px-5 py-4"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-lg animate-shimmer" /><div className="h-4 w-28 rounded animate-shimmer" /></div></td>
              <td className="px-5 py-4"><div className="h-5 w-16 rounded-full animate-shimmer" /></td>
              <td className="px-5 py-4"><div className="h-5 w-16 rounded-full animate-shimmer" /></td>
              <td className="px-5 py-4"><div className="h-4 w-20 rounded animate-shimmer" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ──
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

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8 animate-fadeIn">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-accent-600/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-accent-600">group</span>
          </div>
          <div>
            <h1 className="text-2xl font-display font-extrabold text-on-surface tracking-tight">Users</h1>
            <p className="text-sm text-on-surface-variant/60 font-body">Manage system users and access control</p>
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <span className="material-symbols-outlined text-lg">person_add</span>
            New User
          </button>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-danger-500/20 bg-danger-500/[0.08] p-6 text-center animate-fadeIn">
          <span className="material-symbols-outlined text-3xl text-danger-500/60 mb-2 block">warning</span>
          <p className="text-sm text-danger-500">Failed to load users: {error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      )}

      {isLoading && <UsersSkeleton />}

      {/* Empty state */}
      {!isLoading && !error && users?.length === 0 && (
        <div className="relative flex flex-col items-center justify-center rounded-2xl border border-on-surface/[0.06] bg-white/15 p-20 overflow-hidden animate-fadeIn">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-accent-600/[0.03] rounded-full blur-3xl" />
          </div>
          <div className="relative">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-accent-600/[0.06] border border-accent-600/15 mx-auto mb-5 animate-float">
              <span className="material-symbols-outlined text-3xl text-accent-600/60">group</span>
            </div>
            <p className="text-lg font-display font-extrabold text-on-surface mb-1 text-center">No users found</p>
            <p className="text-sm text-on-surface-variant/60 mb-8 text-center max-w-xs leading-relaxed">Create the first user account to begin managing system access</p>
            {isAdmin && (
              <div className="flex justify-center">
                <button onClick={() => setShowCreate(true)} className="btn-primary">
                  <span className="material-symbols-outlined text-lg">person_add</span>
                  Create First User
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* User table */}
      {!isLoading && users && users.length > 0 && (
        <div className="overflow-hidden rounded-xl card animate-fadeIn">
          <table className="w-full">
            <thead>
              <tr className="border-b border-on-surface/5">
                <th className="px-5 py-3.5 text-left text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest">Username</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest">Role</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest">Status</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest">Created</th>
                {isAdmin && (
                  <th className="px-5 py-3.5 text-right text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-on-surface/[0.06]">
              {users.map((user, index) => (
                <tr
                  key={user.id}
                  className={`transition-all duration-200 hover:bg-white/30 animate-slideUp stagger-${Math.min(index + 1, 8)}`}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`relative flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br ${avatarGradient(user.username)} border border-accent-600/15 text-xs font-bold text-accent-600 uppercase`}>
                        {user.username.slice(0, 2)}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-on-surface">{user.username}</span>
                        {user.id === currentUser?.id && (
                          <span className="ml-2 text-[10px] text-accent-600 font-medium">(you)</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="px-5 py-4">
                    {user.is_active ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-success-bg border border-success-500/20 px-2.5 py-0.5 text-xs font-medium text-success-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-success-500 animate-pulse" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/30 border border-on-surface/[0.06] px-2.5 py-0.5 text-xs font-medium text-on-surface-variant/60">
                        <span className="w-1.5 h-1.5 rounded-full bg-on-surface-variant/40" />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm text-on-surface-variant/60">
                    {new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                  {isAdmin && (
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => setEditTarget(user)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-600 hover:text-accent-600/80 transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">edit</span>
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Footer */}
          <div className="border-t border-on-surface/[0.06] bg-white/30 px-5 py-3 flex items-center justify-between">
            <p className="text-xs text-on-surface-variant/60 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-outline">group</span>
              {users.length} user{users.length !== 1 ? 's' : ''} total
            </p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-success-500/50" />
                <span className="text-[11px] text-outline">{users.filter(u => u.is_active).length} active</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-accent-600/50" />
                <span className="text-[11px] text-outline">{users.filter(u => u.role === 'admin').length} admin</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateUserModal onClose={() => setShowCreate(false)} onCreated={(msg) => showToast(msg)} />
      )}

      {/* Edit Modal */}
      {editTarget && currentUser && (
        <EditUserModal
          target={editTarget}
          currentUser={currentUser}
          onClose={() => setEditTarget(null)}
          onSaved={(msg) => showToast(msg)}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
