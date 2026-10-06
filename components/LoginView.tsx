import React, { useState } from 'react';
import { useStore } from '../contexts/StoreContext';
import { inputClass, labelClass, primaryButtonClass, Section } from './ui';
import LogoIcon from './icons/LogoIcon';

interface LoginViewProps {
  onDone: () => void;
}

const LoginView: React.FC<LoginViewProps> = ({ onDone }) => {
  const { login } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    // login() verifies against the server's scrypt-hashed password and
    // resolves null on success, or the server's error message.
    const message = await login(email, password);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    setError('');
    onDone();
  };

  return (
    <div className="container mx-auto px-4 sm:px-6 py-12">
      <Section title="Admin Sign In" subtitle="Manage products, orders and store settings." />

      <div className="max-w-md mx-auto">
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-dark-card shadow-xl rounded-lg p-6 space-y-5"
        >
          {error && (
            <p
              role="alert"
              className="text-red-500 bg-red-100 dark:bg-red-900/50 dark:text-red-300 p-3 rounded-md"
            >
              {error}
            </p>
          )}

          <div className="text-center">
            <span className="inline-block"><LogoIcon /></span>
          </div>

          <div>
            <label className={labelClass} htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              required
            />
          </div>

          <button type="submit" className={primaryButtonClass} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <button
            type="button"
            onClick={onDone}
            className="w-full text-sm text-gray-600 dark:text-gray-400 hover:text-brand-gold-ink dark:hover:text-brand-gold transition-colors"
          >
            Back to the store
          </button>
        </form>

        <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-4">
          Credentials are verified by the store server: the password is stored hashed and never
          reaches this browser. Defaults come from <code>storeConfig.ts</code> and can be overridden
          with the server&apos;s <code>ADMIN_EMAIL</code> / <code>ADMIN_PASSWORD</code> env vars.
        </p>
      </div>
    </div>
  );
};

export default LoginView;