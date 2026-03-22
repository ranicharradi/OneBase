// ── Login page — light glassmorphism with subtle depth ──

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
    <div className="relative flex min-h-screen items-center justify-center px-4 overflow-hidden">
      {/* ── Subtle background accents ── */}
      <div className="pointer-events-none absolute inset-0">
        {/* Soft blue gradient accent — top-right */}
        <div
          className="absolute -top-1/3 -right-1/4 w-[900px] h-[900px] rounded-full opacity-[0.12]"
          style={{
            background: 'radial-gradient(circle, var(--color-accent-300) 0%, transparent 70%)',
          }}
        />
        {/* Secondary accent — bottom-left */}
        <div
          className="absolute -bottom-1/4 -left-1/4 w-[700px] h-[700px] rounded-full opacity-[0.08]"
          style={{
            background: 'radial-gradient(circle, var(--color-accent-400) 0%, transparent 65%)',
          }}
        />
      </div>

      {/* ── Content ── */}
      <div className="relative w-full max-w-[400px]">
        {/* Brand — hero-level treatment */}
        <div className="mb-12 flex flex-col items-center animate-fadeIn">
          {/* Logo mark */}
          <div className="relative mb-6 animate-float" style={{ animationDuration: '6s' }}>
            <div className="absolute -inset-3 rounded-2xl bg-accent-600/10 blur-xl" />
            <div className="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-white/60 border border-accent-600/20 shadow-lg">
              <svg className="w-7 h-7 text-accent-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
              </svg>
            </div>
          </div>
          {/* Brand name */}
          <h1 className="font-display text-4xl tracking-tight text-on-surface animate-slideUp stagger-1">
            OneBase
          </h1>
          <p className="mt-3 text-sm tracking-[0.15em] uppercase font-light text-on-surface-variant/60 animate-slideUp stagger-2">
            Supplier Data Platform
          </p>
        </div>

        {/* Login form — glass card */}
        <form
          onSubmit={handleSubmit}
          className="relative animate-slideUp stagger-3"
        >
          <div className="relative rounded-2xl bg-white/45 backdrop-blur-[40px] border border-white/70 p-8 shadow-2xl">
            <h2 className="mb-8 text-center text-base font-medium text-on-surface tracking-wide">
              Sign in to your account
            </h2>

            {error && (
              <div className="mb-6 rounded-xl border border-danger-500/20 bg-danger-500/[0.07] px-4 py-3 text-sm text-danger-500 animate-scaleIn">
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
                <label htmlFor="username" className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.15em] text-on-surface-variant/60">
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
                <label htmlFor="password" className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.15em] text-on-surface-variant/60">
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
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Footer */}
        <p className="mt-8 text-center animate-slideUp stagger-7">
          <span className="font-display text-sm italic text-outline tracking-wide">
            OneBase
          </span>
          <span className="mx-2 text-on-surface-variant/40">&middot;</span>
          <span className="text-[11px] uppercase tracking-[0.1em] text-outline">
            Supplier Deduplication
          </span>
        </p>
      </div>
    </div>
  );
}
