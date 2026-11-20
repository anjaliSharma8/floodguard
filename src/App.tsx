import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  AuditLog,
  ExpertAlert,
  TrafficFeedStatus
} from './types';
import {
  PUNE_ROAD_NODES,
  INITIAL_ROAD_SEGMENTS,
  INITIAL_SHELTERS,
  INITIAL_HOSPITALS,
  INITIAL_EMERGENCY_FACILITIES,
  INITIAL_WATERWAYS,
  INITIAL_POLLS
} from './data/puneData';
import { ActiveRouteSelection, createRouteSelection, RouteMode } from './utils/rules';
import { WelcomePortal } from './components/WelcomePortal';
import { AuthView } from './components/AuthView';
import { CitizenView } from './components/CitizenView';
import { ExpertView } from './components/ExpertView';
import { ChatbotModal } from './components/ChatbotModal';
import { OfflineGuideModal } from './components/OfflineGuideModal';
import { VoiceAssistant } from './components/VoiceAssistant';
import { submitSosRequest } from './services/sosService';
import {
  deletePendingReport,
  downloadOfflineData as downloadOfflineDatasets,
  getOfflineDataset,
  getOfflineStorageSummary,
  getPendingReports,
  savePendingReport
} from './services/offlineStorage';
import type { OfflineStorageSummary, PendingReportPayload } from './services/offlineStorage';

const TOKEN_STORAGE_KEY = 'sanketsetu_token';
const USER_STORAGE_KEY = 'sanketsetu_user';
type TrafficStatusSummary = Pick<
  TrafficFeedStatus,
  'provider' | 'isLiveActive' | 'lastChecked' | 'lastSuccessfulUpdate' | 'message'
>;

function createRequestId(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('Secure request IDs are unavailable in this browser.');
  }
  return globalThis.crypto.randomUUID();
}

export function App() {
  // Authentication & Session State (strictly CITIZEN | EXPERT)
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authPortalType, setAuthPortalType] = useState<'CITIZEN' | 'EXPERT' | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);
  const [isRoleVerified, setIsRoleVerified] = useState<boolean>(false);

  // App Configuration & General State
  const [lang, setLang] = useState<Language>('en');
  const [deviceOnline, setDeviceOnline] = useState<boolean>(
    () => typeof navigator === 'undefined' || navigator.onLine
  );
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);
  const [openMeteoStatus, setOpenMeteoStatus] = useState<string | null>(null);
  const [trafficStatus, setTrafficStatus] = useState<string | null>(null);
  const [trafficFeedStatus, setTrafficFeedStatus] = useState<TrafficStatusSummary | null>(null);
  const [rainfallDataState, setRainfallDataState] = useState<'LIVE' | 'CACHED' | 'UNAVAILABLE'>('UNAVAILABLE');
  const [operationalDataState, setOperationalDataState] = useState<'LIVE' | 'CACHED' | 'UNAVAILABLE'>('UNAVAILABLE');
  const [offlineStorageSummary, setOfflineStorageSummary] = useState<OfflineStorageSummary | null>(null);
  const [pendingQueueError, setPendingQueueError] = useState<string | null>(null);
  const [lastLiveDataUpdate, setLastLiveDataUpdate] = useState<string | null>(null);
  const pendingReportSyncRef = useRef(false);
  const isOffline = !deviceOnline || backendAvailable === false;
  const isAuthorizedExpert =
    currentUser?.role === 'EXPERT' &&
    currentUser.accountStatus === 'ACTIVE' &&
    isRoleVerified;

  // Core Hydrological & Spatial Data (hydrated from backend APIs + offline fallback)
  const [nodes, setNodes] = useState<Record<string, RoadNode>>(PUNE_ROAD_NODES);
  const [roads, setRoads] = useState<RoadSegment[]>(INITIAL_ROAD_SEGMENTS);
  const [shelters, setShelters] = useState<Shelter[]>(INITIAL_SHELTERS);
  const [hospitals, setHospitals] = useState<Hospital[]>(INITIAL_HOSPITALS);
  const [facilities, setFacilities] = useState<EmergencyFacility[]>(INITIAL_EMERGENCY_FACILITIES);
  const [waterways, setWaterways] = useState<WaterwayFeature[]>(INITIAL_WATERWAYS);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [polls, setPolls] = useState<LivePoll[]>(INITIAL_POLLS);
  const [routeFeedbacks, setRouteFeedbacks] = useState<RouteFeedback[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [rainfallFeed, setRainfallFeed] = useState<RainfallFeedMetadata | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [expertAlerts, setExpertAlerts] = useState<ExpertAlert[]>([]);
  const [expertAlertsLoading, setExpertAlertsLoading] = useState(false);
  const [expertAlertsError, setExpertAlertsError] = useState<string | null>(null);

  const refreshOfflineStorageSummary = useCallback(async () => {
    const summary = await getOfflineStorageSummary();
    setOfflineStorageSummary(summary);
    return summary;
  }, []);

  const hydrateOfflineData = useCallback(async () => {
    const [roadRecord, shelterRecord, hospitalRecord, facilityRecord, waterwayRecord, rainfallRecord] =
      await Promise.all([
        getOfflineDataset('roads'),
        getOfflineDataset('shelters'),
        getOfflineDataset('hospitals'),
        getOfflineDataset('emergency-facilities'),
        getOfflineDataset('waterways'),
        getOfflineDataset('rainfall')
      ]);

    if (roadRecord?.data && typeof roadRecord.data === 'object') {
      const cachedRoads = roadRecord.data as {
        nodes?: Record<string, RoadNode>;
        segments?: RoadSegment[];
        rainfall?: RainfallFeedMetadata;
        lastUpdated?: string;
      };
      if (cachedRoads.nodes && typeof cachedRoads.nodes === 'object' && Array.isArray(cachedRoads.segments)) {
        setNodes(cachedRoads.nodes);
        setRoads(cachedRoads.segments);
        setOperationalDataState(current => current === 'LIVE' ? current : 'CACHED');
        if (cachedRoads.rainfall && Array.isArray(cachedRoads.rainfall.observations)) {
          setRainfallFeed(cachedRoads.rainfall);
        }
        if (cachedRoads.rainfall &&
          Array.isArray(cachedRoads.rainfall.observations) &&
          cachedRoads.rainfall.observations.some(observation => observation.isAvailable)) {
          setRainfallDataState(current => current === 'LIVE' ? current : 'CACHED');
        }
        if (cachedRoads.lastUpdated) setLastLiveDataUpdate(cachedRoads.lastUpdated);
      }
    }

    if (Array.isArray(shelterRecord?.data)) setShelters(shelterRecord.data as Shelter[]);
    if (Array.isArray(hospitalRecord?.data)) setHospitals(hospitalRecord.data as Hospital[]);
    if (Array.isArray(facilityRecord?.data)) setFacilities(facilityRecord.data as EmergencyFacility[]);
    if (Array.isArray(waterwayRecord?.data)) setWaterways(waterwayRecord.data as WaterwayFeature[]);
    if (rainfallRecord?.data && typeof rainfallRecord.data === 'object') {
      const cachedRainfall = rainfallRecord.data as RainfallFeedMetadata;
      if (Array.isArray(cachedRainfall.observations)) {
        setRainfallFeed(cachedRainfall);
      }
      if (Array.isArray(cachedRainfall.observations) &&
        cachedRainfall.observations.some(observation => observation.isAvailable)) {
        setRainfallDataState(current => current === 'LIVE' ? current : 'CACHED');
      }
    }
    await refreshOfflineStorageSummary();
  }, [refreshOfflineStorageSummary]);

  // Routing & Map Selection State
  const [activeCalculation, setActiveCalculation] = useState<ActiveRouteSelection | null>(null);
  const [selectedRoad, setSelectedRoad] = useState<RoadSegment | null>(null);
  const [externalOriginId, setExternalOriginId] = useState<string | undefined>(undefined);
  const [externalDestId, setExternalDestId] = useState<string | undefined>(undefined);
  const [voiceRouteRequest, setVoiceRouteRequest] = useState<{
    id: number;
    startNodeId: string;
    targetNodeId: string;
    mode: RouteMode;
  } | null>(null);
  const [voiceRouteSelectionRequest, setVoiceRouteSelectionRequest] = useState<{
    id: number;
    mode: RouteMode;
    alternativeIndex?: number;
  } | null>(null);
  const [requestedMapLayer, setRequestedMapLayer] = useState<{
    id: number;
    layer: 'shelters' | 'hospitals' | 'reports';
    center?: [number, number];
  } | null>(null);
  const [voiceShelterFilterRequest, setVoiceShelterFilterRequest] = useState<{
    id: number;
    petFriendly: boolean;
    wheelchairAccessible: boolean;
  } | null>(null);
  const voiceRequestIdRef = useRef(0);
  const [citizenNavOverride, setCitizenNavOverride] = useState<
    'dashboard' | 'routes' | 'community' | 'emergency' | 'my-reports' | 'alerts' | 'profile' | undefined
  >(undefined);

  // Modals & Voice State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isOfflineGuideOpen, setIsOfflineGuideOpen] = useState(false);
  const [isVoiceAssistantOpen, setIsVoiceAssistantOpen] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);

  const fetchAuditLogs = useCallback(() => {
    if (!token) return;
    fetch('/api/expert/audit-logs', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.auditLogs) setAuditLogs(data.auditLogs);
      })
      .catch(error => console.warn('[SanketSetu] Could not load expert audit logs:', error));
  }, [token]);

  const fetchExpertAlerts = useCallback(() => {
    if (!token) return;
    setExpertAlertsLoading(true);
    setExpertAlertsError(null);
    fetch('/api/expert/alerts', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async response => {
        if (!response.ok) throw new Error(`Expert alerts returned HTTP ${response.status}`);
        return response.json() as Promise<{ alerts?: ExpertAlert[] }>;
      })
      .then(data => {
        if (Array.isArray(data.alerts)) setExpertAlerts(data.alerts);
      })
      .catch(error => {
        setExpertAlertsError(error instanceof Error ? error.message : String(error));
        console.warn('[SanketSetu] Could not load expert alerts:', error);
      })
      .finally(() => setExpertAlertsLoading(false));
  }, [token]);

  const hydrateLiveData = useCallback((authToken?: string | null) => {
    const authHeaders = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
    const load = <T,>(url: string, apply: (data: T) => void, headers?: HeadersInit) => {
      void fetch(url, { headers })
        .then(response => {
          if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
          return response.json() as Promise<T>;
        })
        .then(apply)
        .catch(error => console.warn(`[SanketSetu] Could not load ${url}:`, error));
    };

    load<{ nodes?: Record<string, RoadNode>; segments?: RoadSegment[]; rainfall?: RainfallFeedMetadata; lastUpdated?: string }>(
      '/api/roads',
      data => {
        if (data.nodes) setNodes(data.nodes);
        if (data.segments) setRoads(data.segments);
        if (data.rainfall) {
          setRainfallFeed(data.rainfall);
          setRainfallDataState(
            data.rainfall.openMeteoStatus === 'OK' ? 'LIVE' : 'UNAVAILABLE'
          );
        }
        if (data.lastUpdated) setLastLiveDataUpdate(data.lastUpdated);
      }
    );
    load<Shelter[]>('/api/shelters', data => { if (Array.isArray(data)) setShelters(data); });
    load<Hospital[]>('/api/hospitals', data => { if (Array.isArray(data)) setHospitals(data); });
    load<EmergencyFacility[]>('/api/emergency-facilities', data => { if (Array.isArray(data)) setFacilities(data); });
    load<WaterwayFeature[]>('/api/waterways', data => { if (Array.isArray(data)) setWaterways(data); });
    load<CommunityReport[]>('/api/reports', data => { if (Array.isArray(data)) setReports(data); });
    load<LivePoll[]>('/api/polls', data => { if (Array.isArray(data)) setPolls(data); }, authHeaders);
    load<RouteFeedback[]>('/api/routes/feedback', data => { if (Array.isArray(data)) setRouteFeedbacks(data); });
    load<AppNotification[]>('/api/notifications', data => { if (Array.isArray(data)) setNotifications(data); }, authHeaders);
  }, []);

  useEffect(() => {
    const handleOnline = () => setDeviceOnline(navigator.onLine);
    const handleOffline = () => {
      setDeviceOnline(false);
      setBackendAvailable(false);
      setOperationalDataState(current => current === 'LIVE' ? 'CACHED' : current);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let healthInProgress = false;
    let refreshInProgress = false;
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

    const checkConnectivity = async () => {
      if (healthInProgress || !navigator.onLine) {
        if (!navigator.onLine && !disposed) setBackendAvailable(false);
        return;
      }
      healthInProgress = true;
      try {
        const response = await fetch('/api/health', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Backend health returned HTTP ${response.status}`);
        const health = await response.json() as {
          weatherFeed?: { openMeteoStatus?: string; lastSuccessfulUpdate?: string | null };
        };
        if (disposed) return;
        setBackendAvailable(true);
        setOpenMeteoStatus(health.weatherFeed?.openMeteoStatus || 'UNAVAILABLE');

        if (!isAuthorizedExpert) {
          setTrafficFeedStatus(null);
          setTrafficStatus(null);
          return;
        }

        try {
          const trafficResponse = await fetch('/api/traffic/status', {
            headers: authHeaders,
            cache: 'no-store'
          });
          if (!trafficResponse.ok) throw new Error(`Traffic status returned HTTP ${trafficResponse.status}`);
          const traffic = await trafficResponse.json() as TrafficStatusSummary;
          if (!disposed) {
            setTrafficFeedStatus(traffic);
            setTrafficStatus(
              traffic.isLiveActive ? 'LIVE' : traffic.message || 'Estimated speeds only'
            );
          }
        } catch (error) {
          if (!disposed) {
            setTrafficFeedStatus(null);
            setTrafficStatus('Status unavailable');
            console.warn('[SanketSetu] Traffic provider status check failed:', error);
          }
        }
      } catch (error) {
        if (!disposed) {
          setBackendAvailable(false);
          setTrafficFeedStatus(null);
          setTrafficStatus('Status unavailable');
          console.warn('[SanketSetu] Connectivity check failed:', error);
        }
      } finally {
        healthInProgress = false;
      }
    };

    const refreshLiveData = async () => {
      if (refreshInProgress || !navigator.onLine) return;
      refreshInProgress = true;
      try {
        const [roadsResponse, reportsResponse, pollsResponse, feedbackResponse, notificationsResponse] =
          await Promise.all([
            fetch('/api/roads', { cache: 'no-store' }),
            fetch('/api/reports', { cache: 'no-store' }),
            fetch('/api/polls', { headers: authHeaders, cache: 'no-store' }),
            fetch('/api/routes/feedback', { cache: 'no-store' }),
            fetch('/api/notifications', { headers: authHeaders, cache: 'no-store' })
          ]);
        const responses = [
          ['roads', roadsResponse],
          ['reports', reportsResponse],
          ['polls', pollsResponse],
          ['route feedback', feedbackResponse],
          ['notifications', notificationsResponse]
        ] as const;
        const failed = responses.find(([, response]) => !response.ok);
        if (failed) throw new Error(`${failed[0]} refresh returned HTTP ${failed[1].status}`);

        const [roadData, reportData, pollData, feedbackData, notificationData] = await Promise.all([
          roadsResponse.json(),
          reportsResponse.json(),
          pollsResponse.json(),
          feedbackResponse.json(),
          notificationsResponse.json()
        ]);
        if (
          !Array.isArray(roadData?.segments) ||
          !Array.isArray(reportData) ||
          !Array.isArray(pollData) ||
          !Array.isArray(feedbackData) ||
          !Array.isArray(notificationData)
        ) {
          throw new Error('A live data endpoint returned an invalid response shape.');
        }
        if (disposed) return;
        setRoads(roadData.segments);
        if (roadData.nodes && typeof roadData.nodes === 'object') setNodes(roadData.nodes);
        if (roadData.rainfall) {
          setRainfallFeed(roadData.rainfall);
          setRainfallDataState(
            roadData.rainfall.openMeteoStatus === 'OK' ? 'LIVE' : 'UNAVAILABLE'
          );
        }
        setReports(reportData);
        setPolls(pollData);
        setRouteFeedbacks(feedbackData);
        setNotifications(notificationData);
        setLastLiveDataUpdate(typeof roadData.lastUpdated === 'string' ? roadData.lastUpdated : null);
        setOperationalDataState('LIVE');
      } catch (error) {
        if (!disposed) {
          setOperationalDataState(current => current === 'LIVE' ? 'CACHED' : current);
          console.warn('[SanketSetu] Live data refresh failed:', error);
        }
      } finally {
        refreshInProgress = false;
      }
    };

    const refreshAll = () => {
      void checkConnectivity();
      void refreshLiveData();
    };
    const onOnline = () => {
      setDeviceOnline(true);
      refreshAll();
    };
    window.addEventListener('online', onOnline);
    refreshAll();
    const healthInterval = window.setInterval(() => { void checkConnectivity(); }, 30_000);
    const dataInterval = window.setInterval(() => { void refreshLiveData(); }, 60_000);

    return () => {
      disposed = true;
      window.removeEventListener('online', onOnline);
      window.clearInterval(healthInterval);
      window.clearInterval(dataInterval);
    };
  }, [token, isAuthorizedExpert]);

  useEffect(() => {
    void hydrateOfflineData().catch(error => {
      console.warn('[SanketSetu] Could not load downloaded offline data:', error);
    });
  }, [hydrateOfflineData]);

  const handleDownloadOfflineData = useCallback(async () => {
    if (!deviceOnline || backendAvailable === false) {
      throw new Error('Connect to the SanketSetu backend before downloading offline data.');
    }
    const result = await downloadOfflineDatasets();
    await hydrateOfflineData();
    return { saved: result.saved.length, errors: result.errors };
  }, [deviceOnline, backendAvailable, hydrateOfflineData]);

  const handleSubmitSos = async (request: Parameters<typeof submitSosRequest>[0]) => {
    const result = await submitSosRequest(request);
    if (result.status === 'queued') {
      try {
        await refreshOfflineStorageSummary();
      } catch (error) {
        console.warn('[SanketSetu] Could not refresh offline SOS queue status:', error);
      }
    }
    return result;
  };

  // Session restore on mount
  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    const savedUser = localStorage.getItem(USER_STORAGE_KEY);

    if (savedToken && savedUser) {
      try {
        const parsed = JSON.parse(savedUser) as User;
        setToken(savedToken);
        setCurrentUser(parsed);
        setIsRoleVerified(false);
        if (parsed.preferredLanguage) setLang(parsed.preferredLanguage);

        fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${savedToken}` }
        })
          .then(res => (res.ok ? res.json() : null))
          .then(data => {
            if (data?.success && data.user) {
              setCurrentUser(data.user);
              setIsRoleVerified(
                data.user.role !== 'EXPERT' || data.user.accountStatus === 'ACTIVE'
              );
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
        fetchExpertAlerts();
      }
    }
  }, [token, currentUser?.role, hydrateLiveData, fetchAuditLogs, fetchExpertAlerts]);

  const handleAuthSuccess = (newToken: string, user: User) => {
    setToken(newToken);
    setCurrentUser(user);
    setIsRoleVerified(user.role !== 'EXPERT' || user.accountStatus === 'ACTIVE');
    setAuthPortalType(null);
    setAuthNotice(null);
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    if (user.preferredLanguage) setLang(user.preferredLanguage);
  };

  const handleLogout = () => {
    setIsVoiceAssistantOpen(false);
    setIsVoiceListening(false);
    if (token) {
      fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    }
    setToken(null);
    setCurrentUser(null);
    setIsRoleVerified(false);
    setAuthPortalType(null);
    setActiveCalculation(null);
    setCitizenNavOverride(undefined);
    setRequestedMapLayer(null);
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

  const handleTriggerVoice = () => setIsVoiceAssistantOpen(true);

  const handleVoiceRouteRequest = (startNodeId: string, targetNodeId: string, mode: RouteMode) => {
    const id = ++voiceRequestIdRef.current;
    setExternalOriginId(startNodeId);
    setExternalDestId(targetNodeId);
    setCitizenNavOverride('routes');
    setVoiceRouteRequest({ id, startNodeId, targetNodeId, mode });
  };

  const handleVoiceMapLayer = (
    layer: 'shelters' | 'hospitals' | 'reports',
    center?: [number, number]
  ) => {
    const id = ++voiceRequestIdRef.current;
    setRequestedMapLayer({ id, layer, center });
  };

  const handleVoiceRouteSelection = (mode: RouteMode, alternativeIndex?: number) => {
    const id = ++voiceRequestIdRef.current;
    setCitizenNavOverride('routes');
    setVoiceRouteSelectionRequest({ id, mode, alternativeIndex });
    setActiveCalculation(current =>
      current ? createRouteSelection(current, mode, alternativeIndex) : current
    );
  };

  const handleVoiceShelterFilter = (filters: { petFriendly: boolean; wheelchairAccessible: boolean }) => {
    const id = ++voiceRequestIdRef.current;
    setVoiceShelterFilterRequest({ id, ...filters });
  };

  // Community reports remain pending until the server acknowledges persistence.
  const handleAddReport = async (
    newReportData: Partial<CommunityReport>
  ): Promise<{ ok: boolean; error?: string; queued?: boolean }> => {
    if (!currentUser || !token) {
      return { ok: false, error: 'Sign in again before submitting a community report.' };
    }

    const queueReport = async (clientRequestId: string): Promise<{ ok: boolean; error?: string; queued?: boolean }> => {
      if (newReportData.imageUrl) {
        return {
          ok: false,
          error: 'Photo reports cannot be queued offline. Reconnect and submit the photo report again.'
        };
      }
      if (
        !newReportData.locationName ||
        typeof newReportData.lat !== 'number' ||
        typeof newReportData.lng !== 'number' ||
        !newReportData.reportType ||
        !newReportData.severity
      ) {
        return { ok: false, error: 'A named location, report type, severity, and actual coordinates are required for an offline report.' };
      }

      const report: PendingReportPayload['report'] = {
        locationName: newReportData.locationName.trim(),
        lat: newReportData.lat,
        lng: newReportData.lng,
        reportType: newReportData.reportType,
        description: newReportData.description?.trim() || 'Citizen reported water hazard',
        severity: newReportData.severity,
        ...(newReportData.roadId ? { roadId: newReportData.roadId } : {})
      };
      try {
        await savePendingReport({
          clientRequestId,
          ownerUserId: currentUser.id,
          report,
          createdAt: new Date().toISOString()
        });
        await refreshOfflineStorageSummary();
        return { ok: true, queued: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setPendingQueueError(message);
        return { ok: false, error: `Report was not submitted or saved offline: ${message}` };
      }
    };

    let clientRequestId: string;
    try {
      clientRequestId = createRequestId();
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }

    if (!deviceOnline || backendAvailable === false) {
      return queueReport(clientRequestId);
    }

    let response: Response;
    try {
      response = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ ...newReportData, clientRequestId })
      });
    } catch {
      return queueReport(clientRequestId);
    }

    let data: {
      error?: string;
      report?: CommunityReport;
      roads?: RoadSegment[];
    };
    try {
      data = await response.json() as typeof data;
    } catch {
      if (response.status >= 500 || response.ok) return queueReport(clientRequestId);
      return { ok: false, error: `Report submission failed with HTTP ${response.status}.` };
    }

    if (!response.ok) {
      if (response.status >= 500) return queueReport(clientRequestId);
      return { ok: false, error: data.error || `Report submission failed with HTTP ${response.status}.` };
    }

    if (data.report) {
      setReports(prev => [data.report!, ...prev.filter(report => report.id !== data.report!.id)]);
    }
    if (Array.isArray(data.roads)) setRoads(data.roads);
    return { ok: true };
  };

  const syncPendingReports = useCallback(async () => {
    if (
      pendingReportSyncRef.current ||
      !deviceOnline ||
      backendAvailable !== true ||
      !token ||
      !currentUser
    ) return;
    pendingReportSyncRef.current = true;
    setPendingQueueError(null);
    try {
      const pendingReports = await getPendingReports();
      for (const pending of pendingReports) {
        if (pending.ownerUserId !== currentUser.id) {
          setPendingQueueError('Some queued reports belong to another signed-in user and were not submitted.');
          continue;
        }

        try {
          const response = await fetch('/api/reports', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              ...pending.report,
              clientRequestId: pending.clientRequestId
            })
          });
          const data = await response.json() as {
            error?: string;
            report?: CommunityReport;
            roads?: RoadSegment[];
          };
          if (!response.ok || !data.report) {
            const message = data.error || `Report sync failed with HTTP ${response.status}.`;
            await savePendingReport({ ...pending, lastError: message });
            setPendingQueueError(message);
            if (response.status >= 500 || response.status === 401) break;
            continue;
          }

          setReports(prev => [data.report!, ...prev.filter(report => report.id !== data.report!.id)]);
          if (Array.isArray(data.roads)) setRoads(data.roads);
          await deletePendingReport(pending.clientRequestId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await savePendingReport({ ...pending, lastError: message });
          setPendingQueueError(message);
          break;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPendingQueueError(message);
    } finally {
      pendingReportSyncRef.current = false;
      try {
        await refreshOfflineStorageSummary();
      } catch (error) {
        console.warn('[SanketSetu] Could not refresh offline queue status:', error);
      }
    }
  }, [deviceOnline, backendAvailable, token, currentUser, refreshOfflineStorageSummary]);

  useEffect(() => {
    void syncPendingReports();
    const intervalId = window.setInterval(() => { void syncPendingReports(); }, 60_000);
    return () => window.clearInterval(intervalId);
  }, [syncPendingReports]);

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

  const handleCreateExpertAlert = async (
    alert: { title: string; message: string; severity: AppNotification['severity']; relatedRoadId?: string }
  ): Promise<{ ok: boolean; error?: string; alert?: ExpertAlert }> => {
    if (!token || !deviceOnline || backendAvailable !== true) {
      return { ok: false, error: 'Connect to the live backend before creating an alert.' };
    }
    try {
      const response = await fetch('/api/expert/alerts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(alert)
      });
      const data = await response.json() as {
        error?: string;
        notification?: AppNotification;
        alert?: ExpertAlert;
      };
      if (!response.ok || !data.notification || !data.alert) {
        return { ok: false, error: data.error || `Alert creation failed with HTTP ${response.status}.` };
      }
      setNotifications(previous => [data.notification!, ...previous.filter(item => item.id !== data.notification!.id)]);
      setExpertAlerts(previous => [data.alert!, ...previous.filter(item => item.id !== data.alert!.id)]);
      fetchAuditLogs();
      return { ok: true, alert: data.alert };
    } catch {
      return { ok: false, error: 'Network error while creating the in-app alert.' };
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
        deviceOnline={deviceOnline}
        backendAvailable={backendAvailable}
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
          deviceOnline={deviceOnline}
          backendAvailable={backendAvailable}
          lastLiveDataUpdate={lastLiveDataUpdate}
          onOpenChat={() => setIsChatOpen(true)}
          onOpenOfflineGuide={() => setIsOfflineGuideOpen(true)}
          onTriggerVoice={handleTriggerVoice}
          isVoiceListening={isVoiceListening}
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
          voiceRouteRequest={voiceRouteRequest}
          voiceRouteSelectionRequest={voiceRouteSelectionRequest}
          requestedMapLayer={requestedMapLayer}
          voiceShelterFilterRequest={voiceShelterFilterRequest}
          onGpsDetectedOrigin={nodeId => setExternalOriginId(nodeId)}
          activeNavOverride={citizenNavOverride}
          onClearNavOverride={() => setCitizenNavOverride(undefined)}
        />

        <ChatbotModal
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          lang={lang}
          token={token}
        />
        <OfflineGuideModal
          isOpen={isOfflineGuideOpen}
          onClose={() => setIsOfflineGuideOpen(false)}
          lang={lang}
          deviceOnline={deviceOnline}
          backendAvailable={backendAvailable}
          openMeteoStatus={openMeteoStatus}
          lastWeatherUpdate={rainfallFeed?.lastSuccessfulUpdate || null}
          lastLiveDataUpdate={lastLiveDataUpdate}
          trafficStatus={null}
          summary={offlineStorageSummary}
          pendingQueueError={pendingQueueError}
          onDownloadOfflineData={handleDownloadOfflineData}
        />
        <VoiceAssistant
          isOpen={isVoiceAssistantOpen}
          lang={lang}
          token={token}
          setLang={setLang}
          nodes={nodes}
          roads={roads}
          emergencyFacilities={facilities}
          shelters={shelters}
          hospitals={hospitals}
          reports={reports}
          myReports={currentUser ? reports.filter(report => report.userId === currentUser.id) : []}
          notifications={notifications}
          activeRoute={activeCalculation}
          onNavigate={section => setCitizenNavOverride(section)}
          onRequestRoute={handleVoiceRouteRequest}
          onSelectRoute={handleVoiceRouteSelection}
          onShowMapLayer={handleVoiceMapLayer}
          onFilterShelters={handleVoiceShelterFilter}
          onAddReport={handleAddReport}
          onSubmitSos={handleSubmitSos}
          onListeningChange={setIsVoiceListening}
          onClose={() => setIsVoiceAssistantOpen(false)}
        />
      </>
    );
  }

  if (
    currentUser?.role === 'EXPERT' &&
    (currentUser.accountStatus !== 'ACTIVE' || !isRoleVerified)
  ) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-slate-100">
        <div role="alert" className="w-full max-w-md rounded-2xl border border-amber-700 bg-slate-900 p-6 text-center shadow-xl">
          <h1 className="text-lg font-bold text-white">Expert access is unavailable</h1>
          <p className="mt-2 text-sm text-slate-300">
            {currentUser.accountStatus !== 'ACTIVE'
              ? 'Operational tools remain unavailable until the Expert account is approved.'
              : 'Reconnect to verify this account before opening the Expert portal.'}
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-5 min-h-11 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // GATEWAY 4: Expert Interface (Strictly EXPERT role only)
  if (
    currentUser &&
    currentUser.role === 'EXPERT' &&
    currentUser.accountStatus === 'ACTIVE' &&
    isRoleVerified
  ) {
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
          notifications={notifications}
          expertAlerts={expertAlerts}
          expertAlertsLoading={expertAlertsLoading}
          expertAlertsError={expertAlertsError}
          rainfallFeed={rainfallFeed}
          trafficFeedStatus={trafficFeedStatus}
          offlineStorageSummary={offlineStorageSummary}
          auditLogs={auditLogs}
          onUpdateRoadStatus={handleUpdateRoadStatus}
          onVerifyReport={handleVerifyReport}
          onCreateAlert={handleCreateExpertAlert}
          selectedRoad={selectedRoad}
          onSelectRoad={setSelectedRoad}
          onRefreshAuditLogs={fetchAuditLogs}
          deviceOnline={deviceOnline}
          backendAvailable={backendAvailable}
          lastLiveDataUpdate={lastLiveDataUpdate}
          operationalDataState={operationalDataState}
          rainfallDataState={rainfallDataState}
          onOpenChat={() => setIsChatOpen(true)}
          onOpenOfflineGuide={() => setIsOfflineGuideOpen(true)}
        />

        <ChatbotModal
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          lang={lang}
          token={token}
        />
        <OfflineGuideModal
          isOpen={isOfflineGuideOpen}
          onClose={() => setIsOfflineGuideOpen(false)}
          lang={lang}
          deviceOnline={deviceOnline}
          backendAvailable={backendAvailable}
          openMeteoStatus={openMeteoStatus}
          lastWeatherUpdate={rainfallFeed?.lastSuccessfulUpdate || null}
          lastLiveDataUpdate={lastLiveDataUpdate}
          trafficStatus={trafficStatus}
          summary={offlineStorageSummary}
          pendingQueueError={pendingQueueError}
          onDownloadOfflineData={handleDownloadOfflineData}
        />
      </>
    );
  }

  return (
    <WelcomePortal
      onSelectRole={(role) => setAuthPortalType(role)}
      onQuickDevLogin={handleQuickDevLogin}
      deviceOnline={deviceOnline}
      backendAvailable={backendAvailable}
      lang={lang}
    />
  );
}

export default App;
