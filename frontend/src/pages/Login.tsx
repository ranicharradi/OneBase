// ── Login — terminal aesthetic, centered panel ──

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import Spinner from '../components/ui/Spinner';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login(username, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'var(--bg-0)',
      }}
    >
      <div className="fade" style={{ width: '100%', maxWidth: 360 }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div
            style={{
              width: 30,
              height: 30,
              background: 'var(--fg-0)',
              color: 'var(--bg-1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 14,
              fontFamily: 'IBM Plex Mono, monospace',
              borderRadius: 4,
            }}
          >
            1B
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>OneBase</span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--fg-2)' }}>
              records data ledger
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="panel" style={{ padding: 0 }}>
          <div className="panel-head">
            <span className="panel-title">Sign in</span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--fg-2)' }}>SSO unavailable · use credentials</span>
          </div>

          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && (
              <div
                className="pill danger"
                style={{ width: '100%', padding: '6px 10px', justifyContent: 'flex-start' }}
                role="alert"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>error</span>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor="username" className="label">Username</label>
              <input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input"
                placeholder="admin"
                autoComplete="username"
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor="password" className="label">Password</label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-accent"
              style={{ height: 32, justifyContent: 'center' }}
            >
              {isSubmitting ? (
                <>
                  <Spinner size={12} color="#fff" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <span className="kbd" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', borderColor: 'rgba(255,255,255,0.25)' }}>↵</span>
                </>
              )}
            </button>
          </div>

          <div
            style={{
              padding: '8px 14px',
              borderTop: '1px solid var(--border-0)',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 10,
              color: 'var(--fg-2)',
              fontFamily: 'IBM Plex Mono, monospace',
            }}
          >
            <span>v4.2.1</span>
            <span>onebase · enterprise edition</span>
          </div>
        </form>
      </div>
    </div>
  );
}
