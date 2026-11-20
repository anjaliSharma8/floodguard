import React, { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { User } from '../types';

interface AuthorityAdminAuthProps {
  onBack: () => void;
  onAuthSuccess: (token: string, user: User) => void;
}

export const AuthorityAdminAuth: React.FC<AuthorityAdminAuthProps> = ({ onBack, onAuthSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid official email address.');
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/authority-admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Authority Admin sign-in failed.');
      onAuthSuccess(data.token, data.user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-8">
        <button type="button" onClick={onBack} className="mb-7 inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to portals
        </button>
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-700">
            <ShieldCheck className="h-7 w-7 text-white" />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-300">Restricted government access</p>
          <h1 className="mt-2 text-2xl font-black text-white">Authority Admin</h1>
          <p className="mt-2 text-sm text-slate-400">Sign in with the individual credentials issued for your authority.</p>
        </div>
        {error && <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-xs font-semibold text-slate-300">
            Official email
            <span className="relative mt-1.5 block">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={event => setEmail(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-teal-500"
                placeholder="officer@department.gov.in"
              />
            </span>
          </label>
          <label className="block text-xs font-semibold text-slate-300">
            Password
            <span className="relative mt-1.5 block">
              <LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 pl-10 pr-11 text-sm text-white outline-none focus:border-teal-500"
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(value => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>
          <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 py-3 text-sm font-bold text-white transition-colors hover:bg-teal-500 disabled:cursor-wait disabled:opacity-60">
            <KeyRound className="h-4 w-4" /> {loading ? 'Signing in…' : 'Secure sign in'}
          </button>
        </form>
      </section>
    </main>
  );
};

interface AuthorityInvitationAcceptProps {
  invitationToken: string;
  onAuthSuccess: (token: string, user: User) => void;
  onBack: () => void;
}

export const AuthorityInvitationAccept: React.FC<AuthorityInvitationAcceptProps> = ({
  invitationToken,
  onAuthSuccess,
  onBack
}) => {
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 10) {
      setError('Choose a password with at least 10 characters.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/authority/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: invitationToken, fullName, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Invitation could not be accepted.');
      onAuthSuccess(data.token, data.user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to accept invitation.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-8">
        <button type="button" onClick={onBack} className="mb-7 inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to portals
        </button>
        <h1 className="text-2xl font-black text-white">Accept authority invitation</h1>
        <p className="mt-2 text-sm text-slate-400">Create your individual account using this single-use invitation.</p>
        {error && <div role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block text-xs font-semibold text-slate-300">
            Full name
            <input required minLength={2} maxLength={120} value={fullName} onChange={event => setFullName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:border-teal-500" />
          </label>
          <label className="block text-xs font-semibold text-slate-300">
            New password
            <input required minLength={10} maxLength={256} type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:border-teal-500" />
          </label>
          <label className="block text-xs font-semibold text-slate-300">
            Confirm password
            <input required minLength={10} maxLength={256} type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:border-teal-500" />
          </label>
          <button type="submit" disabled={loading} className="w-full rounded-xl bg-teal-600 py-3 text-sm font-bold text-white hover:bg-teal-500 disabled:opacity-60">
            {loading ? 'Accepting invitation…' : 'Create account and accept'}
          </button>
        </form>
      </section>
    </main>
  );
};
