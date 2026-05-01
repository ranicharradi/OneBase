// ── Users management — terminal aesthetic ──

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import type { User, UserCreate } from '../api/types';
import Panel, { PanelHead } from '../components/ui/Panel';
import Pill from '../components/ui/Pill';
import Spinner from '../components/ui/Spinner';
import type { PillTone } from '../components/ui/Pill';

const ROLES = ['admin', 'reviewer', 'viewer'] as const;

const ROLE_TONES: Record<string, PillTone> = {
  admin: 'accent',
  reviewer: 'info',
  viewer: 'neutral',
};

// Deterministic per-user palette so each username has a stable colored avatar
const AVATAR_PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: 'var(--accent-soft)', fg: 'var(--accent)' },
  { bg: 'var(--info-soft)',   fg: 'var(--info)'   },
  { bg: 'var(--ok-soft)',     fg: 'var(--ok)'     },
  { bg: 'var(--warn-soft)',   fg: 'var(--warn)'   },
  { bg: 'var(--danger-soft)', fg: 'var(--danger)' },
  { bg: 'var(--bg-3)',        fg: 'var(--fg-1)'   },
];

function avatarTone(name: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function Avatar({ username, size = 28 }: { username: string; size?: number }) {
  const tone = avatarTone(username);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        background: tone.bg,
        color: tone.fg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'IBM Plex Mono, monospace',
        fontWeight: 700,
        fontSize: Math.max(10, Math.round(size * 0.4)),
        textTransform: 'uppercase',
        letterSpacing: '-0.02em',
        flexShrink: 0,
      }}
    >
      {username.slice(0, 2)}
    </div>
  );
}

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
      onCreated(`User "${username}" created`);
      onClose();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!username.trim()) return setFormError('Username is required');
    if (password.length < 4) return setFormError('Password must be at least 4 characters');
    mutation.mutate();
  };

  return (
    <div className="backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <Panel
        className="fade"
        style={{ width: '100%', maxWidth: 440, boxShadow: 'var(--shadow-lg)' }}
      >
        <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
          <PanelHead>
            <span className="panel-title">New user</span>
            <button type="button" onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: 4 }} aria-label="Close">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
            </button>
          </PanelHead>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {formError && (
              <div className="pill danger" style={{ width: '100%', padding: '6px 10px', justifyContent: 'flex-start' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>error</span>
                {formError}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="label">
                Username <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. jane.smith"
                className="input"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="label">
                Password <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="min 4 characters"
                  className="input"
                  style={{ width: '100%', paddingRight: 32 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="btn btn-ghost btn-sm"
                  style={{ position: 'absolute', right: 4, top: 2, padding: 4, height: 22 }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>
          </div>
          <div
            style={{
              padding: '10px 14px',
              borderTop: '1px solid var(--border-0)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
            }}
          >
            <button type="button" onClick={onClose} className="btn btn-sm">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn btn-sm btn-accent">
              {mutation.isPending && <Spinner size={10} color="#fff" />}
              Create user
            </button>
          </div>
        </form>
      </Panel>
    </div>
  );
}

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
    mutationFn: () =>
      api.post<User>(`/api/users/${target.id}/change-password`, { new_password: newPassword }),
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
    if (!username.trim()) return setFormError('Username is required');
    updateMutation.mutate();
  };

  const handlePasswordReset = () => {
    setFormError('');
    if (newPassword.length < 4) return setFormError('Password must be at least 4 characters');
    passwordMutation.mutate();
  };

  const isPending =
    updateMutation.isPending ||
    passwordMutation.isPending ||
    toggleMutation.isPending ||
    deleteMutation.isPending;

  return (
    <div className="backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <Panel
        className="fade"
        style={{ width: '100%', maxWidth: 520, boxShadow: 'var(--shadow-lg)' }}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <PanelHead>
            <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar username={target.username} size={26} />
              <span>
                Edit user — <span className="mono" style={{ fontWeight: 500 }}>{target.username}</span>
                {isSelf && <span style={{ color: 'var(--fg-2)', marginLeft: 6, fontWeight: 400 }}>(you)</span>}
              </span>
            </span>
            <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: 4 }} aria-label="Close">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
            </button>
          </PanelHead>

          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {formError && (
              <div className="pill danger" style={{ width: '100%', padding: '6px 10px', justifyContent: 'flex-start' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>error</span>
                {formError}
              </div>
            )}

            {/* Profile */}
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="label">Profile</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 10 }}>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input"
                  placeholder="Username"
                />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="input mono"
                  disabled={isSelf}
                  style={{ fontSize: 12 }}
                >
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {isSelf && (
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>
                  Cannot change your own role
                </span>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  disabled={isPending || (username === target.username && role === target.role)}
                  className="btn btn-sm btn-accent"
                >
                  {updateMutation.isPending && <Spinner size={10} color="#fff" />}
                  Save changes
                </button>
              </div>
            </form>

            <div style={{ borderTop: '1px solid var(--border-0)' }} />

            {/* Password reset */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="label">Reset password</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password (min 4 chars)"
                    className="input"
                    style={{ width: '100%', paddingRight: 32 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="btn btn-ghost btn-sm"
                    style={{ position: 'absolute', right: 4, top: 2, padding: 4, height: 22 }}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={isPending || !newPassword}
                  className="btn btn-sm"
                >
                  {passwordMutation.isPending && <Spinner size={10} />}
                  Reset
                </button>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border-0)' }} />

            {/* Danger zone */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="label" style={{ color: 'var(--danger)' }}>Danger zone</div>
              {isSelf ? (
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>
                  You cannot deactivate or delete your own account.
                </span>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => toggleMutation.mutate()}
                    disabled={isPending}
                    className={target.is_active ? 'btn btn-sm btn-danger' : 'btn btn-sm'}
                  >
                    {toggleMutation.isPending ? (
                      <Spinner size={10} color={target.is_active ? 'var(--danger)' : undefined} />
                    ) : (
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
                        {target.is_active ? 'block' : 'check_circle'}
                      </span>
                    )}
                    {target.is_active ? 'Deactivate' : 'Activate'}
                  </button>

                  {!confirmDelete ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      disabled={isPending}
                      className="btn btn-sm btn-danger"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>delete</span>
                      Delete user
                    </button>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 500 }}>
                        Confirm?
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate()}
                        disabled={isPending}
                        className="btn btn-sm"
                        style={{ background: 'var(--danger)', color: '#fff', borderColor: 'var(--danger)' }}
                      >
                        {deleteMutation.isPending && <Spinner size={10} color="#fff" />}
                        Yes, delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="btn btn-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </Panel>
    </div>
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
    <div className="scroll" style={{ height: '100%' }}>
      <div style={{ padding: 20 }}>
        <div className="fade" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Users & access</h1>
            <div style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 2 }}>
              {users
                ? `${users.length} user${users.length === 1 ? '' : 's'} · ${activeCount} active · ${adminCount} admin`
                : 'Loading…'}
            </div>
          </div>
          {isAdmin && (
            <button onClick={() => setShowCreate(true)} className="btn btn-sm btn-primary">
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>person_add</span>
              Add user
            </button>
          )}
        </div>

        <Panel className="fade">
          {error ? (
            <div style={{ padding: 28, textAlign: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--danger)' }}>error</span>
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>
                Failed to load users: {error instanceof Error ? error.message : 'Unknown error'}
              </div>
            </div>
          ) : isLoading ? (
            <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: 'var(--fg-2)' }}>
              Loading users…
            </div>
          ) : !users || users.length === 0 ? (
            <div style={{ padding: 36, textAlign: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--fg-3)' }}>group</span>
              <div style={{ fontSize: 14, fontWeight: 500, marginTop: 10 }}>No users yet</div>
              <div style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 4, marginBottom: 12 }}>
                Create the first user account to begin managing system access.
              </div>
              {isAdmin && (
                <button onClick={() => setShowCreate(true)} className="btn btn-sm btn-accent">
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>person_add</span>
                  Create first user
                </button>
              )}
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 34 }} />
                  <th>Username</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  {isAdmin && <th style={{ width: 80 }} />}
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td>
                      <Avatar username={user.username} size={26} />
                    </td>
                    <td>
                      <span className="mono" style={{ fontWeight: 500 }}>{user.username}</span>
                      {user.id === currentUser?.id && (
                        <span style={{ fontSize: 10, color: 'var(--accent)', marginLeft: 6 }}>(you)</span>
                      )}
                    </td>
                    <td>
                      <Pill tone={ROLE_TONES[user.role] ?? 'neutral'}>
                        {user.role}
                      </Pill>
                    </td>
                    <td>
                      {user.is_active ? (
                        <Pill tone="ok" dot>active</Pill>
                      ) : (
                        <Pill tone="neutral" dot>inactive</Pill>
                      )}
                    </td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>
                      {new Date(user.created_at).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    {isAdmin && (
                      <td>
                        <button
                          onClick={() => setEditTarget(user)}
                          className="btn btn-ghost btn-sm"
                          aria-label={`Edit ${user.username}`}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>edit</span>
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      {showCreate && (
        <CreateUserModal onClose={() => setShowCreate(false)} onCreated={(msg) => showToast(msg)} />
      )}
      {editTarget && currentUser && (
        <EditUserModal
          target={editTarget}
          currentUser={currentUser}
          onClose={() => setEditTarget(null)}
          onSaved={(msg) => showToast(msg)}
        />
      )}

      {/* Inline toast — bottom-right (slim, terminal style) */}
      {toast && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            bottom: 36,
            right: 16,
            zIndex: 250,
            background: 'var(--bg-1)',
            border: `1px solid var(--border-1)`,
            borderLeft: `3px solid var(--${toast.type === 'success' ? 'ok' : 'danger'})`,
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-lg)',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: 'var(--fg-0)',
          }}
          className="fade"
        >
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: 14,
              color: `var(--${toast.type === 'success' ? 'ok' : 'danger'})`,
            }}
          >
            {toast.type === 'success' ? 'check_circle' : 'error'}
          </span>
          {toast.message}
          <button
            onClick={() => setToast(null)}
            className="btn btn-ghost btn-sm"
            style={{ padding: 2, height: 18 }}
            aria-label="Dismiss"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>close</span>
          </button>
        </div>
      )}
    </div>
  );
}
