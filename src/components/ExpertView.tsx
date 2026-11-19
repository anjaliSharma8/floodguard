import React, { useState, useEffect } from 'react';
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
  ExpertApplication
} from '../types';
import { calculateFloodRisk } from '../utils/rules';
import { MapView } from './MapView';
import { DatasetExplorer } from './DatasetExplorer';
import {
  ShieldCheck,
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
  UserCheck,
  Search
} from 'lucide-react';

interface ExpertViewProps {
  user: User;
  token: string;
  onLogout: () => void;
  roads: RoadSegment[];
  nodes: Record<string, RoadNode>;
  shelters: Shelter[];
  hospitals: Hospital[];
  facilities: EmergencyFacility[];
  waterways: WaterwayFeature[];
  reports: CommunityReport[];
  rainfallFeed: RainfallFeedMetadata | null;
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
  selectedRoad: RoadSegment | null;
  onSelectRoad: (road: RoadSegment) => void;
  onRefreshAuditLogs?: () => void;
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
  rainfallFeed,
  auditLogs,
  onUpdateRoadStatus,
  onVerifyReport,
  selectedRoad,
  onSelectRoad,
  onRefreshAuditLogs
}) => {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'map' | 'incidents' | 'simulator' | 'analytics' | 'datasets' | 'audit' | 'approvals'
  >('overview');

  // Road Manager Controls
  const [roadSearch, setRoadSearch] = useState('');
  const [statusReason, setStatusReason] = useState('Field engineering inspection update');
  const [statusExpiryHrs, setStatusExpiryHrs] = useState<number>(6);
  const [controlFeedback, setControlFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Incident Review Controls
  const [reviewNotesMap, setReviewNotesMap] = useState<Record<string, string>>({});

  // Scenario Simulator State (Sandbox using actual calculateFloodRisk)
  const [simRainfallMm, setSimRainfallMm] = useState<number>(75);
  const [simBlockedRoads, setSimBlockedRoads] = useState<string[]>([]);
  const [simResults, setSimResults] = useState<{
    newlyCriticalRoads: { name: string; score: number }[];
    affectedShelters: number;
    avgRiskDelta: number;
  } | null>(null);

  // Peer Expert Applications State (Zero ADMIN role: any active EXPERT can review pending peer experts)
  const [applications, setApplications] = useState<ExpertApplication[]>([]);

  useEffect(() => {
    if (user.role === 'EXPERT' && token) {
      fetch('/api/expert/applications', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setApplications(data);
        })
        .catch(() => {});
    }
  }, [user.role, token]);

  const handleApproveExpert = async (appId: string) => {
    try {
      const res = await fetch(`/api/expert/applications/${appId}/approve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setApplications(prev =>
          prev.map(a => (a.id === appId ? { ...a, status: 'ACTIVE', reviewedBy: user.fullName } : a))
        );
        onRefreshAuditLogs?.();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRejectExpert = async (appId: string) => {
    try {
      const res = await fetch(`/api/expert/applications/${appId}/reject`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setApplications(prev =>
          prev.map(a => (a.id === appId ? { ...a, status: 'REJECTED', reviewedBy: user.fullName } : a))
        );
        onRefreshAuditLogs?.();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleApplyRoadStatus = async (roadId: string, nextStatus: RoadStatus, nextRisk?: number) => {
    setControlFeedback(null);
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
  const totalShelterOccupancy = shelters.reduce((sum, s) => sum + s.currentOccupancy, 0);
  const occupancyPct = totalShelterCapacity > 0 ? Math.round((totalShelterOccupancy / totalShelterCapacity) * 100) : 0;

  const availableStations = (rainfallFeed?.observations || []).filter(o => o.isAvailable && o.observedPast24hMm !== null);
  const peakStation = availableStations.reduce<typeof availableStations[0] | null>(
    (best, cur) => (!best || (cur.observedPast24hMm || 0) > (best.observedPast24hMm || 0) ? cur : best),
    null
  );

  const pendingApprovalsCount = applications.filter(a => a.status === 'PENDING_APPROVAL').length;
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Expert Command Header */}
      <header className="sticky top-0 z-40 bg-slate-900 border-b border-indigo-900/60 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between min-h-16 py-2 gap-3">
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
                  {user.organisation || 'Pune & PCMC Disaster Cell'}
                </p>
              </div>
            </div>

            {/* Expert Top Navigation */}
            <nav className="hidden xl:flex items-center space-x-1 shrink-0" aria-label="Expert Navigation">
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
                <span>Incidents ({activeReportsCount})</span>
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

              <button onClick={() => setActiveTab('audit')} className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1 ${activeTab === 'audit' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}>
                <KeyRound className="w-3.5 h-3.5" />
                <span>Audit</span>
              </button>

              <button
                onClick={() => setActiveTab('approvals')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1 ${
                  activeTab === 'approvals' ? 'bg-amber-600 text-white shadow' : 'text-amber-300 hover:bg-slate-800'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Approvals ({pendingApprovalsCount})</span>
              </button>
            </nav>

            {/* Right User Bar */}
            <div className="flex items-center space-x-2 shrink-0">
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
          <div className="flex xl:hidden overflow-x-auto py-2 space-x-1 border-t border-slate-800 text-xs">
            <button onClick={() => setActiveTab('overview')} className={`px-2.5 py-1 rounded ${activeTab === 'overview' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}>Overview</button>
            <button onClick={() => setActiveTab('map')} className={`px-2.5 py-1 rounded ${activeTab === 'map' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}>GIS Map</button>
            <button onClick={() => setActiveTab('incidents')} className={`px-2.5 py-1 rounded ${activeTab === 'incidents' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}>Incidents</button>
            <button onClick={() => setActiveTab('simulator')} className={`px-2.5 py-1 rounded ${activeTab === 'simulator' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}>Simulator</button>
            <button onClick={() => setActiveTab('analytics')} className={`px-2.5 py-1 rounded ${activeTab === 'analytics' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}>Analytics</button>
            <button onClick={() => setActiveTab('datasets')} className={`px-2.5 py-1 rounded ${activeTab === 'datasets' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}>Datasets</button>
            <button onClick={() => setActiveTab('audit')} className={`px-2.5 py-1 rounded ${activeTab === 'audit' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}>Audit</button>
            <button onClick={() => setActiveTab('approvals')} className={`px-2.5 py-1 rounded ${activeTab === 'approvals' ? 'bg-amber-600 text-white' : 'text-amber-300'}`}>Approvals ({pendingApprovalsCount})</button>
          </div>
        </div>
      </header>

      {/* Main Expert Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* VIEW 1: OPERATIONS OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Top Operational Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div
                onClick={() => setActiveTab('incidents')}
                className="bg-slate-900 border border-slate-800 hover:border-amber-500/60 p-4 rounded-2xl shadow-xl cursor-pointer transition-all"
              >
                <span className="text-xs text-slate-400 font-semibold block">Active Citizen Incidents</span>
                <div className="text-2xl font-black text-amber-400 mt-1 flex items-center justify-between">
                  <span>{activeReportsCount}</span>
                  <Activity className="w-5 h-5 text-amber-400 opacity-60" />
                </div>
                <span className="text-[11px] text-slate-500">{reports.filter(r => r.verificationStatus === 'Verified').length} Expert Verified</span>
              </div>

              <div
                onClick={() => setActiveTab('map')}
                className="bg-slate-900 border border-slate-800 hover:border-red-500/60 p-4 rounded-2xl shadow-xl cursor-pointer transition-all"
              >
                <span className="text-xs text-slate-400 font-semibold block">Closed / Verified Hazards</span>
                <div className="text-2xl font-black text-red-400 mt-1 flex items-center justify-between">
                  <span>{closedRoadsCount} / {hazardRoadsCount}</span>
                  <AlertOctagon className="w-5 h-5 text-red-400 opacity-60" />
                </div>
                <span className="text-[11px] text-slate-500">{closedRoadsCount} excluded from routing</span>
              </div>

              <div
                onClick={() => setActiveTab('analytics')}
                className="bg-slate-900 border border-slate-800 hover:border-cyan-500/60 p-4 rounded-2xl shadow-xl cursor-pointer transition-all"
              >
                <span className="text-xs text-slate-400 font-semibold block">Shelter Occupancy</span>
                <div className="text-2xl font-black text-cyan-400 mt-1 flex items-center justify-between">
                  <span>{totalShelterOccupancy} / {totalShelterCapacity}</span>
                  <Users className="w-5 h-5 text-cyan-400 opacity-60" />
                </div>
                <span className="text-[11px] text-slate-500">{occupancyPct}% across {shelters.length} shelters</span>
              </div>

              <div
                onClick={() => setActiveTab('datasets')}
                className="bg-slate-900 border border-slate-800 hover:border-blue-500/60 p-4 rounded-2xl shadow-xl cursor-pointer transition-all"
              >
                <span className="text-xs text-slate-400 font-semibold block">Observed 24h Peak Rain</span>
                <div className="text-2xl font-black text-blue-400 mt-1 flex items-center justify-between">
                  <span>{peakStation?.observedPast24hMm !== null && peakStation?.observedPast24hMm !== undefined ? `${peakStation.observedPast24hMm.toFixed(1)} mm` : 'N/A'}</span>
                  <CloudRain className="w-5 h-5 text-blue-400 opacity-60" />
                </div>
                <span className="text-[11px] text-slate-500 truncate block">
                  {peakStation ? `${peakStation.stationName} (Open-Meteo)` : 'Weather feed unavailable'}
                </span>
              </div>
            </div>

            {/* GIS Overview + Authoritative Road Status Controls */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-7 h-[580px] rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
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
              <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
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

                        <div className="pt-1 flex gap-1.5">
                          {!isClosed && (
                            <button
                              onClick={() => handleApplyRoadStatus(road.id, 'CLOSED', 100)}
                              className="flex-1 bg-red-600 hover:bg-red-500 text-white py-1 rounded-lg text-[11px] font-semibold flex items-center justify-center space-x-1"
                            >
                              <Lock className="w-3 h-3" />
                              <span>Close Road</span>
                            </button>
                          )}
                          {road.status !== 'VERIFIED_HAZARD' && (
                            <button
                              onClick={() => handleApplyRoadStatus(road.id, 'VERIFIED_HAZARD', 82)}
                              className="flex-1 bg-orange-600 hover:bg-orange-500 text-white py-1 rounded-lg text-[11px] font-semibold"
                            >
                              Verify Hazard
                            </button>
                          )}
                          {road.status !== 'OPEN' && (
                            <button
                              onClick={() => handleApplyRoadStatus(road.id, 'OPEN', 20)}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-1 rounded-lg text-[11px] font-semibold flex items-center justify-center space-x-1"
                            >
                              <Unlock className="w-3 h-3" />
                              <span>Set Open</span>
                            </button>
                          )}
                        </div>
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
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">GIS Hydrological & Road Closure Map</h3>
                <p className="text-xs text-slate-400">Multi-layer geographic inspection for Pune & Pimpri-Chinchwad corridors</p>
              </div>
              <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1.5 rounded-xl border border-slate-700">
                {Object.keys(nodes).length} Junctions • {roads.length} Directed Corridors
              </span>
            </div>

            <div className="h-[650px] rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
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
              {reports.map(rep => {
                const noteVal = reviewNotesMap[rep.id] ?? rep.reviewNotes ?? '';
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
                        <span>Confidence: <strong className="text-cyan-300">{Math.round(rep.confidenceScore * 100)}%</strong></span>
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
                        placeholder="Optional review note recorded in audit trail..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 mt-1"
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {rep.verificationStatus !== 'Verified' && (
                        <>
                          <button
                            onClick={() => onVerifyReport(rep.id, 'Verified', 'verify_hazard', noteVal || undefined, 6)}
                            className="bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs px-3 py-2 rounded-xl flex items-center space-x-1"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>Verify Hazard</span>
                          </button>
                          <button
                            onClick={() => onVerifyReport(rep.id, 'Verified', 'close_road', noteVal || undefined, 6)}
                            className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs px-3 py-2 rounded-xl flex items-center space-x-1"
                          >
                            <Lock className="w-3.5 h-3.5" />
                            <span>Verify & Close Road</span>
                          </button>
                        </>
                      )}

                      {rep.verificationStatus !== 'Rejected' && (
                        <button
                          onClick={() => onVerifyReport(rep.id, 'Rejected', undefined, noteVal || undefined)}
                          className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs px-3 py-2 rounded-xl flex items-center space-x-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      )}

                      {rep.verificationStatus !== 'Resolved' && (
                        <button
                          onClick={() => onVerifyReport(rep.id, 'Resolved', undefined, noteVal || undefined)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3 py-2 rounded-xl"
                        >
                          Mark Resolved
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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
            <h3 className="text-base font-bold text-white">Live Basin & Corridor Risk Analytics</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700 space-y-2">
                <span className="text-slate-400 font-semibold block">Top Risk Corridors (Live Score)</span>
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
                <span className="text-slate-400 font-semibold block">Open-Meteo Station Telemetry</span>
                <div className="space-y-1.5 text-[11px]">
                  {(rainfallFeed?.observations || []).slice(0, 5).map(obs => (
                    <div key={obs.stationId} className="flex justify-between gap-2">
                      <span className="truncate">{obs.stationName}:</span>
                      <strong className="text-cyan-300">
                        {obs.isAvailable && obs.observedPast24hMm !== null ? `${obs.observedPast24hMm.toFixed(1)} mm / 24h` : 'Unavailable'}
                      </strong>
                    </div>
                  ))}
                  <div className="pt-1 border-t border-slate-700/70 text-[10px] text-slate-400">
                    IMD Status: {rainfallFeed?.imdApiStatus || 'KEY_MISSING'}
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700 space-y-2">
                <span className="text-slate-400 font-semibold block">Evacuation Preparedness</span>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between"><span>Total Shelter Capacity:</span> <strong className="text-white">{totalShelterCapacity} persons</strong></div>
                  <div className="flex justify-between"><span>Current Occupancy:</span> <strong className="text-cyan-300">{totalShelterOccupancy} persons ({occupancyPct}%)</strong></div>
                  <div className="flex justify-between"><span>Pet-Friendly Shelters:</span> <strong className="text-emerald-400">{shelters.filter(s => s.petFriendly).length} facilities</strong></div>
                  <div className="flex justify-between"><span>Trauma Hospitals Listed:</span> <strong className="text-white">{hospitals.length} centers</strong></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 6: DATASETS */}
        {activeTab === 'datasets' && (
          <DatasetExplorer rainfallFeed={rainfallFeed} />
        )}

        {/* VIEW 7: AUDIT LOGS */}
        {activeTab === 'audit' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <KeyRound className="w-5 h-5 text-indigo-400" />
                  <span>Persistent Operational Audit Trail</span>
                </h3>
                <p className="text-xs text-slate-400">Road status overrides, report verifications, and peer expert approvals</p>
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

        {/* VIEW 8: PEER EXPERT APPROVALS (Two-role design: no Admin role) */}
        {activeTab === 'approvals' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <UserCheck className="w-5 h-5 text-amber-400" />
                  <span>Peer Expert Credential Verification</span>
                </h3>
                <p className="text-xs text-slate-400">Active verified Experts review pending engineering/disaster specialist applications (no separate Admin role)</p>
              </div>
            </div>

            <div className="space-y-3">
              {applications.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center">No expert applications found.</p>
              ) : (
                applications.map(appItem => (
                  <div key={appItem.id} className="bg-slate-800/70 border border-slate-700 rounded-xl p-4 text-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white text-sm">{appItem.fullName}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          appItem.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400' :
                          (appItem.status === 'REJECTED' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400')
                        }`}>
                          {appItem.status}
                        </span>
                      </div>

                      <div className="text-slate-300 flex flex-wrap items-center gap-2 text-[11px]">
                        <span>{appItem.email}</span>
                        <span>•</span>
                        <span>{appItem.organisation}</span>
                        <span>•</span>
                        <span>{appItem.designation}</span>
                      </div>

                      <div className="text-[10px] text-slate-500">
                        Applied: {new Date(appItem.appliedAt).toLocaleString()}
                        {appItem.reviewedBy ? ` • Reviewed by ${appItem.reviewedBy}` : ''}
                      </div>
                    </div>

                    {appItem.status === 'PENDING_APPROVAL' && (
                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          onClick={() => handleApproveExpert(appItem.id)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3 py-2 rounded-xl flex items-center space-x-1"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Approve Expert</span>
                        </button>

                        <button
                          onClick={() => handleRejectExpert(appItem.id)}
                          className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs px-3 py-2 rounded-xl flex items-center space-x-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
