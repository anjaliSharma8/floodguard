import React, { useState } from 'react';
import {
  User as UserIcon,
  ShieldCheck,
  ArrowLeft,
  Lock,
  Mail,
  Building2,
  Briefcase,
  Phone,
  AlertCircle,
  Clock,
  CheckCircle2
} from 'lucide-react';
import { User, Language } from '../types';

interface AuthViewProps {
  portalType: 'CITIZEN' | 'EXPERT';
  onBackToPortal: () => void;
  onAuthSuccess: (token: string, user: User) => void;
  lang: Language;
}

export const AuthView: React.FC<AuthViewProps> = ({
  portalType,
  onBackToPortal,
  onAuthSuccess
}) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [designation, setDesignation] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pendingApprovalAccount, setPendingApprovalAccount] = useState<User | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match. Please verify.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    try {
      if (portalType === 'CITIZEN') {
        if (mode === 'login') {
          const res = await fetch('/api/auth/citizen/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Login failed.');
          onAuthSuccess(data.token, data.user);
        } else if (mode === 'signup') {
          const res = await fetch('/api/auth/citizen/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, email, password, phone })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Registration failed.');
          onAuthSuccess(data.token, data.user);
        }
      } else {
        if (mode === 'login') {
          const res = await fetch('/api/auth/expert/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          const data = await res.json();

          if (!res.ok) {
            if (data.accountStatus === 'PENDING_APPROVAL') {
              setPendingApprovalAccount({
                id: 'pending',
                fullName: email,
                email,
                role: 'EXPERT',
                accountStatus: 'PENDING_APPROVAL',
                createdAt: new Date().toISOString()
              });
              return;
            }
            throw new Error(data.error || 'Expert authorization failed.');
          }

          onAuthSuccess(data.token, data.user);
        } else if (mode === 'signup') {
          const res = await fetch('/api/auth/expert/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, email, password, organisation, designation, phone })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Registration failed.');
          setPendingApprovalAccount(data.user);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Authentication error.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      setSuccessMessage(data.message || 'Recovery request logged.');
    } catch {
      setError('Failed to process password recovery request.');
    } finally {
      setLoading(false);
    }
  };

  if (pendingApprovalAccount) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-amber-500/40 rounded-3xl max-w-lg w-full p-8 shadow-2xl space-y-6 text-center">
          <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/30">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
              Clearance Status: Pending Verification
            </span>
            <h2 className="text-2xl font-black text-white">Application Under Peer Review</h2>
            <p className="text-xs text-slate-300 leading-relaxed max-w-md mx-auto">
              Your registration as a SanketSetu Expert for{' '}
              <strong className="text-white">{pendingApprovalAccount.organisation || 'your organisation'}</strong>{' '}
              has been saved. Operational hazard-control access remains locked until an active approved Expert verifies your credentials.
            </p>
          </div>

          <div className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700 text-left text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Account:</span>
              <span className="font-semibold text-white truncate max-w-[200px]">{pendingApprovalAccount.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Role Requested:</span>
              <span className="font-bold text-indigo-400">EXPERT</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Security Requirement:</span>
              <span className="text-amber-400 font-semibold">Active Expert Peer Approval Required</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setPendingApprovalAccount(null);
              setMode('login');
            }}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition-all"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  const isCitizen = portalType === 'CITIZEN';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans relative">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <button
            type="button"
            onClick={onBackToPortal}
            className="text-xs text-slate-400 hover:text-white flex items-center space-x-1.5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Switch Portal</span>
          </button>

          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
              isCitizen
                ? 'bg-blue-500/20 text-cyan-300 border-cyan-500/30'
                : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
            }`}
          >
            {isCitizen ? 'Citizen Portal' : 'Expert Operations Portal'}
          </span>
        </div>

        <div className="text-center space-y-1">
          <div
            className={`w-12 h-12 rounded-2xl mx-auto flex items-center justify-center text-white shadow-lg ${
              isCitizen ? 'bg-gradient-to-br from-blue-600 to-cyan-500' : 'bg-gradient-to-br from-indigo-600 to-purple-600'
            }`}
          >
            {isCitizen ? <UserIcon className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
          </div>
          <h2 className="text-xl font-black text-white pt-2">
            {mode === 'login'
              ? `${isCitizen ? 'Citizen' : 'Expert'} Sign In`
              : mode === 'signup'
              ? `Register ${isCitizen ? 'Citizen' : 'Expert'} Account`
              : 'Account Recovery'}
          </h2>
          <p className="text-xs text-slate-400">
            {isCitizen
              ? 'SanketSetu Pune & PCMC Safe Navigation & Reporting'
              : 'SanketSetu Hazard Verification & Road Management Desk'}
          </p>
        </div>

        {mode !== 'forgot' && (
          <div className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700 text-xs">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex-1 py-2 font-bold rounded-lg transition-all ${
                mode === 'login' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
              className={`flex-1 py-2 font-bold rounded-lg transition-all ${
                mode === 'signup' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              {isCitizen ? 'Sign Up' : 'Apply for Expert'}
            </button>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-red-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {mode === 'forgot' ? (
          <form onSubmit={handleForgotPassword} className="space-y-4 text-xs">
            <div>
              <label htmlFor="auth-reset-email" className="block text-slate-300 font-semibold mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  id="auth-reset-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl transition-all shadow"
            >
              {loading ? 'Submitting...' : 'Request Recovery'}
            </button>

            <button
              type="button"
              onClick={() => setMode('login')}
              className="w-full text-slate-400 hover:text-white text-xs pt-1"
            >
              Back to Login
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            {mode === 'signup' && (
              <div>
                <label htmlFor="auth-fullname" className="block text-slate-300 font-semibold mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    id="auth-fullname"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Aarav Deshpande"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-slate-300 font-semibold mb-1">
                {isCitizen ? 'Email Address' : 'Official Department Email'}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={isCitizen ? 'you@example.com' : 'officer@department.gov.in'}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            </div>

            {!isCitizen && mode === 'signup' && (
              <>
                <div>
                  <label htmlFor="auth-org" className="block text-slate-300 font-semibold mb-1">
                    Organisation / Department
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      id="auth-org"
                      type="text"
                      required
                      value={organisation}
                      onChange={(e) => setOrganisation(e.target.value)}
                      placeholder="e.g. PMC Disaster Cell / PCMC / IMD / NDRF"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="auth-desig" className="block text-slate-300 font-semibold mb-1">
                    Official Designation
                  </label>
                  <div className="relative">
                    <Briefcase className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      id="auth-desig"
                      type="text"
                      required
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      placeholder="e.g. Hydrological Operations Engineer"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                </div>
              </>
            )}

            {mode === 'signup' && (
              <div>
                <label htmlFor="auth-phone" className="block text-slate-300 font-semibold mb-1">
                  Phone Number (Optional)
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    id="auth-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91-98XXXXXXXX"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>
              </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-1">
                <label htmlFor="auth-password" className="text-slate-300 font-semibold">
                  Password
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  id="auth-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            </div>

            {mode === 'signup' && (
              <div>
                <label htmlFor="auth-confirm-password" className="block text-slate-300 font-semibold mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    id="auth-confirm-password"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full text-white font-bold py-3 rounded-xl transition-all shadow-lg text-xs uppercase tracking-wider ${
                isCitizen ? 'bg-blue-600 hover:bg-cyan-600' : 'bg-indigo-600 hover:bg-purple-600'
              }`}
            >
              {loading
                ? 'Authenticating...'
                : mode === 'login'
                ? 'Sign In'
                : isCitizen
                ? 'Create Citizen Account'
                : 'Submit Expert Application'}
            </button>
          </form>
        )}

        {import.meta.env.DEV && (
          <div className="p-2.5 bg-slate-800/60 rounded-xl border border-slate-700/80 text-[11px] text-slate-400 text-center">
            Dev tip: Use the Welcome Portal quick sign-in buttons for instant evaluation accounts.
          </div>
        )}
      </div>
    </div>
  );
};
