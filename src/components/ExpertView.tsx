import React, { useState } from 'react';
import {
  User,
  RoadSegment,
  RoadNode,
  RoadStatus,
  Shelter,
  Hospital,
  EmergencyFacility,
  CommunityReport,
  RainfallFeedMetadata,
  WaterwayFeature,
  AuditLog,
  AuthorityPermission,
  AppNotification,
  ExpertAlert,
  TrafficFeedStatus
} from '../types';
import { INITIAL_HISTORICAL_FLOODS } from '../data/puneData';
import type { OfflineStorageSummary } from '../services/offlineStorage';
import { calculateFloodRisk } from '../utils/rules';
import { MapView } from './MapView';
import { DatasetExplorer } from './DatasetExplorer';
import {
  ShieldCheck,
  Database,
  AlertOctagon,
  Activity,
  Users,
  CloudRain,
  FileText,
  Layers,
  CheckCircle,
  XCircle,
  LogOut,
  KeyRound,
  BarChart2,
  Lock,
  Unlock,
  Search,
  Wifi,
  WifiOff,
  MessageSquare,
  Megaphone,
  Send
} from 'lucide-react';

interface ExpertViewProps {
  user: User;
  token: string | null;
  onLogout: () => void;
  roads: RoadSegment[];
  nodes: Record<string, RoadNode>;
  shelters: Shelter[];
  hospitals: Hospital[];
  facilities: EmergencyFacility[];
  waterways: WaterwayFeature[];
  reports: CommunityReport[];
  notifications: AppNotification[];
  expertAlerts: ExpertAlert[];
  expertAlertsLoading: boolean;
  expertAlertsError: string | null;
  rainfallFeed: RainfallFeedMetadata | null;
  trafficFeedStatus: Pick<
    TrafficFeedStatus,
    'provider' | 'isLiveActive' | 'lastChecked' | 'lastSuccessfulUpdate' | 'message'
  > | null;
  offlineStorageSummary: OfflineStorageSummary | null;
  auditLogs: AuditLog[];
  onUpdateRoadStatus: (
    roadId: string,
    status: RoadStatus,
    reason: string,
    riskScore?: number,
    expiresInHours?: number
  ) => Promise<{ ok: boolean; error?: string }>;
  onVerifyReport: (
    reportId: string,
    status: CommunityReport['verificationStatus'],
    officialAction?: 'verify_hazard' | 'close_road',
    reviewNotes?: string,
    expiresInHours?: number
  ) => Promise<{ ok: boolean; error?: string }>;
  onCreateAlert: (alert: {
    title: string;
    message: string;
    severity: AppNotification['severity'];
    relatedRoadId?: string;
  }) => Promise<{ ok: boolean; error?: string; alert?: ExpertAlert }>;
  onOpenChat: () => void;
  selectedRoad: RoadSegment | null;
  onSelectRoad: (road: RoadSegment) => void;
  onRefreshAuditLogs?: () => void;
  deviceOnline: boolean;
  backendAvailable: boolean | null;
  lastLiveDataUpdate: string | null;
  operationalDataState: 'LIVE' | 'CACHED' | 'UNAVAILABLE';
  rainfallDataState: 'LIVE' | 'CACHED' | 'UNAVAILABLE';
  onOpenOfflineGuide: () => void;
}

const ROAD_STATUS_BADGE: Record<RoadStatus, string> = {
  OPEN: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  REPORTED_WATERLOGGING: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  VERIFIED_HAZARD: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
  CLOSED: 'bg-red-500/20 text-red-300 border border-red-500/30',
  UNKNOWN: 'bg-slate-600/30 text-slate-300 border border-slate-600/40'
};

export const ExpertView: React.FC<ExpertViewProps> = ({
  user,
  token,
  onLogout,
  roads,
  nodes,
  shelters,
  hospitals,
  facilities,
  waterways,
  reports,
  notifications,
  expertAlerts,
  expertAlertsLoading,
  expertAlertsError,
  rainfallFeed,
  trafficFeedStatus,
  offlineStorageSummary,
  auditLogs,
  onUpdateRoadStatus,
  onVerifyReport,
  onCreateAlert,
  onOpenChat,
  selectedRoad,
  onSelectRoad,
  onRefreshAuditLogs,
  deviceOnline,
  backendAvailable,
  lastLiveDataUpdate,
  operationalDataState,
  rainfallDataState,
  onOpenOfflineGuide
}) => {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'map' | 'incidents' | 'alerts' | 'simulator' | 'analytics' | 'datasets' | 'audit'
  >('overview');
  const isBackendConnected = deviceOnline && backendAvailable === true;

  // Road Manager Controls
  const [roadSearch, setRoadSearch] = useState('');
  const [statusReason, setStatusReason] = useState('Field engineering inspection update');
  const [statusExpiryHrs, setStatusExpiryHrs] = useState<number>(6);
  const [controlFeedback, setControlFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Incident Review Controls
  const [reviewNotesMap, setReviewNotesMap] = useState<Record<string, string>>({});
  const [reviewingReportId, setReviewingReportId] = useState<string | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState<{
    reportId: string;
    type: 'ok' | 'err';
    msg: string;
  } | null>(null);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertSeverity, setAlertSeverity] = useState<AppNotification['severity']>('warning');
  const [alertRoadId, setAlertRoadId] = useState('');
  const [isCreatingAlert, setIsCreatingAlert] = useState(false);
  const [alertFeedback, setAlertFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Scenario Simulator State (Sandbox using actual calculateFloodRisk)
  const [simRainfallMm, setSimRainfallMm] = useState<number>(75);
  const [simBlockedRoads, setSimBlockedRoads] = useState<string[]>([]);
  const [simResults, setSimResults] = useState<{
    newlyCriticalRoads: { name: string; score: number }[];
    affectedShelters: number;
    avgRiskDelta: number;
  } | null>(null);

  const hasPermission = (permission: AuthorityPermission) =>
    user.authorityMembership?.permissions.includes(permission) || false;

  const handleApplyRoadStatus = async (roadId: string, nextStatus: RoadStatus, nextRisk?: number) => {
    setControlFeedback(null);
    if (!isBackendConnected) {
      setControlFeedback({ type: 'err', msg: 'Connect to the live backend before changing road status.' });
      return;
    }
    const trimmedReason = statusReason.trim();
    if (!trimmedReason) {
      setControlFeedback({ type: 'err', msg: 'Please enter an operational reason before changing road status.' });
      return;
    }
    const result = await onUpdateRoadStatus(
      roadId,
      nextStatus,
      trimmedReason,
      nextRisk,
      statusExpiryHrs > 0 ? statusExpiryHrs : undefined
    );
    if (result.ok) {
      setControlFeedback({ type: 'ok', msg: `Road ${roadId} updated to ${nextStatus}.` });
    } else {
      setControlFeedback({ type: 'err', msg: result.error || 'Failed to update road status.' });
    }
  };

  const handleReviewReport = async (
    reportId: string,
    status: CommunityReport['verificationStatus'],
    officialAction?: 'verify_hazard' | 'close_road',
    reviewNotes?: string,
    expiresInHours?: number
  ) => {
    setReviewFeedback(null);
    if (!isBackendConnected) {
      setReviewFeedback({ reportId, type: 'err', msg: 'Connect to the live backend before reviewing reports.' });
      return;
    }
    setReviewingReportId(reportId);
    try {
      const result = await onVerifyReport(reportId, status, officialAction, reviewNotes, expiresInHours);
      setReviewFeedback(result.ok
        ? { reportId, type: 'ok', msg: `Report status saved as ${status}.` }
        : { reportId, type: 'err', msg: result.error || 'Report review was not saved.' });
    } catch (error) {
      setReviewFeedback({
        reportId,
        type: 'err',
        msg: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setReviewingReportId(null);
    }
  };

  const handleCreateAlert = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAlertFeedback(null);
    if (!isBackendConnected) {
      setAlertFeedback({ type: 'err', msg: 'Connect to the live backend before creating an alert.' });
      return;
    }
    setIsCreatingAlert(true);
    try {
      const result = await onCreateAlert({
        title: alertTitle.trim(),
        message: alertMessage.trim(),
        severity: alertSeverity,
        ...(alertRoadId ? { relatedRoadId: alertRoadId } : {})
      });
      if (!result.ok || !result.alert) {
        setAlertFeedback({ type: 'err', msg: result.error || 'The alert was not saved.' });
        return;
      }
      setAlertTitle('');
      setAlertMessage('');
      setAlertRoadId('');
      setAlertFeedback({
        type: 'ok',
        msg: 'Alert created in the SanketSetu app. No external notification was sent.'
      });
      onRefreshAuditLogs?.();
    } catch (error) {
      setAlertFeedback({ type: 'err', msg: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsCreatingAlert(false);
    }
  };

  // Run Sandbox Scenario Simulation (non-mutating, uses authoritative calculateFloodRisk)
  const handleRunScenario = () => {
    const criticalList: { name: string; score: number }[] = [];
    let deltaSum = 0;

    for (const r of roads) {
      const isSimBlocked = simBlockedRoads.includes(r.id);
      const simEval = calculateFloodRisk({
        rainfallMm: simRainfallMm,
        durationHrs: 24,
        rainfallTimestamp: new Date().toISOString(),
        elevationM: r.baseElevationM,
        slopePct: r.slopePct,
        drainageCondition: r.drainageCondition,
        hasHistoricalFlood: r.hasHistoricalFlood,
        communityRiskScore: isSimBlocked ? 95 : 40
      });
      const simScore = isSimBlocked ? 100 : (simEval.riskScore ?? 50);
      const baseScore = r.riskScore ?? 50;
      deltaSum += simScore - baseScore;
      if (simScore >= 75) {
        criticalList.push({ name: r.name, score: simScore });
      }
    }

    setSimResults({
      newlyCriticalRoads: criticalList.sort((a, b) => b.score - a.score).slice(0, 12),
      affectedShelters: shelters.filter(s => criticalList.length > 5 && s.currentOccupancy < s.capacity).length,
      avgRiskDelta: roads.length > 0 ? Math.round(deltaSum / roads.length) : 0
    });
  };

  const activeReportsCount = reports.filter(r => r.verificationStatus !== 'Resolved' && r.verificationStatus !== 'Rejected').length;
  const closedRoadsCount = roads.filter(r => r.status === 'CLOSED').length;
  const hazardRoadsCount = roads.filter(r => r.status === 'VERIFIED_HAZARD').length;
  const totalShelterCapacity = shelters.reduce((sum, s) => sum + s.capacity, 0);

  const availableStations = (rainfallFeed?.observations || []).filter(o => o.isAvailable && o.observedPast24hMm !== null);
  const peakStation = availableStations.reduce<typeof availableStations[0] | null>(
    (best, cur) => (!best || (cur.observedPast24hMm || 0) > (best.observedPast24hMm || 0) ? cur : best),
    null
  );

  const reportCountLabel = operationalDataState === 'UNAVAILABLE' ? 'Unknown' : String(activeReportsCount);
  const filteredRoads = roads.filter(
    r =>
      r.name.toLowerCase().includes(roadSearch.toLowerCase()) ||
      r.id.toLowerCase().includes(roadSearch.toLowerCase()) ||
      r.status.toLowerCase().includes(roadSearch.toLowerCase())
  );

  const highestRiskRoads = [...roads]
    .filter(r => r.riskScore !== null)
    .sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))
    .slice(0, 5);
  const offlineRoadRecord = offlineStorageSummary?.datasets.find(dataset => dataset.id === 'roads');
  const offlineRainfallRecord = offlineStorageSummary?.datasets.find(dataset => dataset.id === 'rainfall');
  const availableRainfall = Boolean(rainfallFeed?.observations.some(observation => observation.isAvailable));
  const dataIsOffline = !deviceOnline || backendAvailable === false;
  const transparencyRainfallState = dataIsOffline
    ? availableRainfall ? 'CACHED' : offlineRainfallRecord ? 'CACHED' : 'UNAVAILABLE'
    : rainfallDataState;
  const transparencyTrafficState = dataIsOffline
    ? trafficFeedStatus?.lastSuccessfulUpdate ? 'CACHED' : 'UNAVAILABLE'
    : trafficFeedStatus?.isLiveActive ? 'LIVE' : 'UNAVAILABLE';
  const historicalSources = Array.from(new Set(INITIAL_HISTORICAL_FLOODS.map(record => record.source))).join(', ');
  const formatTransparencyTimestamp = (value: string | null | undefined) => {
    if (!value) return 'Unknown';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
  };
  const dataStateClass = (state: string) => {
    if (state === 'LIVE') return 'bg-emerald-950 text-emerald-300 border-emerald-800';
    if (state === 'CACHED') return 'bg-blue-950 text-blue-300 border-blue-800';
    if (state === 'HISTORICAL') return 'bg-slate-800 text-slate-300 border-slate-700';
    return 'bg-amber-950 text-amber-300 border-amber-800';
  };
  const transparencyRows = [
    {
      name: 'Rainfall estimates',
      source: rainfallFeed?.observations.find(observation => observation.source)?.source || 'Open-Meteo Forecast API',
      updatedLabel: 'Last source update',
      updated: formatTransparencyTimestamp(
        rainfallFeed?.lastSuccessfulUpdate || offlineRainfallRecord?.sourceUpdatedAt
      ),
      freshness: transparencyRainfallState === 'LIVE'
        ? 'Recently received from the source.'
        : transparencyRainfallState === 'CACHED'
          ? 'Previously downloaded information.'
          : 'Data source could not be reached.',
      reliability: availableRainfall ? 'Model estimate; not gauge-verified.' : 'Not verified',
      state: transparencyRainfallState
    },
    {
      name: 'Road network',
      source: 'OpenStreetMap ODbL-derived bundled road snapshot',
      updatedLabel: 'Last received or saved',
      updated: formatTransparencyTimestamp(
        dataIsOffline ? offlineRoadRecord?.savedAt : lastLiveDataUpdate || offlineRoadRecord?.savedAt
      ),
      freshness: 'Local snapshot; source update time is unknown.',
      reliability: 'Not verified',
      state: roads.length > 0 ? 'CACHED' : 'UNAVAILABLE'
    },
    {
      name: 'Traffic information',
      source: trafficFeedStatus?.provider || 'TomTom Traffic Flow API / Estimated Baseline',
      updatedLabel: 'Last successful update',
      updated: formatTransparencyTimestamp(trafficFeedStatus?.lastSuccessfulUpdate),
      freshness: transparencyTrafficState === 'LIVE'
        ? 'Recently received from the source.'
        : transparencyTrafficState === 'CACHED'
          ? 'Previously received information; may be stale.'
          : 'Live traffic data is unavailable; route speed estimates may be used.',
      reliability: 'No aggregate confidence score available.',
      state: transparencyTrafficState
    },
    {
      name: 'Historical flood records',
      source: historicalSources || 'Unknown',
      updatedLabel: 'Dataset update',
      updated: 'Unknown',
      freshness: 'Past records, not current conditions.',
      reliability: 'Not verified',
      state: 'HISTORICAL'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans min-w-0">
      {/* Expert Command Header */}
      <header className="sticky top-0 z-40 bg-slate-900 border-b border-indigo-900/60 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between min-h-16 py-2 gap-3">
            <div className="flex items-center space-x-2.5 cursor-pointer shrink-0" onClick={() => setActiveTab('overview')}>
              <div className="p-2 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl shadow-lg flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="font-extrabold text-base sm:text-lg text-white tracking-tight whitespace-nowrap">
                    SanketSetu Command
                  </span>
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-mono font-bold shrink-0">
                    EXPERT
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 hidden sm:block truncate max-w-[220px]">
                  {user.authorityMembership?.authorityName || user.organisation || 'Authority membership'}
                </p>
              </div>
            </div>

            {/* Expert Top Navigation */}
            <nav className="hidden xl:flex xl:order-last xl:basis-full items-center justify-between space-x-1" aria-label="Expert Navigation">
              <button onClick={() => setActiveTab('overview')} className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1 ${activeTab === 'overview' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}>
                <Activity className="w-3.5 h-3.5" />
                <span>Overview</span>
              </button>

              <button onClick={() => setActiveTab('map')} className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1 ${activeTab === 'map' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}>
                <Layers className="w-3.5 h-3.5" />
                <span>GIS Map</span>
              </button>

              <button onClick={() => setActiveTab('incidents')} className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1 ${activeTab === 'incidents' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}>
                <AlertOctagon className="w-3.5 h-3.5" />
                <span>Incidents ({reportCountLabel})</span>
              </button>

              <button onClick={() => setActiveTab('alerts')} className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1 ${activeTab === 'alerts' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}>
                <Megaphone className="w-3.5 h-3.5" />
                <span>Alerts ({expertAlerts.length})</span>
              </button>

              <button onClick={() => setActiveTab('simulator')} className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1 ${activeTab === 'simulator' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}>
                <CloudRain className="w-3.5 h-3.5" />
                <span>Simulator</span>
              </button>

              <button onClick={() => setActiveTab('analytics')} className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1 ${activeTab === 'analytics' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}>
                <BarChart2 className="w-3.5 h-3.5" />
                <span>Analytics</span>
              </button>

              <button onClick={() => setActiveTab('datasets')} className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1 ${activeTab === 'datasets' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}>
                <FileText className="w-3.5 h-3.5" />
                <span>Datasets</span>
              </button>

              {hasPermission('AUDIT_VIEW') && (
                <button onClick={() => setActiveTab('audit')} className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1 ${activeTab === 'audit' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}>
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Audit</span>
                </button>
              )}

            </nav>

            {/* Right User Bar */}
            <div className="flex w-full sm:w-auto items-center justify-end space-x-2 shrink-0">
              <button
                type="button"
                onClick={onOpenChat}
                aria-label="Open Expert AI Assistant"
                title="Open the backend-grounded Expert AI Assistant"
                className="min-h-10 rounded-lg border border-indigo-700 bg-indigo-950/60 p-2 text-indigo-200 hover:bg-indigo-900/70 flex items-center gap-1.5 text-xs"
              >
                <MessageSquare className="h-4 w-4" />
                <span className="hidden sm:inline">AI Assistant</span>
              </button>
              <button
                type="button"
                onClick={onOpenOfflineGuide}
                aria-label="Open connectivity and offline data details"
                title={!deviceOnline ? 'Device is offline' : backendAvailable === false ? 'Backend unavailable' : 'Connectivity details'}
                className={`min-h-10 rounded-lg border p-2 ${
                  !deviceOnline || backendAvailable === false
                    ? 'border-red-500/40 bg-red-500/10 text-red-300'
                    : backendAvailable === true
                    ? 'border-slate-700 bg-slate-800 text-emerald-300'
                    : 'border-slate-700 bg-slate-800 text-blue-300'
                }`}
              >
                {!deviceOnline || backendAvailable === false
                  ? <WifiOff className="h-4 w-4" />
                  : <Wifi className="h-4 w-4" />}
              </button>
              <div className="text-right hidden md:block">
                <span className="text-xs font-bold text-white block whitespace-nowrap">{user.fullName}</span>
                <span className="text-[10px] text-indigo-300 font-mono whitespace-nowrap">EXPERT Clearance</span>
              </div>

              <button
                onClick={onLogout}
                title="Log out of Expert Command"
                className="p-2 bg-slate-800 hover:bg-red-950/70 text-slate-300 hover:text-red-400 rounded-xl border border-slate-700 transition-colors flex items-center space-x-1 text-xs shrink-0"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>

          {/* Mobile Navigation bar */}
          <div className="flex xl:hidden min-w-0 w-full max-w-full overflow-x-auto py-2 space-x-1 border-t border-slate-800 text-xs">
            <button onClick={() => setActiveTab('overview')} className={`px-2.5 py-1 rounded ${activeTab === 'overview' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}>Overview</button>
            <button onClick={() => setActiveTab('map')} className={`px-2.5 py-1 rounded ${activeTab === 'map' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}>GIS Map</button>
            <button onClick={() => setActiveTab('incidents')} className={`px-2.5 py-1 rounded ${activeTab === 'incidents' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}>Incidents</button>
            <button onClick={() => setActiveTab('alerts')} className={`px-2.5 py-1 rounded ${activeTab === 'alerts' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}>Alerts ({expertAlerts.length})</button>
            <button onClick={() => setActiveTab('simulator')} className={`px-2.5 py-1 rounded ${activeTab === 'simulator' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}>Simulator</button>
            <button onClick={() => setActiveTab('analytics')} className={`px-2.5 py-1 rounded ${activeTab === 'analytics' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}>Analytics</button>
            <button onClick={() => setActiveTab('datasets')} className={`px-2.5 py-1 rounded ${activeTab === 'datasets' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}>Datasets</button>
            {hasPermission('AUDIT_VIEW') && <button onClick={() => setActiveTab('audit')} className={`px-2.5 py-1 rounded ${activeTab === 'audit' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}>Audit</button>}
          </div>
        </div>
      </header>

      {/* Main Expert Body */}
      <main className="flex-1 max-w-7xl w-full min-w-0 mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {(!deviceOnline || backendAvailable === false) && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-950/50 px-4 py-3 text-xs text-amber-100" role="status">
            {deviceOnline
              ? 'SanketSetu backend is unavailable. Expert actions cannot be persisted until connectivity is restored.'
              : 'Device network is offline. Displayed operational data may be stale; expert changes will not be sent.'}
            <button type="button" onClick={onOpenOfflineGuide} className="ml-3 min-h-9 rounded-lg border border-amber-300/40 px-3 py-1.5 font-semibold text-white">
              Offline details
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-2 text-xs">
          <span className="text-slate-300">
            Operational API data: <strong className={
              operationalDataState === 'LIVE' ? 'text-emerald-300' :
              operationalDataState === 'CACHED' ? 'text-amber-300' : 'text-slate-400'
            }>{operationalDataState}</strong>
          </span>
          <span className="text-slate-400">
            Last backend refresh: {lastLiveDataUpdate ? new Date(lastLiveDataUpdate).toLocaleString() : 'Unknown'}
          </span>
        </div>
        {/* VIEW 1: OPERATIONS OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="min-w-0 space-y-6">
            {/* Top Operational Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div
                onClick={() => setActiveTab('incidents')}
                className="bg-slate-900 border border-slate-800 hover:border-amber-500/60 p-4 rounded-2xl shadow-xl cursor-pointer transition-all"
              >
                <span className="text-xs text-slate-400 font-semibold block">Active Citizen Incidents</span>
                <div className="text-2xl font-black text-amber-400 mt-1 flex items-center justify-between">
                  <span>{operationalDataState === 'UNAVAILABLE' ? 'Unavailable' : activeReportsCount}</span>
                  <Activity className="w-5 h-5 text-amber-400 opacity-60" />
                </div>
                <span className="text-[11px] text-slate-500">
                  {operationalDataState === 'UNAVAILABLE'
                    ? 'Report feed unavailable'
                    : `${reports.filter(r => r.verificationStatus === 'Verified').length} Expert Verified`}
                </span>
              </div>

              <div
                onClick={() => setActiveTab('map')}
                className="bg-slate-900 border border-slate-800 hover:border-red-500/60 p-4 rounded-2xl shadow-xl cursor-pointer transition-all"
              >
                <span className="text-xs text-slate-400 font-semibold block">Closed / Verified Hazards</span>
                <div className="text-2xl font-black text-red-400 mt-1 flex items-center justify-between">
                  <span>{operationalDataState === 'UNAVAILABLE' ? 'Unavailable' : `${closedRoadsCount} / ${hazardRoadsCount}`}</span>
                  <AlertOctagon className="w-5 h-5 text-red-400 opacity-60" />
                </div>
                <span className="text-[11px] text-slate-500">
                  {operationalDataState === 'UNAVAILABLE' ? 'Road status unavailable' : `${closedRoadsCount} excluded from routing`}
                </span>
              </div>

              <div
                onClick={() => setActiveTab('analytics')}
                className="bg-slate-900 border border-slate-800 hover:border-cyan-500/60 p-4 rounded-2xl shadow-xl cursor-pointer transition-all"
              >
                <span className="text-xs text-slate-400 font-semibold block">Current Shelter Occupancy</span>
                <div className="text-2xl font-black text-cyan-400 mt-1 flex items-center justify-between">
                  <span>Unavailable</span>
                  <Users className="w-5 h-5 text-cyan-400 opacity-60" />
                </div>
                <span className="text-[11px] text-slate-500">No live occupancy feed is configured</span>
              </div>

              <div
                onClick={() => setActiveTab('datasets')}
                className="bg-slate-900 border border-slate-800 hover:border-blue-500/60 p-4 rounded-2xl shadow-xl cursor-pointer transition-all"
              >
                <span className="text-xs text-slate-400 font-semibold block">24h Rainfall Estimate Peak</span>
                <div className="text-2xl font-black text-blue-400 mt-1 flex items-center justify-between">
                  <span>{peakStation?.observedPast24hMm !== null && peakStation?.observedPast24hMm !== undefined ? `${peakStation.observedPast24hMm.toFixed(1)} mm` : 'N/A'}</span>
                  <CloudRain className="w-5 h-5 text-blue-400 opacity-60" />
                </div>
                <span className="text-[11px] text-slate-500 truncate block">
                  {peakStation ? `${peakStation.stationName} (Open-Meteo model estimate · ${rainfallDataState})` : 'Weather feed unavailable'}
                </span>
              </div>
            </div>

            {user.role === 'EXPERT' && user.accountStatus === 'ACTIVE' && (
              <section
                aria-labelledby="expert-data-transparency-heading"
                className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5 shadow-lg space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-cyan-400" />
                    <h3 id="expert-data-transparency-heading" className="text-sm font-bold text-white">
                      Data Transparency
                    </h3>
                  </div>
                  <p className="text-[11px] text-slate-300" role="status">
                    {!deviceOnline
                      ? 'Device offline; showing available saved data.'
                      : backendAvailable === false
                        ? 'SankatSetu backend unavailable; live updates cannot be confirmed.'
                        : backendAvailable === true
                          ? 'SankatSetu backend connected.'
                          : 'Checking data connection...'}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  {transparencyRows.map(row => (
                    <div key={row.name} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <strong className="text-xs text-white">{row.name}</strong>
                        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold ${dataStateClass(row.state)}`}>
                          {row.state}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-300">{row.source}</p>
                      <p className="text-[10px] text-slate-400">
                        {row.updatedLabel}: {row.updated}
                      </p>
                      <p className="text-[10px] text-slate-400">{row.freshness}</p>
                      <p className="text-[10px] text-slate-400">Reliability: {row.reliability}</p>
                    </div>
                  ))}
                </div>

                <p className="text-[10px] text-slate-400">
                  LIVE: recently received from the source. CACHED: previously downloaded. HISTORICAL: past records, not current conditions. UNAVAILABLE: source could not be reached. A risk estimate does not guarantee a route is safe.
                </p>
              </section>
            )}

            {/* GIS Overview + Authoritative Road Status Controls */}
            <div className="grid min-w-0 grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="min-w-0 lg:col-span-7 h-[580px] rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
                <MapView
                  roads={roads}
                  nodes={nodes}
                  shelters={shelters}
                  hospitals={hospitals}
                  emergencyFacilities={facilities}
                  waterways={waterways}
                  reports={reports}
                  selectedRoadId={selectedRoad?.id}
                  onSelectRoad={onSelectRoad}
                />
              </div>

              {/* Road Status Manager */}
              <div className="min-w-0 lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Authoritative Road Controls</h3>
                  <span className="text-[10px] text-slate-400 font-mono">{roads.length} Corridors</span>
                </div>

                {/* Operational Reason & Expiry Controls */}
                <div className="space-y-2 bg-slate-800/50 p-2.5 rounded-xl border border-slate-700/80 text-xs">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                      Mandatory Audit Reason
                    </label>
                    <input
                      type="text"
                      value={statusReason}
                      onChange={(e) => setStatusReason(e.target.value)}
                      disabled={!hasPermission('ROAD_STATUS_UPDATE')}
                      placeholder="E.g., Waterlogging cleared or bridge barricaded"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-1.5 flex-1">
                      <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <input
                        type="text"
                        value={roadSearch}
                        onChange={(e) => setRoadSearch(e.target.value)}
                        placeholder="Filter road name / ID..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                      />
                    </div>
                    <select
                      value={statusExpiryHrs}
                      onChange={(e) => setStatusExpiryHrs(Number(e.target.value))}
                      disabled={!hasPermission('ROAD_STATUS_UPDATE')}
                      aria-label="Advisory expiry hours"
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-200"
                    >
                      <option value={0}>No expiry</option>
                      <option value={2}>Expires 2h</option>
                      <option value={6}>Expires 6h</option>
                      <option value={12}>Expires 12h</option>
                      <option value={24}>Expires 24h</option>
                    </select>
                  </div>
                </div>

                {controlFeedback && (
                  <div className={`p-2 rounded-lg text-[11px] border ${
                    controlFeedback.type === 'ok'
                      ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300'
                      : 'bg-red-950/60 border-red-700 text-red-300'
                  }`}>
                    {controlFeedback.msg}
                  </div>
                )}

                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {!filteredRoads.length && <p className="py-6 text-center text-xs text-slate-400">No roads match this filter.</p>}
                  {filteredRoads.map(road => {
                    const isClosed = road.status === 'CLOSED';
                    return (
                      <div key={road.id} className="p-3 bg-slate-800/60 border border-slate-700/80 rounded-xl text-xs space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-white truncate">{road.id} • {road.name}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${ROAD_STATUS_BADGE[road.status]}`}>
                            {road.status}
                          </span>
                        </div>

                        <div className="flex justify-between text-[11px] text-slate-400">
                          <span>Risk: <strong className="text-cyan-300">{road.riskScore ?? 'Unknown'}</strong></span>
                          <span>Elev: {road.baseElevationM !== null ? `${road.baseElevationM}m` : 'N/A'}</span>
                        </div>

                        {hasPermission('ROAD_STATUS_UPDATE') ? <div className="pt-1 flex gap-1.5">
                          {!isClosed && (
                            <button
                              onClick={() => handleApplyRoadStatus(road.id, 'CLOSED', 100)}
                              disabled={!isBackendConnected}
                              className="flex-1 bg-red-600 hover:bg-red-500 text-white py-1 rounded-lg text-[11px] font-semibold flex items-center justify-center space-x-1"
                            >
                              <Lock className="w-3 h-3" />
                              <span>Close Road</span>
                            </button>
                          )}
                          {road.status !== 'VERIFIED_HAZARD' && (
                            <button
                              onClick={() => handleApplyRoadStatus(road.id, 'VERIFIED_HAZARD', 82)}
                              disabled={!isBackendConnected}
                              className="flex-1 bg-orange-600 hover:bg-orange-500 text-white py-1 rounded-lg text-[11px] font-semibold"
                            >
                              Verify Hazard
                            </button>
                          )}
                          {road.status !== 'OPEN' && (
                            <button
                              onClick={() => handleApplyRoadStatus(road.id, 'OPEN', 20)}
                              disabled={!isBackendConnected}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-1 rounded-lg text-[11px] font-semibold flex items-center justify-center space-x-1"
                            >
                              <Unlock className="w-3 h-3" />
                              <span>Set Open</span>
                            </button>
                          )}
                        </div> : <p className="pt-1 text-[10px] text-slate-500">Road updates are not assigned to this membership.</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: GIS RISK MAP FULLSCREEN */}
        {activeTab === 'map' && (
          <div className="min-w-0 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">GIS Hydrological & Road Closure Map</h3>
                <p className="text-xs text-slate-400">Multi-layer geographic inspection for Pune & Pimpri-Chinchwad corridors</p>
              </div>
              <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1.5 rounded-xl border border-slate-700">
                {Object.keys(nodes).length} Junctions • {roads.length} Directed Corridors
              </span>
            </div>

            <div className="min-w-0 h-[650px] rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
              <MapView
                roads={roads}
                nodes={nodes}
                shelters={shelters}
                hospitals={hospitals}
                emergencyFacilities={facilities}
                waterways={waterways}
                reports={reports}
                selectedRoadId={selectedRoad?.id}
                onSelectRoad={onSelectRoad}
              />
            </div>
          </div>
        )}

        {/* VIEW 3: INCIDENT MANAGEMENT */}
        {activeTab === 'incidents' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white">Emergency Incident Verification Centre</h3>
                <p className="text-xs text-slate-400">Verify citizen waterlogging reports to escalate to VERIFIED_HAZARD or official road CLOSURE</p>
              </div>
              <span className="text-xs font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-800 px-3 py-1.5 rounded-xl">
                {reports.filter(r => r.verificationStatus === 'Reported').length} Pending Audits
              </span>
            </div>

            <div className="space-y-3">
              {!reports.length && (
                <p className="py-8 text-center text-xs text-slate-400">
                  {operationalDataState === 'UNAVAILABLE'
                    ? 'Current report data is unavailable. Historical flood records are shown separately and are not current reports.'
                    : 'No persisted citizen reports are available. Historical flood records are shown separately and are not current reports.'}
                </p>
              )}
              {reports.map(rep => {
                const noteVal = reviewNotesMap[rep.id] ?? rep.reviewNotes ?? '';
                const isReviewing = reviewingReportId === rep.id;
                const reviewDisabled = !isBackendConnected || reviewingReportId !== null;
                return (
                  <div key={rep.id} className="bg-slate-800/70 border border-slate-700 rounded-xl p-4 text-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                    <div className="space-y-1.5 max-w-xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-white text-sm">{rep.locationName}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          rep.severity === 'Critical' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {rep.severity}
                        </span>
                        <span className="text-slate-400">({rep.reportType})</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-cyan-300 border border-slate-700">
                          {rep.verificationStatus}
                        </span>
                      </div>

                      <p className="text-slate-300">{rep.description}</p>
                      {rep.imageUrl && (
                        <img
                          src={rep.imageUrl}
                          alt={`Report ${rep.id}`}
                          className="w-48 max-h-28 object-cover rounded-lg border border-slate-700"
                        />
                      )}

                      <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-2">
                        <span>Submitted: {new Date(rep.timestamp).toLocaleString()}</span>
                        <span>•</span>
                        <span>By: <strong className="text-slate-300">{rep.userName || rep.userId}</strong></span>
                        <span>•</span>
                        <span>Confidence: <strong className="text-cyan-300">
                          {typeof rep.confidenceScore === 'number' && Number.isFinite(rep.confidenceScore)
                            ? `${Math.round(rep.confidenceScore * 100)}%`
                            : 'Unverified'}
                        </strong></span>
                        {rep.roadId && (
                          <>
                            <span>•</span>
                            <span>Road: <strong className="text-white">{rep.roadId}</strong></span>
                          </>
                        )}
                      </div>

                      <input
                        type="text"
                        value={noteVal}
                        onChange={(e) => setReviewNotesMap(prev => ({ ...prev, [rep.id]: e.target.value }))}
                        disabled={!hasPermission('REPORTS_VERIFY')}
                        placeholder="Optional review note recorded in audit trail..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 mt-1"
                      />
                      {reviewFeedback?.reportId === rep.id && (
                        <p
                          role={reviewFeedback.type === 'err' ? 'alert' : 'status'}
                          className={`text-[11px] ${reviewFeedback.type === 'err' ? 'text-rose-300' : 'text-emerald-300'}`}
                        >
                          {reviewFeedback.msg}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    {hasPermission('REPORTS_VERIFY') ? <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {hasPermission('HAZARD_VERIFY') && rep.verificationStatus !== 'Verified' && (
                        <>
                          <button
                            onClick={() => handleReviewReport(rep.id, 'Verified', 'verify_hazard', noteVal || undefined, 6)}
                            disabled={reviewDisabled}
                            className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs px-3 py-2 rounded-xl flex items-center space-x-1"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>{isReviewing ? 'Saving...' : 'Verify Hazard'}</span>
                          </button>
                          <button
                            onClick={() => handleReviewReport(rep.id, 'Verified', 'close_road', noteVal || undefined, 6)}
                            disabled={reviewDisabled}
                            className="bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs px-3 py-2 rounded-xl flex items-center space-x-1"
                          >
                            <Lock className="w-3.5 h-3.5" />
                            <span>Verify & Close Road</span>
                          </button>
                        </>
                      )}

                      {rep.verificationStatus !== 'Rejected' && (
                        <button
                          onClick={() => handleReviewReport(rep.id, 'Rejected', undefined, noteVal || undefined)}
                          disabled={reviewDisabled}
                          className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300 text-xs px-3 py-2 rounded-xl flex items-center space-x-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      )}

                      {rep.verificationStatus !== 'Resolved' && (
                        <button
                          onClick={() => handleReviewReport(rep.id, 'Resolved', undefined, noteVal || undefined)}
                          disabled={reviewDisabled}
                          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs px-3 py-2 rounded-xl"
                        >
                          Mark Resolved
                        </button>
                      )}
                    </div> : <p className="text-xs text-slate-500">Report review permission is not assigned.</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <section className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Megaphone className="w-5 h-5 text-amber-400" />
                  Create In-App Emergency Alert
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  Publishes to SanketSetu&apos;s citizen notification feed only. No external notification provider is configured.
                </p>
              </div>
              <form onSubmit={handleCreateAlert} className="space-y-3">
                <div>
                  <label htmlFor="expert-alert-title" className="block text-xs text-slate-300 mb-1">Title</label>
                  <input
                    id="expert-alert-title"
                    value={alertTitle}
                    onChange={event => setAlertTitle(event.target.value)}
                    maxLength={120}
                    required
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label htmlFor="expert-alert-message" className="block text-xs text-slate-300 mb-1">Message</label>
                  <textarea
                    id="expert-alert-message"
                    value={alertMessage}
                    onChange={event => setAlertMessage(event.target.value)}
                    maxLength={2000}
                    rows={4}
                    required
                    className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="expert-alert-severity" className="block text-xs text-slate-300 mb-1">Severity</label>
                    <select
                      id="expert-alert-severity"
                      value={alertSeverity}
                      onChange={event => setAlertSeverity(event.target.value as AppNotification['severity'])}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    >
                      <option value="info">Information</option>
                      <option value="warning">Warning</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="expert-alert-area" className="block text-xs text-slate-300 mb-1">Affected area</label>
                    <select
                      id="expert-alert-area"
                      value={alertRoadId}
                      onChange={event => setAlertRoadId(event.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    >
                      <option value="">All Pune & PCMC</option>
                      {roads.map(road => <option key={road.id} value={road.id}>{road.id} · {road.name}</option>)}
                    </select>
                  </div>
                </div>
                {alertFeedback && (
                  <p
                    role={alertFeedback.type === 'err' ? 'alert' : 'status'}
                    className={`text-xs ${alertFeedback.type === 'err' ? 'text-rose-300' : 'text-emerald-300'}`}
                  >
                    {alertFeedback.msg}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={isCreatingAlert || !isBackendConnected || !hasPermission('ALERT_CREATE')}
                  className="w-full min-h-11 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {isCreatingAlert ? 'Saving alert...' : 'Create in-app alert'}
                </button>
              </form>
              <p className="text-[11px] text-slate-400 border-t border-slate-800 pt-3">
                External delivery is not configured. This action does not dispatch emergency services. The alert creation and author are recorded in the audit trail; editing and deactivation are not supported by the current notification storage.
              </p>
            </section>

            <section className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-bold text-white">Expert Alert History</h3>
                  <p className="text-xs text-slate-400">Created alerts are stored in the application feed; external delivery status is not configured.</p>
                </div>
                <span className="text-xs text-slate-300">{expertAlerts.length} recorded</span>
              </div>
              {expertAlertsError ? (
                <p role="alert" className="py-8 text-center text-xs text-rose-300">
                  Alert history could not be loaded: {expertAlertsError}
                </p>
              ) : expertAlertsLoading && expertAlerts.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-400">Loading alert history...</p>
              ) : expertAlerts.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-400">No Expert-created alerts are recorded.</p>
              ) : (
                <div className="space-y-3 max-h-[560px] overflow-y-auto">
                  {expertAlerts.map(alert => (
                    <article key={alert.id} className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="font-bold text-white">{alert.title}</h4>
                        <span className="rounded border border-slate-600 px-2 py-0.5 text-[10px] uppercase text-amber-200">
                          {alert.severity} · in-app
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-slate-300">{alert.message}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                        <span>Affected area: {alert.relatedRoadId || 'All Pune & PCMC'}</span>
                        <span>Created by: {alert.createdBy}</span>
                        <span>{new Date(alert.createdAt).toLocaleString()}</span>
                        <span>Citizen feed: {notifications.some(item => item.id === alert.id) ? 'Available' : 'Not currently loaded'}</span>
                        <span>External delivery: Not configured</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* VIEW 4: SCENARIO SIMULATOR */}
        {activeTab === 'simulator' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
            <div className="border-b border-slate-800 pb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <CloudRain className="w-5 h-5 text-indigo-400" />
                  <span>Pre-Flood What-If Scenario Simulator</span>
                </h3>
                <p className="text-xs text-slate-400">Runs SanketSetu&apos;s 5-factor rule engine in an isolated sandbox without overwriting live operational data</p>
              </div>
              <span className="text-xs bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-full font-mono font-bold">
                Sandbox Only
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4 bg-slate-800/60 p-4 rounded-xl border border-slate-700 text-xs">
                <div>
                  <div className="flex justify-between mb-1.5">
                    <span className="font-semibold text-slate-300">Simulated 24h Rainfall:</span>
                    <strong className="text-cyan-300 text-sm">{simRainfallMm} mm</strong>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="150"
                    step="5"
                    value={simRainfallMm}
                    onChange={(e) => setSimRainfallMm(Number(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer h-2 bg-slate-700 rounded"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                    <span>10mm (Light)</span>
                    <span>75mm (Heavy IMD)</span>
                    <span>150mm (Cloudburst)</span>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-2">Simulate Road Closures:</label>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {roads.map(r => (
                      <label key={r.id} className="flex items-center space-x-2 text-slate-300 hover:text-white cursor-pointer">
                        <input
                          type="checkbox"
                          checked={simBlockedRoads.includes(r.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSimBlockedRoads(prev => [...prev, r.id]);
                            else setSimBlockedRoads(prev => prev.filter(id => id !== r.id));
                          }}
                          className="rounded border-slate-600 text-indigo-600"
                        />
                        <span>{r.id} • {r.name} ({r.baseElevationM ?? '?'}m)</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleRunScenario}
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg"
                >
                  Run What-If Impact Simulation
                </button>
              </div>

              <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700 text-xs space-y-3">
                <h4 className="font-bold text-white text-xs uppercase tracking-wider">Simulated Corridor Impact</h4>

                {simResults ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-3 bg-slate-900 rounded-xl border border-slate-700">
                        <span className="text-slate-400 text-[10px] block">Avg Network Risk Delta</span>
                        <span className="text-lg font-bold text-amber-400">
                          {simResults.avgRiskDelta >= 0 ? `+${simResults.avgRiskDelta}` : simResults.avgRiskDelta} pts
                        </span>
                      </div>
                      <div className="p-3 bg-slate-900 rounded-xl border border-slate-700">
                        <span className="text-slate-400 text-[10px] block">Severe Corridors (&ge;75)</span>
                        <span className="text-lg font-bold text-red-400">{simResults.newlyCriticalRoads.length} Roads</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-slate-400 text-[11px] block font-semibold">Top Threatened Corridors:</span>
                      <div className="space-y-1 max-h-44 overflow-y-auto">
                        {simResults.newlyCriticalRoads.map((item, i) => (
                          <div key={i} className="p-2 bg-red-950/40 border border-red-900/60 rounded text-red-300 text-[11px] flex justify-between">
                            <span>{item.name}</span>
                            <strong>{item.score}/100</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-400 text-xs py-8 text-center">
                    Adjust rainfall and simulated closures, then click &ldquo;Run What-If Impact Simulation&rdquo;.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 5: ANALYTICS */}
        {activeTab === 'analytics' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
            <h3 className="text-base font-bold text-white">Current Basin & Corridor Risk Analytics</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700 space-y-2">
                <span className="text-slate-400 font-semibold block">Top Risk Corridors (Current Score)</span>
                <div className="space-y-1.5 text-[11px]">
                  {highestRiskRoads.map(r => (
                    <div key={r.id} className="flex justify-between gap-2">
                      <span className="truncate">{r.name}:</span>
                      <strong className={
                        (r.riskScore || 0) >= 75 ? 'text-red-400' :
                        (r.riskScore || 0) >= 50 ? 'text-orange-400' : 'text-amber-400'
                      }>
                        {r.riskCategory} ({r.riskScore})
                      </strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-semibold block">Open-Meteo Gridded Estimates</span>
                  <span className={`text-[10px] font-bold ${rainfallFeed?.openMeteoStatus === 'OK' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {rainfallFeed?.openMeteoStatus === 'OK' ? 'API responded (model data)' : 'Unavailable'}
                  </span>
                </div>
                <div className="space-y-1.5 text-[11px] max-h-48 overflow-y-auto pr-1">
                  {(rainfallFeed?.observations || []).map(obs => (
                    <div key={obs.stationId} className="flex justify-between items-center gap-2 border-b border-slate-800/50 pb-1">
                      <span className="truncate text-slate-300" title={obs.stationName}>{obs.stationName}:</span>
                      <strong className="text-cyan-300 shrink-0">
                        {obs.isAvailable && obs.observedPast24hMm !== null ? `${obs.observedPast24hMm.toFixed(1)} mm` : 'Unavailable'}
                      </strong>
                    </div>
                  ))}
                  <div className="pt-1 text-[10px] text-slate-400 flex justify-between">
                    <span>IMD Status: <strong className="text-slate-300">{rainfallFeed?.imdApiStatus === 'CONFIGURED' ? 'Configured (not queried)' : rainfallFeed?.imdApiStatus || 'KEY_MISSING'}</strong></span>
                    <span>{rainfallFeed?.lastSuccessfulUpdate ? new Date(rainfallFeed.lastSuccessfulUpdate).toLocaleTimeString() : ''}</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700 space-y-2">
                <span className="text-slate-400 font-semibold block">Evacuation Preparedness</span>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between"><span>Listed Shelter Capacity:</span> <strong className="text-white">{totalShelterCapacity} persons</strong></div>
                  <div className="flex justify-between"><span>Current Occupancy:</span> <strong className="text-cyan-300">Unavailable · no live feed</strong></div>
                  <div className="flex justify-between"><span>Listed Pet-Friendly Shelters:</span> <strong className="text-emerald-400">{shelters.filter(s => s.petFriendly).length} facilities</strong></div>
                  <div className="flex justify-between"><span>Trauma Hospitals Listed:</span> <strong className="text-white">{hospitals.length} centers</strong></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 6: DATASETS */}
        {activeTab === 'datasets' && (
          <DatasetExplorer
            rainfallFeed={rainfallFeed}
            user={user}
            token={token ?? undefined}
            deviceOnline={deviceOnline}
            backendAvailable={backendAvailable}
            lastLiveDataUpdate={lastLiveDataUpdate}
            operationalDataState={operationalDataState}
            rainfallDataState={rainfallDataState}
            onRefreshData={onRefreshAuditLogs}
          />
        )}

        {/* VIEW 7: AUDIT LOGS */}
        {activeTab === 'audit' && hasPermission('AUDIT_VIEW') && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <KeyRound className="w-5 h-5 text-indigo-400" />
                  <span>Persistent Operational Audit Trail</span>
                </h3>
                <p className="text-xs text-slate-400">Authority-scoped operational changes and report verifications</p>
              </div>
              <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1.5 rounded-xl border border-slate-700">
                {auditLogs.length} Logged Operations
              </span>
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {auditLogs.map(log => (
                <div key={log.id} className="p-3 bg-slate-800/60 border border-slate-700/80 rounded-xl text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-cyan-300">{log.action}</span>
                    <span className="text-[11px] text-slate-400">{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="text-slate-300">
                    Target: <strong className="text-white">{log.targetResource}</strong> • By: <strong className="text-indigo-300">{log.actorName} ({log.actorRole})</strong>
                  </div>
                  <p className="text-slate-400 text-[11px]">{log.details}</p>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
};
