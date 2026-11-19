import React, { useState, useEffect, useCallback } from 'react';
import {
  RoadSegment,
  RoadNode,
  RoadStatus,
  Shelter,
  Hospital,
  EmergencyFacility,
  WaterwayFeature,
  CommunityReport,
  LivePoll,
  RouteFeedback,
  RainfallFeedMetadata,
  AppNotification,
  Language,
  User,
  AuditLog
} from './types';
import {
  PUNE_ROAD_NODES,
  INITIAL_ROAD_SEGMENTS,
  INITIAL_SHELTERS,
  INITIAL_HOSPITALS,
  INITIAL_EMERGENCY_FACILITIES,
  INITIAL_WATERWAYS,
  INITIAL_COMMUNITY_REPORTS,
  INITIAL_POLLS
} from './data/puneData';
import { MultiRouteResponse, RouteMode } from './utils/rules';
import { WelcomePortal } from './components/WelcomePortal';
import { AuthView } from './components/AuthView';
import { CitizenView } from './components/CitizenView';
import { ExpertView } from './components/ExpertView';
import { ChatbotModal } from './components/ChatbotModal';
import { OfflineGuideModal } from './components/OfflineGuideModal';
import { startSpeechRecognition, speakText, isSpeechRecognitionSupported } from './utils/speech';

const TOKEN_STORAGE_KEY = 'sanketsetu_token';
const USER_STORAGE_KEY = 'sanketsetu_user';

export function App() {
  // Authentication & Session State (strictly CITIZEN | EXPERT)
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authPortalType, setAuthPortalType] = useState<'CITIZEN' | 'EXPERT' | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);

  // App Configuration & General State
  const [lang, setLang] = useState<Language>('en');
  const [isOffline, setIsOffline] = useState<boolean>(false);

  // Core Hydrological & Spatial Data (hydrated from backend APIs + offline fallback)
  const [nodes, setNodes] = useState<Record<string, RoadNode>>(PUNE_ROAD_NODES);
  const [roads, setRoads] = useState<RoadSegment[]>(INITIAL_ROAD_SEGMENTS);
  const [shelters, setShelters] = useState<Shelter[]>(INITIAL_SHELTERS);
  const [hospitals, setHospitals] = useState<Hospital[]>(INITIAL_HOSPITALS);
  const [facilities, setFacilities] = useState<EmergencyFacility[]>(INITIAL_EMERGENCY_FACILITIES);
  const [waterways, setWaterways] = useState<WaterwayFeature[]>(INITIAL_WATERWAYS);
  const [reports, setReports] = useState<CommunityReport[]>(INITIAL_COMMUNITY_REPORTS);
  const [polls, setPolls] = useState<LivePoll[]>(INITIAL_POLLS);
  const [routeFeedbacks, setRouteFeedbacks] = useState<RouteFeedback[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [rainfallFeed, setRainfallFeed] = useState<RainfallFeedMetadata | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Routing & Map Selection State
  const [activeCalculation, setActiveCalculation] = useState<
    (MultiRouteResponse & { activeMode: RouteMode; altIndex?: number }) | null
  >(null);
  const [selectedRoad, setSelectedRoad] = useState<RoadSegment | null>(null);
  const [externalOriginId, setExternalOriginId] = useState<string | undefined>(undefined);
  const [externalDestId, setExternalDestId] = useState<string | undefined>(undefined);
  const [citizenNavOverride, setCitizenNavOverride] = useState<
    'dashboard' | 'routes' | 'community' | 'emergency' | 'my-reports' | 'alerts' | 'datasets' | 'profile' | undefined
  >(undefined);

  // Modals & Voice State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isOfflineGuideOpen, setIsOfflineGuideOpen] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);

  const fetchAuditLogs = useCallback(() => {
    if (!token) return;
    fetch('/api/expert/audit-logs', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.auditLogs) setAuditLogs(data.auditLogs);
      })
      .catch(() => {});
  }, [token]);

  const hydrateLiveData = useCallback((authToken?: string | null) => {
    const authHeaders = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;

    fetch('/api/roads')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.nodes) setNodes(data.nodes);
        if (data?.segments) setRoads(data.segments);
        if (data?.rainfall) setRainfallFeed(data.rainfall);
      })
      .catch(() => {});

    fetch('/api/shelters')
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (Array.isArray(data)) setShelters(data); })
      .catch(() => {});

    fetch('/api/hospitals')
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (Array.isArray(data)) setHospitals(data); })
      .catch(() => {});

    fetch('/api/emergency-facilities')
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (Array.isArray(data)) setFacilities(data); })
      .catch(() => {});

    fetch('/api/waterways')
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (Array.isArray(data)) setWaterways(data); })
      .catch(() => {});

    fetch('/api/reports')
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (Array.isArray(data)) setReports(data); })
      .catch(() => {});

    fetch('/api/polls', { headers: authHeaders })
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (Array.isArray(data)) setPolls(data); })
      .catch(() => {});

    fetch('/api/routes/feedback')
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (Array.isArray(data)) setRouteFeedbacks(data); })
      .catch(() => {});

    fetch('/api/notifications', { headers: authHeaders })
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (Array.isArray(data)) setNotifications(data); })
      .catch(() => {});
  }, []);

  // Session restore on mount
  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    const savedUser = localStorage.getItem(USER_STORAGE_KEY);

    if (savedToken && savedUser) {
      try {
        const parsed = JSON.parse(savedUser) as User;
        setToken(savedToken);
        setCurrentUser(parsed);
        if (parsed.preferredLanguage) setLang(parsed.preferredLanguage);

        fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${savedToken}` }
        })
          .then(res => (res.ok ? res.json() : null))
          .then(data => {
            if (data?.success && data.user) {
              setCurrentUser(data.user);
              localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
              hydrateLiveData(savedToken);
            } else {
              handleLogout();
            }
          })
          .catch(() => {
            hydrateLiveData(savedToken);
          })
          .finally(() => setIsCheckingAuth(false));
      } catch {
        handleLogout();
        setIsCheckingAuth(false);
      }
    } else {
      hydrateLiveData(null);
      setIsCheckingAuth(false);
    }
  }, [hydrateLiveData]);

  // Sync audit logs & user-specific data whenever token changes
  useEffect(() => {
    if (token) {
      hydrateLiveData(token);
      if (currentUser?.role === 'EXPERT') {
        fetchAuditLogs();
      }
    }
  }, [token, currentUser?.role, hydrateLiveData, fetchAuditLogs]);

  const handleAuthSuccess = (newToken: string, user: User) => {
    setToken(newToken);
    setCurrentUser(user);
    setAuthPortalType(null);
    setAuthNotice(null);
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    if (user.preferredLanguage) setLang(user.preferredLanguage);
  };

  const handleLogout = () => {
    if (token) {
      fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    }
    setToken(null);
    setCurrentUser(null);
    setAuthPortalType(null);
    setActiveCalculation(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  };

  // Dev-only Quick Demo Login (zero passwords stored client-side)
  const handleQuickDevLogin = async (account: 'citizen' | 'expert' | 'pending_expert') => {
    setAuthNotice(null);
    try {
      const res = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account })
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.accountStatus === 'PENDING_APPROVAL') {
          setAuthNotice(data.error || 'Expert application awaiting verification.');
          setAuthPortalType('EXPERT');
        } else {
          setAuthNotice(data.error || 'Demo sign-in unavailable.');
        }
        return;
      }

      if (data.token && data.user) {
        handleAuthSuccess(data.token, data.user);
      }
    } catch (err) {
      console.error('Quick dev login error:', err);
    }
  };

  // Process Voice / Text Command
  const handleRunCommand = (transcript: string) => {
    const lower = transcript.toLowerCase();

    if (lower.includes('kothrud') || lower.includes('कोथरूड') || lower.includes('कोथरूड')) {
      setExternalOriginId('N_SHIVAJINAGAR');
      setExternalDestId('N_KOTHRUD');
      setCitizenNavOverride('routes');
      const msg = 'Opening safest route toward Kothrud / Chandani Chowk.';
      setVoiceFeedback(msg);
      speakText(msg, lang);
      return;
    }

    if (lower.includes('hinjewadi') || lower.includes('hinjawadi') || lower.includes('wakad') || lower.includes('pimpri') || lower.includes('पिंपरी')) {
      setExternalOriginId('N_SHIVAJINAGAR');
      setExternalDestId('N_WAKAD');
      setCitizenNavOverride('routes');
      const msg = 'Opening route corridor toward Wakad / Hinjawadi (PCMC).';
      setVoiceFeedback(msg);
      speakText(msg, lang);
      return;
    }

    if (lower.includes('sinhagad') || lower.includes('सिंहगड')) {
      const sinhagadRoad = roads.find(r => r.name.toLowerCase().includes('sinhagad'));
      if (sinhagadRoad) setSelectedRoad(sinhagadRoad);
      setCitizenNavOverride('routes');
      const msg = `Sinhagad Road status: ${sinhagadRoad?.status || 'Checked'}. Risk score: ${sinhagadRoad?.riskScore ?? 'Unknown'}.`;
      setVoiceFeedback(msg);
      speakText(msg, lang);
      return;
    }

    if (lower.includes('report') || lower.includes('waterlog') || lower.includes('पाणी') || lower.includes('जलभराव')) {
      setCitizenNavOverride('community');
      const msg = 'Opening Community Hazard Reporting feed.';
      setVoiceFeedback(msg);
      speakText(msg, lang);
      return;
    }

    if (lower.includes('shelter') || lower.includes('sos') || lower.includes('help') || lower.includes('मदत') || lower.includes('आश्रय')) {
      setCitizenNavOverride('emergency');
      const msg = 'Opening Emergency SOS & verified shelters directory.';
      setVoiceFeedback(msg);
      speakText(msg, lang);
      return;
    }

    const fallbackMsg = `Command heard: "${transcript}". Opening SanketSetu Emergency Assistant if you need detailed guidance.`;
    setVoiceFeedback(fallbackMsg);
    speakText(fallbackMsg, lang);
  };

  // Voice Assistant Activation (handles permission denial & unsupported browsers cleanly)
  const handleTriggerVoice = () => {
    if (isVoiceListening) {
      setIsVoiceListening(false);
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      setVoiceFeedback('Browser voice recognition unavailable. Use the text command bar here instead.');
      return;
    }

    setIsVoiceListening(true);
    setVoiceFeedback('Listening for Pune/PCMC command...');
    speakText('SanketSetu listening. Speak your destination or command.', lang);

    startSpeechRecognition(lang, {
      onResult: (transcript) => {
        setIsVoiceListening(false);
        handleRunCommand(transcript);
      },
      onError: (err) => {
        setIsVoiceListening(false);
        setVoiceFeedback(err);
      },
      onEnd: () => {
        setIsVoiceListening(false);
      }
    });
  };

  // Add Community Report (persisted in SQLite; NEVER auto-closes a road)
  const handleAddReport = async (newReportData: Partial<CommunityReport>): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(newReportData)
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error || 'Could not submit report.' };
      }
      if (data.report) {
        setReports(prev => [data.report, ...prev]);
      }
      if (Array.isArray(data.roads)) {
        setRoads(data.roads);
      }
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error while saving report.' };
    }
  };

  // Vote on Live Poll (one vote per user per poll enforced server-side)
  const handleVotePoll = async (pollId: string, option: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/polls/${pollId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ option })
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error || 'Could not record vote.' };
      }
      if (data.poll) {
        setPolls(prev => prev.map(p => (p.id === pollId ? data.poll : p)));
      }
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error while voting.' };
    }
  };

  // Submit Route Feedback
  const handleSubmitFeedback = async (fbData: Partial<RouteFeedback>) => {
    try {
      const res = await fetch('/api/routes/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(fbData)
      });
      const data = await res.json();
      if (res.ok && data.feedback) {
        setRouteFeedbacks(prev => [data.feedback, ...prev]);
      }
    } catch {
      // ignore
    }
  };

  // Mark notification read
  const handleMarkNotificationRead = async (id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, isRead: true } : n)));
    if (!token) return;
    fetch(`/api/notifications/${id}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` }
    }).catch(() => {});
  };

  // Expert Action: Update Road Status (requires reason & supports expiry)
  const handleUpdateRoadStatus = async (
    roadId: string,
    status: RoadStatus,
    reason: string,
    riskScore?: number,
    expiresInHours?: number
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/roads/${roadId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ status, reason, riskScore, expiresInHours })
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error || 'Failed to update road status.' };
      }
      if (data.updatedRoad) {
        setRoads(prev => prev.map(r => (r.id === roadId ? data.updatedRoad : r)));
      }
      fetchAuditLogs();
      hydrateLiveData(token);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error while updating road status.' };
    }
  };

  // Expert Action: Verify / Reject / Resolve Citizen Report
  const handleVerifyReport = async (
    reportId: string,
    verificationStatus: CommunityReport['verificationStatus'],
    officialAction?: 'verify_hazard' | 'close_road',
    reviewNotes?: string,
    expiresInHours?: number
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/reports/${reportId}/verify`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ verificationStatus, officialAction, reviewNotes, expiresInHours })
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error || 'Failed to verify report.' };
      }
      if (data.report) {
        setReports(prev => prev.map(rep => (rep.id === reportId ? data.report : rep)));
      }
      if (Array.isArray(data.roads)) {
        setRoads(data.roads);
      }
      fetchAuditLogs();
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error while verifying report.' };
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300">
        <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold tracking-wide text-cyan-400">Initializing SanketSetu System...</p>
      </div>
    );
  }

  // GATEWAY 1: Welcome Portal
  if (!currentUser && !authPortalType) {
    return (
      <WelcomePortal
        onSelectRole={(role) => {
          setAuthNotice(null);
          setAuthPortalType(role);
        }}
        onQuickDevLogin={handleQuickDevLogin}
        lang={lang}
      />
    );
  }

  // GATEWAY 2: Dedicated Auth View (Citizen or Expert)
  if (!currentUser && authPortalType) {
    return (
      <div className="min-h-screen bg-slate-950">
        {authNotice && (
          <div className="bg-amber-950/80 border-b border-amber-700 text-amber-200 text-xs text-center py-2 px-4">
            {authNotice}
          </div>
        )}
        <AuthView
          portalType={authPortalType}
          onBackToPortal={() => {
            setAuthNotice(null);
            setAuthPortalType(null);
          }}
          onAuthSuccess={handleAuthSuccess}
          lang={lang}
        />
      </div>
    );
  }

  // GATEWAY 3: Citizen Interface (Zero Authority Controls)
  if (currentUser && currentUser.role === 'CITIZEN') {
    return (
      <>
        <CitizenView
          user={currentUser}
          onLogout={handleLogout}
          roads={roads}
          nodes={nodes}
          shelters={shelters}
          hospitals={hospitals}
          facilities={facilities}
          waterways={waterways}
          reports={reports}
          polls={polls}
          routeFeedbacks={routeFeedbacks}
          notifications={notifications}
          rainfallFeed={rainfallFeed}
          lang={lang}
          setLang={setLang}
          isOffline={isOffline}
          setIsOffline={setIsOffline}
          onOpenChat={() => setIsChatOpen(true)}
          onOpenOfflineGuide={() => setIsOfflineGuideOpen(true)}
          onTriggerVoice={handleTriggerVoice}
          onRunCommand={handleRunCommand}
          isVoiceListening={isVoiceListening}
          voiceFeedback={voiceFeedback}
          onAddReport={handleAddReport}
          onVotePoll={handleVotePoll}
          onSubmitFeedback={handleSubmitFeedback}
          onMarkNotificationRead={handleMarkNotificationRead}
          activeCalculation={activeCalculation}
          onRouteCalculated={setActiveCalculation}
          selectedRoad={selectedRoad}
          onSelectRoad={setSelectedRoad}
          externalOriginId={externalOriginId}
          externalDestId={externalDestId}
          onGpsDetectedOrigin={nodeId => setExternalOriginId(nodeId)}
          activeNavOverride={citizenNavOverride}
          onClearNavOverride={() => setCitizenNavOverride(undefined)}
        />

        <ChatbotModal
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          lang={lang}
        />
        <OfflineGuideModal
          isOpen={isOfflineGuideOpen}
          onClose={() => setIsOfflineGuideOpen(false)}
          lang={lang}
        />
      </>
    );
  }

  // GATEWAY 4: Expert Interface (Strictly EXPERT role only)
  if (currentUser && currentUser.role === 'EXPERT') {
    return (
      <>
        <ExpertView
          user={currentUser}
          token={token || ''}
          onLogout={handleLogout}
          roads={roads}
          nodes={nodes}
          shelters={shelters}
          hospitals={hospitals}
          facilities={facilities}
          waterways={waterways}
          reports={reports}
          rainfallFeed={rainfallFeed}
          auditLogs={auditLogs}
          onUpdateRoadStatus={handleUpdateRoadStatus}
          onVerifyReport={handleVerifyReport}
          selectedRoad={selectedRoad}
          onSelectRoad={setSelectedRoad}
          onRefreshAuditLogs={fetchAuditLogs}
        />

        <ChatbotModal
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          lang={lang}
        />
        <OfflineGuideModal
          isOpen={isOfflineGuideOpen}
          onClose={() => setIsOfflineGuideOpen(false)}
          lang={lang}
        />
      </>
    );
  }

  return (
    <WelcomePortal
      onSelectRole={(role) => setAuthPortalType(role)}
      onQuickDevLogin={handleQuickDevLogin}
      lang={lang}
    />
  );
}

export default App;
