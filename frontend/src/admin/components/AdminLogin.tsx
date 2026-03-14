import { useState, useRef, useEffect } from 'react';

interface AdminLoginProps {
  onLogin: (secret: string) => Promise<boolean>;
}

export function AdminLogin({ onLogin }: AdminLoginProps) {
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = 'login-error';

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret.trim() || loading) return;
    setError('');
    setLoading(true);
    try {
      const ok = await onLogin(secret);
      if (!ok) setError('Invalid admin secret');
    } catch {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Decorative top line */}
        <div className="h-px bg-gradient-to-r from-transparent via-amber-500/60 to-transparent mb-8" />

        <form onSubmit={handleSubmit} className="bg-surface-alt border border-border-subtle rounded-lg p-6 shadow-2xl shadow-black/40">
          {/* Lock icon + heading */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 rounded-full border-2 border-amber-500/40 flex items-center justify-center mb-3 bg-amber-500/5">
              <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-amber-500 font-heading text-lg tracking-wider">Admin Access</h1>
            <p className="text-text-secondary text-xs mt-1">PlinkoVibe Control Panel</p>
          </div>

          {/* Secret input */}
          <div className="mb-4">
            <label htmlFor="admin-secret" className="block text-text-secondary text-xs font-medium mb-1.5 uppercase tracking-wider">
              Secret Key
            </label>
            <input
              ref={inputRef}
              id="admin-secret"
              type="password"
              value={secret}
              onChange={e => setSecret(e.target.value)}
              aria-describedby={error ? errorId : undefined}
              aria-invalid={!!error}
              autoComplete="current-password"
              className="w-full px-3 py-2.5 bg-surface border border-border-subtle rounded text-text-primary text-sm
                         placeholder:text-text-secondary/40 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30
                         transition-colors font-mono"
              placeholder="Enter admin secret..."
            />
            {error && (
              <p id={errorId} className="text-red-400 text-xs mt-1.5 flex items-center gap-1" role="alert">
                <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !secret.trim()}
            className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-600/40 disabled:cursor-not-allowed
                       text-white text-sm font-semibold rounded transition-colors flex items-center justify-center gap-2"
          >
            {loading && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {loading ? 'Verifying...' : 'Authenticate'}
          </button>
        </form>

        <div className="h-px bg-gradient-to-r from-transparent via-amber-500/60 to-transparent mt-8" />
      </div>
    </div>
  );
}
