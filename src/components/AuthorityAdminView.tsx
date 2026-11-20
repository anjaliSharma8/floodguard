import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, BadgeCheck, BellRing, ClipboardList, FileCheck2, KeyRound, LogOut,
  RefreshCw, Search, ShieldCheck, UserPlus, Users, X
} from 'lucide-react';
import { AuthorityPermission, User } from '../types';

type AdminTab = 'overview' | 'members' | 'applications' | 'audit';

interface AuthoritySummary {
  authority: { id: string; name: string; authorityType: string; region: string; status: string };
  totalExperts: number;
  activeExperts: number;
  suspendedMembers: number;
  pendingApplications: number;
  pendingInvitations: number;
}

interface AuthorityMember {
  membershipId: string;
  userId: string;
  role: 'AUTHORITY_ADMIN' | 'EXPERT';
  status: 'INVITED' | 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  fullName: string;
  email: string;
  organisation?: string;
  designation?: string;
  accountStatus: string;
  permissions: AuthorityPermission[];
}

interface AuthorityApplication {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  organisation: string;
  designation: string;
  status: string;
  appliedAt: string;
}

interface AuthorityInvitation {
  id: string;
  email: string;
  intendedRole: 'AUTHORITY_ADMIN' | 'EXPERT';
  expiresAt: string;
  status: string;
}

interface AuthorityAuditEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetResource: string;
  details: string;
  timestamp: string;
}

const PERMISSIONS: { id: AuthorityPermission; label: string; description: string }[] = [
  { id: 'REPORTS_VIEW', label: 'View reports', description: 'Access community incident reports.' },
  { id: 'REPORTS_VERIFY', label: 'Review reports', description: 'Verify, reject, or resolve citizen reports.' },
  { id: 'ROAD_STATUS_UPDATE', label: 'Update road status', description: 'Publish operational road status changes.' },
  { id: 'HAZARD_VERIFY', label: 'Verify hazards', description: 'Create official hazard and closure actions.' },
  { id: 'SHELTER_MANAGE', label: 'Manage shelters', description: 'Update shelter occupancy and capacity.' },
  { id: 'ALERT_CREATE', label: 'Create alerts', description: 'Create authority alerts.' },
  { id: 'EXPERT_MANAGE', label: 'Manage experts', description: 'Manage operational expert records.' },
  { id: 'AUDIT_VIEW', label: 'View audit logs', description: 'Read audit activity for this authority.' }
];

interface AuthorityAdminViewProps {
  user: User;
  token: string;
  onLogout: () => void;
}

export const AuthorityAdminView: React.FC<AuthorityAdminViewProps> = ({ user, token, onLogout }) => {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [summary, setSummary] = useState<AuthoritySummary | null>(null);
  const [members, setMembers] = useState<AuthorityMember[]>([]);
  const [applications, setApplications] = useState<AuthorityApplication[]>([]);
  const [invitations, setInvitations] = useState<AuthorityInvitation[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuthorityAuditEntry[]>([]);
  const [search, setSearch] = useState('');
  const [memberFilter, setMemberFilter] = useState('ALL');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'EXPERT' | 'AUTHORITY_ADMIN'>('EXPERT');
  const [oneTimeToken, setOneTimeToken] = useState<string | null>(null);
  const [oneTimeLink, setOneTimeLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const response = await fetch(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers
      }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
    return data;
  }, [token]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashboard, memberData, appData, invitationData, auditData] = await Promise.all([
        request('/api/authority/dashboard'),
        request('/api/authority/members'),
        request('/api/authority/applications'),
        request('/api/authority/invitations'),
        request('/api/authority/audit-logs')
      ]);
      setSummary(dashboard);
      setMembers(memberData);
      setApplications(appData);
      setInvitations(invitationData);
      setAuditLogs(auditData.auditLogs || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load authority data.');
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => { void refresh(); }, [refresh]);

  const filteredMembers = useMemo(() => members.filter(member => {
    const query = search.trim().toLowerCase();
    const matchesText = !query || [
      member.fullName, member.email, member.organisation || '', member.designation || ''
    ].some(value => value.toLowerCase().includes(query));
    return matchesText && (memberFilter === 'ALL' || member.status === memberFilter);
  }), [members, search, memberFilter]);

  const runAction = async (key: string, action: () => Promise<void>, successMessage: string) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await action();
      await refresh();
      setNotice(successMessage);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The action could not be completed.');
    } finally {
      setBusy(null);
    }
  };

  const inviteMember = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction('invite', async () => {
      const data = await request('/api/authority/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail.trim(), intendedRole: inviteRole })
      });
      setInviteEmail('');
      setOneTimeToken(data.invitationToken);
      setOneTimeLink(`${window.location.origin}/?invite=${encodeURIComponent(data.invitationToken)}`);
    }, 'Invitation created. Copy its one-time token and share it securely with the invitee.');
  };

  const updateMembership = async (member: AuthorityMember) => {
    const status = member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const action = status === 'SUSPENDED' ? 'suspend' : 'reactivate';
    if (!window.confirm(`Are you sure you want to ${action} ${member.fullName}?`)) return;
    await runAction(member.membershipId, async () => {
      await request(`/api/authority/members/${encodeURIComponent(member.membershipId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
    }, `${member.fullName} was ${status === 'ACTIVE' ? 'reactivated' : 'suspended'}.`);
  };

  const reviewApplication = async (application: AuthorityApplication, decision: 'approve' | 'reject') => {
    const verb = decision === 'approve' ? 'approve' : 'reject';
    if (!window.confirm(`Confirm ${verb} for ${application.fullName}?`)) return;
    await runAction(application.id, async () => {
      await request(`/api/authority/applications/${encodeURIComponent(application.id)}/${decision}`, {
        method: 'PATCH'
      });
    }, `Application ${decision === 'approve' ? 'approved' : 'rejected'}.`);
  };

  const updatePermission = async (member: AuthorityMember, permission: AuthorityPermission, enabled: boolean) => {
    await runAction(`${member.membershipId}:${permission}`, async () => {
      const path = `/api/authority/members/${encodeURIComponent(member.membershipId)}/permissions`;
      if (enabled) {
        await request(path, { method: 'POST', body: JSON.stringify({ permission }) });
      } else {
        await request(`${path}/${permission}`, { method: 'DELETE' });
      }
    }, `Permissions updated for ${member.fullName}.`);
  };

  const revokeInvitation = async (invitation: AuthorityInvitation) => {
    if (!window.confirm(`Revoke the pending invitation for ${invitation.email}?`)) return;
    await runAction(invitation.id, async () => {
      await request(`/api/authority/invitations/${encodeURIComponent(invitation.id)}`, { method: 'DELETE' });
    }, 'Invitation revoked.');
  };

  const statCards = summary ? [
    { label: 'Total experts', value: summary.totalExperts, icon: Users, color: 'text-cyan-300' },
    { label: 'Active experts', value: summary.activeExperts, icon: BadgeCheck, color: 'text-emerald-300' },
    { label: 'Pending applications', value: summary.pendingApplications, icon: FileCheck2, color: 'text-amber-300' },
    { label: 'Pending invitations', value: summary.pendingInvitations, icon: UserPlus, color: 'text-violet-300' },
    { label: 'Suspended members', value: summary.suspendedMembers, icon: ShieldCheck, color: 'text-rose-300' }
  ] : [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-xl bg-teal-700/70 p-2"><ShieldCheck className="h-5 w-5 text-teal-100" /></div>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-white sm:text-base">SanketSetu Authority Console</p>
              <p className="truncate text-xs text-slate-400">{summary?.authority.name || user.authorityMembership?.authorityName || user.fullName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-right sm:block">
              <span className="block text-xs font-semibold text-slate-200">{user.fullName}</span>
              <span className="block text-[10px] text-teal-300">AUTHORITY ADMIN</span>
            </span>
            <button type="button" onClick={() => void refresh()} aria-label="Refresh dashboard" className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" onClick={onLogout} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800">
              <LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-300">Authority administration</p>
            <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">{summary?.authority.name || 'Authority dashboard'}</h1>
            <p className="mt-1 text-sm text-slate-400">{summary?.authority.region || user.authorityMembership?.authorityRegion || 'Authority profile loading'}</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Secure authority session
          </span>
        </div>

        {error && <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-red-500/30 bg-red-950/50 p-3 text-sm text-red-200"><span>{error}</span><button onClick={() => setError(null)} aria-label="Dismiss error"><X className="h-4 w-4" /></button></div>}
        {notice && <div role="status" className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3 text-sm text-emerald-200"><span>{notice}</span><button onClick={() => setNotice(null)} aria-label="Dismiss notification"><X className="h-4 w-4" /></button></div>}

        <nav className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 p-1" aria-label="Authority dashboard">
          {([
            ['overview', 'Overview', Activity],
            ['members', 'Members & invitations', Users],
            ['applications', 'Expert applications', ClipboardList],
            ['audit', 'Audit logs', KeyRound]
          ] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${tab === id ? 'bg-teal-700 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </nav>

        {loading && !summary ? (
          <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-400"><RefreshCw className="h-5 w-5 animate-spin text-teal-400" />Loading authority data…</div>
        ) : !summary ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-300">Authority dashboard data is unavailable.</div>
        ) : (
          <>
            {tab === 'overview' && (
              <section className="space-y-6">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {statCards.map(({ label, value, icon: Icon, color }) => (
                    <article key={label} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                      <div className="flex items-center justify-between"><span className="text-xs text-slate-400">{label}</span><Icon className={`h-4 w-4 ${color}`} /></div>
                      <p className="mt-3 text-3xl font-black text-white">{value}</p>
                    </article>
                  ))}
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                    <h2 className="font-bold text-white">Authority profile</h2>
                    <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                      <div><dt className="text-xs text-slate-500">Authority type</dt><dd className="mt-1 text-slate-200">{summary.authority.authorityType}</dd></div>
                      <div><dt className="text-xs text-slate-500">Service region</dt><dd className="mt-1 text-slate-200">{summary.authority.region}</dd></div>
                      <div><dt className="text-xs text-slate-500">Status</dt><dd className="mt-1 text-emerald-300">{summary.authority.status}</dd></div>
                      <div><dt className="text-xs text-slate-500">Your account</dt><dd className="mt-1 text-slate-200">{user.email}</dd></div>
                    </dl>
                  </section>
                  <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                    <div className="flex items-center justify-between"><h2 className="font-bold text-white">Pending invitations</h2><BellRing className="h-4 w-4 text-violet-300" /></div>
                    {invitations.length === 0 ? <p className="mt-4 text-sm text-slate-500">No pending invitations.</p> : (
                      <ul className="mt-3 divide-y divide-slate-800">
                        {invitations.slice(0, 5).map(invitation => <li key={invitation.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                          <span className="min-w-0"><span className="block truncate text-slate-200">{invitation.email}</span><span className="text-xs text-slate-500">{invitation.intendedRole} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</span></span>
                          <button type="button" disabled={busy === invitation.id} onClick={() => void revokeInvitation(invitation)} className="text-xs font-semibold text-rose-300 hover:text-rose-200 disabled:opacity-50">Revoke</button>
                        </li>)}
                      </ul>
                    )}
                  </section>
                </div>
              </section>
            )}

            {tab === 'members' && (
              <section className="space-y-5">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
                  <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
                    <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <h2 className="font-bold text-white">Authority members <span className="ml-1 text-xs font-normal text-slate-500">{members.length}</span></h2>
                      <div className="flex gap-2">
                        <label className="relative min-w-0 flex-1 sm:w-56"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search members" aria-label="Search members" className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2 pl-8 pr-2 text-xs text-white outline-none focus:border-teal-500" /></label>
                        <select value={memberFilter} onChange={event => setMemberFilter(event.target.value)} aria-label="Filter by membership status" className="rounded-lg border border-slate-700 bg-slate-800 px-2 text-xs text-slate-200">
                          <option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="PENDING">Pending</option>
                        </select>
                      </div>
                    </div>
                    {filteredMembers.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">{members.length ? 'No members match these filters.' : 'No authority members have been added.'}</p> : (
                      <div className="space-y-3">
                        {filteredMembers.map(member => (
                          <article key={member.membershipId} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-white">{member.fullName}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${member.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-300' : member.status === 'SUSPENDED' ? 'bg-rose-500/10 text-rose-300' : 'bg-amber-500/10 text-amber-300'}`}>{member.status}</span><span className="text-[10px] font-bold text-teal-300">{member.role}</span></div>
                                <p className="mt-1 truncate text-xs text-slate-400">{member.email}</p>
                                {(member.organisation || member.designation) && <p className="mt-1 text-xs text-slate-500">{[member.designation, member.organisation].filter(Boolean).join(' · ')}</p>}
                              </div>
                              <button type="button" disabled={busy === member.membershipId || member.status === 'PENDING' || member.status === 'INVITED'} onClick={() => void updateMembership(member)} className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${member.status === 'ACTIVE' ? 'border-rose-500/30 text-rose-300 hover:bg-rose-500/10' : 'border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10'}`}>
                                {member.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                              </button>
                            </div>
                            {member.role === 'EXPERT' && (
                              <details className="mt-4 border-t border-slate-800 pt-3">
                                <summary className="cursor-pointer text-xs font-semibold text-slate-300">Manage expert permissions</summary>
                                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                  {PERMISSIONS.map(permission => <label key={permission.id} title={permission.description} className="flex cursor-pointer items-start gap-2 rounded-lg bg-slate-900 p-2.5 text-xs">
                                    <input type="checkbox" checked={member.permissions.includes(permission.id)} disabled={busy === `${member.membershipId}:${permission.id}`} onChange={event => void updatePermission(member, permission.id, event.target.checked)} className="mt-0.5 accent-teal-500" />
                                    <span><span className="block font-semibold text-slate-200">{permission.label}</span><span className="text-[10px] text-slate-500">{permission.description}</span></span>
                                  </label>)}
                                </div>
                              </details>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                  <section className="space-y-4">
                    <form onSubmit={inviteMember} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                      <div className="mb-4 flex items-center gap-2"><UserPlus className="h-4 w-4 text-teal-300" /><h2 className="font-bold text-white">Invite a member</h2></div>
                      <label className="block text-xs font-semibold text-slate-300">Official email<input type="email" required maxLength={254} value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:border-teal-500" placeholder="officer@department.gov.in" /></label>
                      <label className="mt-3 block text-xs font-semibold text-slate-300">Role<select value={inviteRole} onChange={event => setInviteRole(event.target.value as 'EXPERT' | 'AUTHORITY_ADMIN')} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white"><option value="EXPERT">Expert</option><option value="AUTHORITY_ADMIN">Authority Admin</option></select></label>
                      <button type="submit" disabled={busy === 'invite'} className="mt-4 w-full rounded-lg bg-teal-700 py-2.5 text-sm font-bold text-white hover:bg-teal-600 disabled:opacity-50">{busy === 'invite' ? 'Creating…' : `Invite ${inviteRole === 'EXPERT' ? 'Expert' : 'Authority Admin'}`}</button>
                    </form>
                    {oneTimeToken && <div className="break-all rounded-xl border border-amber-500/30 bg-amber-950/30 p-4 text-xs text-amber-100"><p className="font-bold">One-time invitation link</p><p className="mt-2 font-mono">{oneTimeLink}</p><p className="mt-2 text-amber-200/70">Share privately. The token is displayed only once and expires in seven days.</p><p className="mt-2 font-mono text-[10px] text-amber-200/70">{oneTimeToken}</p><button type="button" onClick={() => { setOneTimeToken(null); setOneTimeLink(null); }} className="mt-2 underline">Dismiss</button></div>}
                    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="font-bold text-white">Invitation status</h2>{invitations.length ? <ul className="mt-3 space-y-3">{invitations.map(invite => <li key={invite.id} className="flex items-start justify-between gap-2 text-xs"><span className="min-w-0"><span className="block truncate text-slate-200">{invite.email}</span><span className="text-slate-500">{invite.intendedRole} · {new Date(invite.expiresAt).toLocaleDateString()}</span></span><button type="button" disabled={busy === invite.id} onClick={() => void revokeInvitation(invite)} className="text-rose-300 hover:text-rose-200">Revoke</button></li>)}</ul> : <p className="mt-3 text-xs text-slate-500">No invitations pending.</p>}</div>
                  </section>
                </div>
              </section>
            )}

            {tab === 'applications' && (
              <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold text-white">Expert applications</h2><p className="mt-1 text-xs text-slate-400">Applications assigned to this authority only.</p></div><FileCheck2 className="h-5 w-5 text-amber-300" /></div>
                {applications.filter(application => application.status === 'PENDING_APPROVAL').length === 0 ? <div className="py-10 text-center"><BadgeCheck className="mx-auto h-8 w-8 text-slate-600" /><p className="mt-3 text-sm text-slate-400">No pending applications.</p></div> : (
                  <div className="space-y-3">{applications.filter(application => application.status === 'PENDING_APPROVAL').map(application => <article key={application.id} className="flex flex-col justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 md:flex-row md:items-center">
                    <div><h3 className="font-semibold text-white">{application.fullName}</h3><p className="mt-1 text-sm text-slate-300">{application.email}</p><p className="mt-1 text-xs text-slate-500">{application.organisation} · {application.designation}</p><p className="mt-1 text-[10px] text-slate-600">Applied {new Date(application.appliedAt).toLocaleString()}</p></div>
                    <div className="flex gap-2"><button type="button" disabled={busy === application.id} onClick={() => void reviewApplication(application, 'reject')} className="rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50">Reject</button><button type="button" disabled={busy === application.id} onClick={() => void reviewApplication(application, 'approve')} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50">Approve expert</button></div>
                  </article>)}</div>
                )}
              </section>
            )}

            {tab === 'audit' && (
              <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold text-white">Authority audit log</h2><p className="mt-1 text-xs text-slate-400">Administrative actions for {summary.authority.name}.</p></div><KeyRound className="h-5 w-5 text-teal-300" /></div>
                {auditLogs.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No authority audit activity recorded yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="border-b border-slate-800 text-slate-500"><tr><th className="px-3 py-3">Time</th><th className="px-3 py-3">Administrator</th><th className="px-3 py-3">Action</th><th className="px-3 py-3">Target</th><th className="px-3 py-3">Details</th></tr></thead><tbody className="divide-y divide-slate-800">{auditLogs.map(log => <tr key={log.id}><td className="whitespace-nowrap px-3 py-3 text-slate-400">{new Date(log.timestamp).toLocaleString()}</td><td className="px-3 py-3"><span className="block text-slate-200">{log.actorName}</span><span className="font-mono text-[10px] text-slate-600">{log.actorId}</span></td><td className="px-3 py-3 font-semibold text-teal-300">{log.action}</td><td className="px-3 py-3 text-slate-300">{log.targetResource}</td><td className="max-w-sm px-3 py-3 text-slate-400">{log.details}</td></tr>)}</tbody></table></div>}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
};
