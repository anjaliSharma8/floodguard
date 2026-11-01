import React, { useState, useEffect, useCallback } from 'react';
import { 
  RoadSegment, 
  RoadNode, 
  Shelter, 
  Hospital, 
  EmergencyFacility, 
  CommunityReport, 
  LivePoll, 
  RouteFeedback, 
  RainfallObservation,
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
  INITIAL_COMMUNITY_REPORTS, 
  INITIAL_POLLS,
  INITIAL_RAINFALL
} from './data/puneData';
import { RouteCalculationResult } from './utils/rules';
import { WelcomePortal } from './components/WelcomePortal';
import { AuthView } from './components/AuthView';
import { CitizenView } from './components/CitizenView';
import { ExpertView } from './components/ExpertView';
import { ChatbotModal } from './components/ChatbotModal';
import { OfflineGuideModal } from './components/OfflineGuideModal';
import { startSpeechRecognition, speakText } from './utils/speech';

const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'LOG_01',
    actorId: 'USR_EXPERT_01',
    actorName: 'Dr. Rajiv Kulkarni',
    actorRole: 'EXPERT',
    action: 'ROAD_STATUS_CHANGE',
    targetResource: 'R03 (Sinhagad Road)',
    details: 'Status changed to critical_waterlogged due to 18,400 cusecs Khadakwasla Dam release',
    timestamp: '2026-10-30T08:15:00Z'
  },
  {
    id: 'LOG_02',
    actorId: 'USR_EXPERT_01',
    actorName: 'Dr. Rajiv Kulkarni',
    actorRole: 'EXPERT',
    action: 'REPORT_VERIFICATION',
    targetResource: 'REP_101',
    details: 'Verified citizen waterlogging report near Ekta Nagari',
    timestamp: '2026-10-30T08:20:00Z'
  }
];

export function App() {
  // Authentication & Session State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authPortalType, setAuthPortalType] = useState<'CITIZEN' | 'EXPERT' | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);

  // App Configuration & General State
  const [lang, setLang] = useState<Language>('en');
  const [isOffline, setIsOffline] = useState<boolean>(false);

  // Core Hydrological & Spatial Data
  const [nodes] = useState<Record<string, RoadNode>>(PUNE_ROAD_NODES);
  const [roads, setRoads] = useState<RoadSegment[]>(INITIAL_ROAD_SEGMENTS);
  const [shelters] = useState<Shelter[]>(INITIAL_SHELTERS);
  const [hospitals] = useState<Hospital[]>(INITIAL_HOSPITALS);
  const [facilities] = useState<EmergencyFacility[]>(INITIAL_EMERGENCY_FACILITIES);
  const [reports, setReports] = useState<CommunityReport[]>(INITIAL_COMMUNITY_REPORTS);
  const [polls, setPolls] = useState<LivePoll[]>(INITIAL_POLLS);
  const [routeFeedbacks, setRouteFeedbacks] = useState<RouteFeedback[]>([
    {
      id: 'FB_01',
      userId: 'usr_pune_89',
      routeName: 'Karve Road Alternative to Kothrud',
      reachedSafely: true,
      routeCondition: 'Clear with light puddles near Paud flyover',
      waterLevelCategory: 'None / Minor',
      travelTimeMins: 12,
      rating: 5,
      timestamp: new Date().toISOString()
    }
  ]);
  const [rainfall] = useState<RainfallObservation[]>(INITIAL_RAINFALL);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(INITIAL_AUDIT_LOGS);

  // Routing State
  const [activeCalculation, setActiveCalculation] = useState<{
    shortest: RouteCalculationResult;
    safest: RouteCalculationResult;
  } | null>(null);
  const [selectedRoad, setSelectedRoad] = useState<RoadSegment | null>(null);

  // Modals & Voice State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isOfflineGuideOpen, setIsOfflineGuideOpen] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);

  // Fetch audit logs when expert or admin is active
  const fetchAuditLogs = useCallback(() => {
    if (!token) return;
    fetch('/api/expert/audit-logs', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAuditLogs(data);
        } else if (data.auditLogs) {
          setAuditLogs(data.auditLogs);
        }
      })
      .catch(() => {});
  }, [token]);

  // Session restore & verification on initial load
  useEffect(() => {
    const savedToken = localStorage.getItem('floodguard_token');
    const savedUser = localStorage.getItem('floodguard_user');

    if (savedToken && savedUser) {
      try {
        const parsed = JSON.parse(savedUser) as User;
        setToken(savedToken);
        setCurrentUser(parsed);
        if (parsed.preferredLanguage) {
          setLang(parsed.preferredLanguage);
        }

        // Verify with backend
        fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${savedToken}` }
        })
          .then(res => res.json())
          .then(data => {
            if (data.success && data.user) {
              setCurrentUser(data.user);
              localStorage.setItem('floodguard_user', JSON.stringify(data.user));
            } else {
              handleLogout();
            }
          })
          .catch(() => {
            // Keep local state on network error
          })
          .finally(() => {
            setIsCheckingAuth(false);
          });
      } catch {
        handleLogout();
        setIsCheckingAuth(false);
      }
    } else {
      setIsCheckingAuth(false);
    }
  }, []);

  // Fetch updated road segments from backend
  useEffect(() => {
    fetch('/api/roads')
      .then(res => res.json())
      .then(data => {
        if (data.segments) setRoads(data.segments);
      })
      .catch(() => {});
  }, []);

  // Sync audit logs when user role is EXPERT or ADMIN
  useEffect(() => {
    if (currentUser && (currentUser.role === 'EXPERT' || currentUser.role === 'ADMIN') && token) {
      fetchAuditLogs();
    }
  }, [currentUser, token, fetchAuditLogs]);

  // Auth Handlers
  const handleAuthSuccess = (newToken: string, user: User) => {
    setToken(newToken);
    setCurrentUser(user);
    setAuthPortalType(null);
    localStorage.setItem('floodguard_token', newToken);
    localStorage.setItem('floodguard_user', JSON.stringify(user));
    if (user.preferredLanguage) {
      setLang(user.preferredLanguage);
    }
  };

  const handleLogout = () => {
    if (token) {
      fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    }
    setToken(null);
    setCurrentUser(null);
    setAuthPortalType(null);
    localStorage.removeItem('floodguard_token');
    localStorage.removeItem('floodguard_user');
  };

  // Quick Demo Login for instant Katathon evaluation
  const handleQuickDemoLogin = async (email: string, pass: string, targetRole: 'CITIZEN' | 'EXPERT') => {
    try {
      const endpoint = targetRole === 'CITIZEN' ? '/api/auth/citizen/login' : '/api/auth/expert/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass })
      });
      const data = await res.json();
      
      if (!res.ok) {
        if (data.accountStatus === 'PENDING_APPROVAL') {
          // Switch to Expert Auth screen so user sees clear "Application Awaiting Approval" screen
          setAuthPortalType('EXPERT');
        } else {
          console.warn('Quick login returned status:', data.error);
        }
        return;
      }

      if (data.token && data.user) {
        handleAuthSuccess(data.token, data.user);
      }
    } catch (err) {
      console.error('Quick demo login error:', err);
    }
  };

  // Voice Assistant Activation
  const handleTriggerVoice = () => {
    if (isVoiceListening) {
      setIsVoiceListening(false);
      return;
    }

    setIsVoiceListening(true);
    speakText('FloodGuard listening. Please speak your destination or flood report.', lang);

    startSpeechRecognition(lang, {
      onResult: (transcript) => {
        setIsVoiceListening(false);
        const lower = transcript.toLowerCase();

        if (lower.includes('kothrud') || lower.includes('कोथरूड')) {
          speakText('Routing to Kothrud Chandani Chowk road. Safest path selected.', lang);
        } else if (lower.includes('sinhagad') || lower.includes('सिंहगड')) {
          speakText('Caution: Sinhagad Road has critical waterlogging reports. Showing safe detour.', lang);
        } else if (lower.includes('report') || lower.includes('flood') || lower.includes('पाणी')) {
          speakText('Opening community incident reporting desk.', lang);
        } else if (lower.includes('shelter') || lower.includes('मदत') || lower.includes('आश्रय')) {
          speakText('Opening emergency relief shelters.', lang);
        } else {
          speakText(`Heard: ${transcript}. Checking safety advisories.`, lang);
        }
      },
      onError: (err) => {
        setIsVoiceListening(false);
        console.warn('Voice recognition notice:', err);
      },
      onEnd: () => {
        setIsVoiceListening(false);
      }
    });
  };

  // Add Community Report (Citizen)
  const handleAddReport = (newReportData: Partial<CommunityReport>) => {
    const newReport: CommunityReport = {
      id: `REP_${Date.now()}`,
      userId: currentUser?.id || `usr_cit_${Math.floor(Math.random() * 900 + 100)}`,
      locationName: newReportData.locationName || 'Pune Landmark',
      lat: newReportData.lat || 18.5204,
      lng: newReportData.lng || 73.8567,
      reportType: newReportData.reportType || 'Waterlogging',
      description: newReportData.description || 'Citizen reported water hazard',
      severity: newReportData.severity || 'Moderate',
      timestamp: new Date().toISOString(),
      verificationStatus: 'Reported',
      confidenceScore: 0.70
    };

    setReports(prev => [newReport, ...prev]);

    fetch('/api/reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(newReport)
    }).catch(() => {});
  };

  // Vote on Live Poll (Citizen)
  const handleVotePoll = (pollId: string, option: string) => {
    setPolls(prev => prev.map(p => {
      if (p.id !== pollId) return p;
      const currentVotes = p.votes[option] || 0;
      return {
        ...p,
        votes: { ...p.votes, [option]: currentVotes + 1 },
        totalVotes: p.totalVotes + 1
      };
    }));

    fetch(`/api/polls/${pollId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ option })
    }).catch(() => {});
  };

  // Submit Route Feedback (Citizen)
  const handleSubmitFeedback = (fbData: Partial<RouteFeedback>) => {
    const newFb: RouteFeedback = {
      id: `FB_${Date.now()}`,
      userId: currentUser?.id || `usr_cit_${Math.floor(Math.random() * 900 + 100)}`,
      routeName: fbData.routeName || 'Pune Route',
      reachedSafely: fbData.reachedSafely ?? true,
      routeCondition: fbData.routeCondition || 'Clear',
      waterLevelCategory: fbData.waterLevelCategory || 'None',
      travelTimeMins: fbData.travelTimeMins || 15,
      rating: fbData.rating || 5,
      timestamp: new Date().toISOString()
    };

    setRouteFeedbacks(prev => [newFb, ...prev]);

    fetch('/api/routes/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newFb)
    }).catch(() => {});
  };

  // Authority Action: Update Road Status (Open / Blocked / Waterlogged)
  const handleUpdateRoadStatus = async (roadId: string, status: RoadSegment['status'], riskScore?: number) => {
    setRoads(prev => prev.map(r => {
      if (r.id !== roadId) return r;
      return {
        ...r,
        status,
        riskScore: typeof riskScore === 'number' ? riskScore : r.riskScore
      };
    }));

    try {
      await fetch(`/api/roads/${roadId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ status, riskScore })
      });
      fetchAuditLogs();
    } catch (err) {
      console.warn('Failed to update road status:', err);
    }
  };

  // Authority Action: Verify Citizen Report
  const handleVerifyReport = async (reportId: string, status: CommunityReport['verificationStatus'], action?: string) => {
    setReports(prev => prev.map(rep => {
      if (rep.id !== reportId) return rep;
      return {
        ...rep,
        verificationStatus: status,
        confidenceScore: status === 'Verified' ? 0.95 : (status === 'Rejected' ? 0.20 : rep.confidenceScore)
      };
    }));

    try {
      await fetch(`/api/reports/${reportId}/verify`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ verificationStatus: status, officialAction: action })
      });
      fetchAuditLogs();
    } catch (err) {
      console.warn('Failed to verify report:', err);
    }
  };

  // Pre-Flood Simulation: What-If cloudburst scenario
  const handleSimulateRainfall = (simulatedMm: number) => {
    setRoads(prev => prev.map(road => {
      const elevPenalty = Math.max(0, (580 - road.baseElevationM) * 0.8);
      const rainRisk = (simulatedMm / 150) * 60;
      const drainPenalty = road.drainageCondition === 'poor' ? 30 : (road.drainageCondition === 'moderate' ? 15 : 5);
      const newScore = Math.min(100, Math.round(rainRisk + elevPenalty + drainPenalty));

      let newStatus = road.status;
      if (newScore >= 85) newStatus = 'critical_waterlogged';
      else if (newScore >= 60) newStatus = 'caution';

      return {
        ...road,
        riskScore: newScore,
        status: newStatus
      };
    }));
  };

  // While restoring session from localStorage/API, show quick clean loader
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300">
        <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold tracking-wide text-cyan-400">Verifying FloodGuard Disaster Credentials...</p>
      </div>
    );
  }

  // GATEWAY 1: Not Logged In & No Role Selected -> Render Welcome Portal
  if (!currentUser && !authPortalType) {
    return (
      <WelcomePortal
        onSelectRole={(role) => setAuthPortalType(role)}
        onQuickDemoLogin={handleQuickDemoLogin}
        lang={lang}
      />
    );
  }

  // GATEWAY 2: Not Logged In & Role Selected -> Render Dedicated Auth View (Citizen or Expert)
  if (!currentUser && authPortalType) {
    return (
      <AuthView
        portalType={authPortalType}
        onBackToPortal={() => setAuthPortalType(null)}
        onAuthSuccess={handleAuthSuccess}
        lang={lang}
      />
    );
  }

  // GATEWAY 3: Logged In as Citizen -> Dedicated Citizen Interface (NO AUTHORITY CONTROLS)
  if (currentUser && currentUser.role === 'CITIZEN') {
    return (
      <>
        <CitizenView
          user={currentUser}
          token={token || ''}
          onLogout={handleLogout}
          roads={roads}
          nodes={nodes}
          shelters={shelters}
          hospitals={hospitals}
          facilities={facilities}
          reports={reports}
          polls={polls}
          routeFeedbacks={routeFeedbacks}
          rainfall={rainfall}
          lang={lang}
          setLang={setLang}
          isOffline={isOffline}
          setIsOffline={setIsOffline}
          onOpenChat={() => setIsChatOpen(true)}
          onOpenOfflineGuide={() => setIsOfflineGuideOpen(true)}
          onTriggerVoice={handleTriggerVoice}
          isVoiceListening={isVoiceListening}
          onAddReport={handleAddReport}
          onVotePoll={handleVotePoll}
          onSubmitFeedback={handleSubmitFeedback}
          activeCalculation={activeCalculation}
          onRouteCalculated={(res) => setActiveCalculation(res)}
          selectedRoad={selectedRoad}
          onSelectRoad={(road) => setSelectedRoad(road)}
        />

        {/* Floating Modals */}
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

  // GATEWAY 4: Logged In as Expert / Admin -> Dedicated Expert Interface (FULL AUTHORITY & GIS DESK)
  if (currentUser && (currentUser.role === 'EXPERT' || currentUser.role === 'ADMIN')) {
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
          reports={reports}
          rainfall={rainfall}
          auditLogs={auditLogs}
          onUpdateRoadStatus={handleUpdateRoadStatus}
          onVerifyReport={handleVerifyReport}
          onSimulateRainfall={handleSimulateRainfall}
          selectedRoad={selectedRoad}
          onSelectRoad={(road) => setSelectedRoad(road)}
          onRefreshAuditLogs={fetchAuditLogs}
        />

        {/* Floating Modals */}
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

  // Fallback (Safe default to Welcome Portal)
  return (
    <WelcomePortal
      onSelectRole={(role) => setAuthPortalType(role)}
      onQuickDemoLogin={handleQuickDemoLogin}
      lang={lang}
    />
  );
}

export default App;
