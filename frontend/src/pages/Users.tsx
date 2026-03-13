// ── Users management page — list + create ──
// Dark Precision Editorial aesthetic — consistent with Sources page design language

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { User, UserCreate } from '../api/types';

// ── Deterministic gradient from username — gives each avatar unique personality ──
function avatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const gradients = [
    'from-accent-500/30 to-accent-600/10',
    'from-cyan-400/25 to-blue-600/10',
    'from-teal-400/25 to-cyan-600/10',
    'from-sky-400/25 to-indigo-600/10',
    'from-emerald-400/20 to-teal-600/10',
    'from-blue-400/25 to-cyan-600/10',
  ];
  return gradients[Math.abs(hash) % gradients.length];
}

// ── Notification toast — glass card with accent edge ──
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 animate-slideUp">
      <div
        className={`relative flex items-center gap-3 rounded-xl px-5 py-3.5 text-sm font-medium shadow-2xl overflow-hidden ${
          type === 'success'
            ? 'glass text-success-400'
            : 'glass text-danger-400'
        }`}
      >
        {/* Accent edge line */}
        <div
          className={`absolute left-0 top-0 bottom-0 w-[2px] ${
            type === 'success' ? 'bg-success-400' : 'bg-danger-400'
          }`}
        />
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

// ── Create User Modal — atmospheric with gradient border ──
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

    if (!username.trim()) {
      setFormError('Username is required');
      return;
    }
    if (password.length < 4) {
      setFormError('Password must be at least 4 characters');
      return;
    }

    mutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop with atmospheric blur */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

      {/* Modal card */}
      <div
        className="relative w-full max-w-md rounded-2xl border-gradient bg-surface-900 shadow-2xl shadow-black/50 animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient glow at top */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-48 bg-accent-500/[0.06] rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="relative flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent-500/10 border border-accent-500/20">
              <svg className="w-4 h-4 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
              </svg>
            </div>
            <h2 className="text-lg font-display text-white">New User</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-surface-500 hover:text-gray-200 hover:bg-white/[0.06] transition-all duration-200"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="relative p-6 space-y-5">
          {formError && (
            <div className="rounded-lg border border-danger-500/20 bg-danger-500/[0.06] px-4 py-3 text-sm text-danger-400 flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
              {formError}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-surface-500">
              Username <span className="text-danger-400">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. jane.smith"
              className="input-field"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-surface-500">
              Password <span className="text-danger-400">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 4 characters"
                className="input-field pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-surface-500 hover:text-accent-400 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  {showPassword ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  ) : (
                    <>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.04]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/[0.08] bg-surface-800/50 px-4 py-2.5 text-sm font-medium text-gray-400 transition-all duration-200 hover:bg-surface-700 hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn-primary"
            >
              {mutation.isPending && (
                <div className="w-3.5 h-3.5 border-2 border-surface-950/30 border-t-surface-950 rounded-full animate-spin" />
              )}
              Create User
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Loading Skeleton — table-shaped with shimmer ──
function UsersSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.04] card">
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/[0.06]">
            <th className="px-5 py-3.5 text-left"><div className="h-3 w-20 rounded animate-shimmer" /></th>
            <th className="px-5 py-3.5 text-left"><div className="h-3 w-14 rounded animate-shimmer" /></th>
            <th className="px-5 py-3.5 text-left"><div className="h-3 w-16 rounded animate-shimmer" /></th>
          </tr>
        </thead>
        <tbody>
          {[...Array(3)].map((_, i) => (
            <tr key={i} className="border-b border-white/[0.04]">
              <td className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg animate-shimmer" />
                  <div className="h-4 w-28 rounded animate-shimmer" />
                </div>
              </td>
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
  const [showCreate, setShowCreate] = useState(false);
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
      {/* Header — matches Sources page treatment */}
      <div className="flex items-center justify-between mb-8 animate-fadeIn">
        <div className="flex items-center gap-4">
          <div className="relative flex items-center justify-center w-11 h-11 rounded-xl bg-accent-500/10 border border-accent-500/20 glow-accent">
            <svg className="w-5 h-5 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-display text-white tracking-tight text-glow-accent">
              Users
            </h1>
            <p className="text-sm text-surface-500 font-body">
              Manage system users and access control
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
          </svg>
          New User
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-danger-500/20 bg-danger-500/[0.06] p-6 text-center animate-fadeIn">
          <svg className="w-8 h-8 text-danger-400/60 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
          <p className="text-sm text-danger-400">
            Failed to load users: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && <UsersSkeleton />}

      {/* Empty state — atmospheric with compelling CTA */}
      {!isLoading && !error && users?.length === 0 && (
        <div className="relative flex flex-col items-center justify-center rounded-2xl border border-white/[0.04] bg-surface-900/20 p-20 overflow-hidden animate-fadeIn">
          {/* Atmospheric background */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-accent-500/[0.03] rounded-full blur-3xl" />
            <div
              className="absolute inset-0 opacity-[0.02]"
              style={{
                backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.3) 1px, transparent 0)`,
                backgroundSize: '24px 24px',
              }}
            />
          </div>

          <div className="relative">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-accent-500/[0.06] border border-accent-500/15 mx-auto mb-5 animate-float">
              <svg className="w-8 h-8 text-accent-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <p className="text-lg font-display text-gray-200 mb-1 text-center">No users found</p>
            <p className="text-sm text-surface-500 mb-8 text-center max-w-xs leading-relaxed">
              Create the first user account to begin managing system access
            </p>
            <div className="flex justify-center">
              <button
                onClick={() => setShowCreate(true)}
                className="btn-primary"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
                </svg>
                Create First User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User table — atmospheric with staggered rows */}
      {!isLoading && users && users.length > 0 && (
        <div className="overflow-hidden rounded-xl card animate-fadeIn">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-400/70">
                  Username
                </th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-400/70">
                  Status
                </th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-400/70">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {users.map((user, index) => (
                <tr
                  key={user.id}
                  className={`transition-all duration-200 hover:bg-accent-500/[0.03] animate-slideUp stagger-${Math.min(index + 1, 8)}`}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      {/* Avatar with unique gradient per user */}
                      <div className={`relative flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br ${avatarGradient(user.username)} border border-accent-500/15 text-xs font-bold text-accent-300 uppercase`}>
                        {user.username.slice(0, 2)}
                      </div>
                      <span className="text-sm font-medium text-white">{user.username}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {user.is_active ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-success-500/10 border border-success-500/20 px-2.5 py-0.5 text-xs font-medium text-success-400 shadow-sm shadow-success-500/10">
                        <span className="w-1.5 h-1.5 rounded-full bg-success-400 animate-pulse" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-700/30 border border-white/[0.06] px-2.5 py-0.5 text-xs font-medium text-surface-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-surface-500" />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm text-surface-500">
                    {new Date(user.created_at).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Footer with count — styled as status bar */}
          <div className="border-t border-white/[0.04] bg-surface-900/50 px-5 py-3 flex items-center justify-between">
            <p className="text-xs text-surface-500 flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-surface-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
              {users.length} user{users.length !== 1 ? 's' : ''} total
            </p>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-success-400/50" />
              <span className="text-[11px] text-surface-600">
                {users.filter(u => u.is_active).length} active
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={(msg) => showToast(msg)}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
