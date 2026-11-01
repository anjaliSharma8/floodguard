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
  CheckCircle2, 
  HelpCircle,
  KeyRound
} from 'lucide-react';
import { User, UserRole, AccountStatus, Language } from '../types';

interface AuthViewProps {
  portalType: 'CITIZEN' | 'EXPERT';
  onBackToPortal: () => void;
  onAuthSuccess: (token: string, user: User) => void;
  lang: Language;
}

export const AuthView: React.FC<AuthViewProps> = ({
  portalType,
  onBackToPortal,
  onAuthSuccess,
  lang
}) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');

  // Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [designation, setDesignation] = useState('');

  // Status & Feedback
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pendingApprovalAccount, setPendingApprovalAccount] = useState<User | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    // Frontend validation
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
        // EXPERT PORTAL
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

          // Expert registered with PENDING_APPROVAL
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
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      setSuccessMessage(data.message || 'Password reset link sent.');
    } catch {
      setError('Failed to send reset link.');
    } finally {
      setLoading(false);
    }
  };

  // If expert account is pending approval (Section 4.C & 4.D)
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
            <h2 className="text-2xl font-black text-white">Application Under Authority Review</h2>
            <p className="text-xs text-slate-300 leading-relaxed max-w-md mx-auto">
              Your registration as an operational disaster expert for <strong className="text-white">{pendingApprovalAccount.organisation || 'your department'}</strong> has been securely logged.
            </p>
          </div>

          <div className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700 text-left text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Account:</span>
              <span className="font-semibold text-white truncate max-w-[200px]">{pendingApprovalAccount.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Role Requested:</span>
              <span className="font-bold text-indigo-400">EXPERT / OPERATOR</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Security Requirement:</span>
              <span className="text-amber-400 font-semibold">Admin Approval Required</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-400">
            For hackathon evaluation, you can log in as the pre-seeded active officer (<code className="text-cyan-400">officer.kulkarni@pmc.gov.in</code>) or approve this account using the Administrator account.
          </p>

          <button
            onClick={() => { setPendingApprovalAccount(null); setMode('login'); }}
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
        {/* Top Nav / Back */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <button
            onClick={onBackToPortal}
            className="text-xs text-slate-400 hover:text-white flex items-center space-x-1.5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Switch Portal</span>
          </button>

          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
            isCitizen 
              ? 'bg-blue-500/20 text-cyan-300 border-cyan-500/30' 
              : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
          }`}>
            {isCitizen ? 'Citizen Authentication' : 'Expert Authority Desk'}
          </span>
        </div>

        {/* Title */}
        <div className="text-center space-y-1">
          <div className={`w-12 h-12 rounded-2xl mx-auto flex items-center justify-center text-white shadow-lg ${
            isCitizen ? 'bg-gradient-to-br from-blue-600 to-cyan-500' : 'bg-gradient-to-br from-indigo-600 to-purple-600'
          }`}>
            {isCitizen ? <UserIcon className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
          </div>
          <h2 className="text-xl font-black text-white pt-2">
            {mode === 'login' ? `${isCitizen ? 'Citizen' : 'Expert'} Login` : (mode === 'signup' ? `Register New ${isCitizen ? 'Citizen' : 'Expert'}` : 'Reset Password')}
          </h2>
          <p className="text-xs text-slate-400">
            {isCitizen 
              ? 'Access safe routing, local risk maps, and emergency resources' 
              : 'Operational disaster intelligence and road incident management'}
          </p>
        </div>

        {/* Tab Switcher (Login vs Register) */}
        {mode !== 'forgot' && (
          <div className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700 text-xs">
            <button
              onClick={() => { setMode('login'); setError(null); }}
              className={`flex-1 py-2 font-bold rounded-lg transition-all ${
                mode === 'login' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Log In
            </button>
            <button
              onClick={() => { setMode('signup'); setError(null); }}
              className={`flex-1 py-2 font-bold rounded-lg transition-all ${
                mode === 'signup' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign Up
            </button>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-red-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Success Alert */}
        {successMessage && (
          <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* FORM */}
        {mode === 'forgot' ? (
          <form onSubmit={handleForgotPassword} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
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
              {loading ? 'Sending...' : 'Send Reset Link'}
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
                <label className="block text-slate-300 font-semibold mb-1">Full Name</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Anjali Sharma"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                {isCitizen ? 'Email Address' : 'Official Department Email'}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={isCitizen ? 'citizen@pune.in' : 'officer@pmc.gov.in'}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            </div>

            {/* Expert Specific Fields on Signup (Section 4.C) */}
            {!isCitizen && mode === 'signup' && (
              <>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Organisation / Department</label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={organisation}
                      onChange={(e) => setOrganisation(e.target.value)}
                      placeholder="e.g. Pune Municipal Disaster Cell / NDRF"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Official Designation</label>
                  <div className="relative">
                    <Briefcase className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      placeholder="e.g. Senior Disaster Management Officer"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                </div>
              </>
            )}

            {mode === 'signup' && (
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Phone Number (Optional)</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
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
                <label className="text-slate-300 font-semibold">Password</label>
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
                <label className="block text-slate-300 font-semibold mb-1">Confirm Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
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
                isCitizen 
                  ? 'bg-blue-600 hover:bg-cyan-600' 
                  : 'bg-indigo-600 hover:bg-purple-600'
              }`}
            >
              {loading ? 'Authenticating...' : (mode === 'login' ? 'Authenticate & Enter' : 'Submit Account Registration')}
            </button>
          </form>
        )}

        {/* Demo Fast Fill Reminder */}
        <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/80 text-[11px] text-slate-400 text-center">
          <span>Demo accounts: </span>
          {isCitizen ? (
            <code className="text-cyan-300">citizen@pune.in / Citizen@123</code>
          ) : (
            <code className="text-indigo-300">officer.kulkarni@pmc.gov.in / Expert@123</code>
          )}
        </div>
      </div>
    </div>
  );
};
