// ── Login page — dark precision editorial with atmospheric depth ──

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../hooks/useAuth';

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
      navigate('/sources', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-surface-950 px-4 overflow-hidden">
      {/* ── Atmospheric background layers ── */}
      <div className="pointer-events-none absolute inset-0">
        {/* Primary mesh gradient — cyan bloom, top-right */}
        <div
          className="absolute -top-1/3 -right-1/4 w-[900px] h-[900px] rounded-full opacity-[0.07]"
          style={{
            background: 'radial-gradient(circle, var(--color-accent-400) 0%, transparent 70%)',
          }}
        />
        {/* Secondary bloom — deeper cyan, bottom-left */}
        <div
          className="absolute -bottom-1/4 -left-1/4 w-[700px] h-[700px] rounded-full opacity-[0.04]"
          style={{
            background: 'radial-gradient(circle, var(--color-accent-500) 0%, transparent 65%)',
          }}
        />
        {/* Warm counterpoint — amber hint, center-bottom */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] rounded-full opacity-[0.025]"
          style={{
            background: 'radial-gradient(ellipse, var(--color-secondary-500) 0%, transparent 70%)',
          }}
        />

        {/* Geometric line grid — precision aesthetic */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
          }}
        />

        {/* Grain texture overlay for analog feel */}
        <div className="texture-grain absolute inset-0" />

        {/* Bottom horizon line */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-500/20 to-transparent" />
      </div>

      {/* ── Content ── */}
      <div className="relative w-full max-w-[400px]">
        {/* Brand — hero-level treatment */}
        <div className="mb-12 flex flex-col items-center animate-fadeIn">
          {/* Logo mark with glow */}
          <div className="relative mb-6 animate-float" style={{ animationDuration: '6s' }}>
            <div className="absolute -inset-3 rounded-2xl bg-accent-500/10 blur-xl" />
            <div className="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-surface-900/80 border border-accent-500/20 glow-accent-strong">
              <svg className="w-7 h-7 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
              </svg>
            </div>
          </div>
          {/* Brand name — serif display treatment */}
          <h1 className="font-display text-4xl tracking-tight text-white text-glow-accent animate-slideUp stagger-1">
            OneBase
          </h1>
          <p className="mt-3 text-sm tracking-[0.15em] uppercase font-light text-surface-500 animate-slideUp stagger-2">
            Supplier Data Platform
          </p>
        </div>

        {/* Login form — glass card with gradient border */}
        <form
          onSubmit={handleSubmit}
          className="relative animate-slideUp stagger-3"
        >
          {/* Gradient border glow effect */}
          <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-accent-500/20 via-transparent to-accent-500/5 pointer-events-none" />

          <div className="relative rounded-2xl bg-surface-900/60 backdrop-blur-xl border border-white/[0.06] p-8 shadow-2xl shadow-black/30">
            <h2 className="mb-8 text-center text-base font-medium text-gray-300 tracking-wide">
              Sign in to your account
            </h2>

            {error && (
              <div className="mb-6 rounded-xl border border-danger-500/20 bg-danger-500/[0.07] px-4 py-3 text-sm text-danger-400 animate-scaleIn">
                <div className="flex items-center gap-2.5">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  {error}
                </div>
              </div>
            )}

            <div className="space-y-5">
              <div className="animate-slideUp stagger-4">
                <label htmlFor="username" className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.15em] text-surface-500">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input-field"
                  placeholder="Enter username"
                  autoComplete="username"
                  autoFocus
                />
              </div>

              <div className="animate-slideUp stagger-5">
                <label htmlFor="password" className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.15em] text-surface-500">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field"
                  placeholder="Enter password"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <div className="animate-slideUp stagger-6 mt-8">
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary w-full py-3 text-sm"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-surface-950/30 border-t-surface-950 rounded-full animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Footer — editorial treatment */}
        <p className="mt-8 text-center animate-slideUp stagger-7">
          <span className="font-display text-sm italic text-surface-600 tracking-wide">
            OneBase
          </span>
          <span className="mx-2 text-surface-700">&middot;</span>
          <span className="text-[11px] uppercase tracking-[0.1em] text-surface-600">
            Supplier Deduplication
          </span>
        </p>
      </div>
    </div>
  );
}
