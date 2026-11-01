import React, { useState, useEffect } from 'react';
import { 
  User, 
  RoadSegment, 
  RoadNode, 
  Shelter, 
  Hospital, 
  EmergencyFacility, 
  CommunityReport, 
  RainfallObservation,
  AuditLog,
  ExpertApplication,
  Language
} from '../types';
import { RouteCalculationResult, calculateDijkstraRoute } from '../utils/rules';
import { MapView } from './MapView';
import { DatasetExplorer } from './DatasetExplorer';
import { 
  ShieldCheck, 
  SlidersHorizontal, 
  MapPin, 
  AlertOctagon, 
  Activity, 
  Users, 
  CloudRain, 
  FileText, 
  Layers, 
  CheckCircle, 
  XCircle, 
  Clock, 
  LogOut, 
  KeyRound, 
  BarChart2, 
  RefreshCw,
  Lock,
  Unlock,
  AlertTriangle,
  UserCheck,
  Building2,
  Briefcase
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
  reports: CommunityReport[];
  rainfall: RainfallObservation[];
  auditLogs: AuditLog[];
  onUpdateRoadStatus: (roadId: string, status: RoadSegment['status'], riskScore?: number) => void;
  onVerifyReport: (reportId: string, status: CommunityReport['verificationStatus'], action?: string) => void;
  onSimulateRainfall: (rainfallMm: number) => void;
  selectedRoad: RoadSegment | null;
  onSelectRoad: (road: RoadSegment) => void;
  onRefreshAuditLogs?: () => void;
}

export const ExpertView: React.FC<ExpertViewProps> = ({
  user,
  token,
  onLogout,
  roads,
  nodes,
  shelters,
  hospitals,
  facilities,
  reports,
  rainfall,
  auditLogs,
  onUpdateRoadStatus,
  onVerifyReport,
  onSimulateRainfall,
  selectedRoad,
  onSelectRoad,
  onRefreshAuditLogs
}) => {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'map' | 'incidents' | 'routes' | 'simulator' | 'analytics' | 'datasets' | 'audit' | 'approvals' | 'profile'
  >('overview');

  // Scenario Simulator State (Section 7.F)
  const [simRainfallMm, setSimRainfallMm] = useState<number>(55);
  const [simBlockedRoads, setSimBlockedRoads] = useState<string[]>(['R03']);
  const [simResults, setSimResults] = useState<{
    newlyCriticalRoads: string[];
    affectedShelters: number;
    avgRiskDelta: number;
  } | null>(null);

  // Admin Expert Applications State
  const [applications, setApplications] = useState<ExpertApplication[]>([]);
  const isAdmin = user.role === 'ADMIN';

  useEffect(() => {
    if (isAdmin) {
      fetch('/api/admin/expert-applications', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setApplications(data);
      })
      .catch(() => {});
    }
  }, [isAdmin, token]);

  const handleApproveExpert = async (appId: string) => {
    try {
      const res = await fetch(`/api/admin/expert-applications/${appId}/approve`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setApplications(prev => prev.map(a => a.id === appId ? { ...a, status: 'ACTIVE' } : a));
        onRefreshAuditLogs?.();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRejectExpert = async (appId: string) => {
    try {
      const res = await fetch(`/api/admin/expert-applications/${appId}/reject`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setApplications(prev => prev.map(a => a.id === appId ? { ...a, status: 'REJECTED' } : a));
        onRefreshAuditLogs?.();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Run Scenario Simulation without overwriting live operational data (Section 7.F)
  const handleRunScenario = () => {
    const criticalList: string[] = [];
    roads.forEach(r => {
      const isSimBlocked = simBlockedRoads.includes(r.id);
      const elevPenalty = Math.max(0, (580 - r.baseElevationM) * 0.8);
      const rainRisk = (simRainfallMm / 150) * 60;
      const drainPenalty = r.drainageCondition === 'poor' ? 30 : 15;
      const score = isSimBlocked ? 100 : Math.min(100, Math.round(rainRisk + elevPenalty + drainPenalty));
      if (score >= 80) criticalList.push(r.name);
    });

    setSimResults({
      newlyCriticalRoads: criticalList,
      affectedShelters: simRainfallMm > 80 ? 3 : 1,
      avgRiskDelta: Math.round((simRainfallMm / 150) * 25)
    });
  };

  const activeReportsCount = reports.filter(r => r.verificationStatus !== 'Resolved').length;
  const blockedRoadsCount = roads.filter(r => r.status === 'blocked').length;
  const totalShelterCapacity = shelters.reduce((sum, s) => sum + s.capacity, 0);
  const totalShelterOccupancy = shelters.reduce((sum, s) => sum + s.currentOccupancy, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Expert Command Header */}
      <header className="sticky top-0 z-40 bg-slate-900 border-b border-indigo-900/60 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('overview')}>
              <div className="p-2.5 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl shadow-lg flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-extrabold text-xl text-white tracking-tight">FloodGuard Authority</span>
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-mono font-bold">
                    {user.role} Desk
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 hidden sm:block">
                  {user.organisation || 'Pune Municipal Disaster Cell'} • {user.designation || 'Operational Commander'}
                </p>
              </div>
            </div>

            {/* Expert Top Navigation (Section 7) */}
            <nav className="hidden xl:flex items-center space-x-1" aria-label="Expert Navigation">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
                  activeTab === 'overview' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Activity className="w-4 h-4" />
                <span>Overview</span>
              </button>

              <button
                onClick={() => setActiveTab('map')}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
                  activeTab === 'map' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>GIS Map</span>
              </button>

              <button
                onClick={() => setActiveTab('incidents')}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
                  activeTab === 'incidents' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <AlertOctagon className="w-4 h-4" />
                <span>Incidents ({activeReportsCount})</span>
              </button>

              <button
                onClick={() => setActiveTab('simulator')}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
                  activeTab === 'simulator' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <CloudRain className="w-4 h-4" />
                <span>Scenario Simulator</span>
              </button>

              <button
                onClick={() => setActiveTab('analytics')}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
                  activeTab === 'analytics' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <BarChart2 className="w-4 h-4" />
                <span>Analytics</span>
              </button>

              <button
                onClick={() => setActiveTab('datasets')}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
                  activeTab === 'datasets' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Datasets</span>
              </button>

              <button
                onClick={() => setActiveTab('audit')}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
                  activeTab === 'audit' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <KeyRound className="w-4 h-4" />
                <span>Audit Logs</span>
              </button>

              {isAdmin && (
                <button
                  onClick={() => setActiveTab('approvals')}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
                    activeTab === 'approvals' ? 'bg-amber-600 text-white shadow' : 'text-amber-400 hover:bg-slate-800'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Approvals ({applications.filter(a => a.status === 'PENDING_APPROVAL').length})</span>
                </button>
              )}
            </nav>

            {/* Right User Bar */}
            <div className="flex items-center space-x-3">
              <div className="text-right hidden sm:block">
                <span className="text-xs font-bold text-white block">{user.fullName}</span>
                <span className="text-[10px] text-indigo-300 font-mono">{user.role} Clearance</span>
              </div>

              <button
                onClick={onLogout}
                title="Log out of Authority Desk"
                className="p-2 bg-slate-800 hover:bg-red-950/70 text-slate-300 hover:text-red-400 rounded-xl border border-slate-700 transition-colors flex items-center space-x-1 text-xs"
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
            <button onClick={() => setActiveTab('audit')} className={`px-2.5 py-1 rounded ${activeTab === 'audit' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}>Audit Logs</button>
            {isAdmin && (
              <button onClick={() => setActiveTab('approvals')} className={`px-2.5 py-1 rounded ${activeTab === 'approvals' ? 'bg-amber-600 text-white' : 'text-amber-400'}`}>Approvals</button>
            )}
          </div>
        </div>
      </header>

      {/* Main Expert Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* VIEW 1: OPERATIONS OVERVIEW (Section 7.A) */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Top Operational Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div 
                onClick={() => setActiveTab('incidents')}
                className="bg-slate-900 border border-slate-800 hover:border-amber-500/60 p-4 rounded-2xl shadow-xl cursor-pointer transition-all hover:-translate-y-0.5"
              >
                <span className="text-xs text-slate-400 font-semibold block">Active Citizen Incidents</span>
                <div className="text-2xl font-black text-amber-400 mt-1 flex items-center justify-between">
                  <span>{activeReportsCount}</span>
                  <Activity className="w-5 h-5 text-amber-400 opacity-60" />
                </div>
                <span className="text-[11px] text-slate-500">{reports.filter(r => r.verificationStatus === 'Verified').length} Verified Hazards</span>
              </div>

              <div 
                onClick={() => setActiveTab('map')}
                className="bg-slate-900 border border-slate-800 hover:border-red-500/60 p-4 rounded-2xl shadow-xl cursor-pointer transition-all hover:-translate-y-0.5"
              >
                <span className="text-xs text-slate-400 font-semibold block">Officially Blocked Corridors</span>
                <div className="text-2xl font-black text-red-400 mt-1 flex items-center justify-between">
                  <span>{blockedRoadsCount}</span>
                  <AlertOctagon className="w-5 h-5 text-red-400 opacity-60" />
                </div>
                <span className="text-[11px] text-slate-500">Excluded from citizen routes</span>
              </div>

              <div 
                onClick={() => setActiveTab('analytics')}
                className="bg-slate-900 border border-slate-800 hover:border-cyan-500/60 p-4 rounded-2xl shadow-xl cursor-pointer transition-all hover:-translate-y-0.5"
              >
                <span className="text-xs text-slate-400 font-semibold block">Shelter Capacity Utilization</span>
                <div className="text-2xl font-black text-cyan-400 mt-1 flex items-center justify-between">
                  <span>{totalShelterOccupancy} / {totalShelterCapacity}</span>
                  <Users className="w-5 h-5 text-cyan-400 opacity-60" />
                </div>
                <span className="text-[11px] text-slate-500">{Math.round((totalShelterOccupancy / totalShelterCapacity) * 100)}% Occupancy</span>
              </div>

              <div 
                onClick={() => setActiveTab('map')}
                className="bg-slate-900 border border-slate-800 hover:border-blue-500/60 p-4 rounded-2xl shadow-xl cursor-pointer transition-all hover:-translate-y-0.5"
              >
                <span className="text-xs text-slate-400 font-semibold block">Peak Catchment Inundation</span>
                <div className="text-2xl font-black text-blue-400 mt-1 flex items-center justify-between">
                  <span>88.0 mm</span>
                  <CloudRain className="w-5 h-5 text-blue-400 opacity-60" />
                </div>
                <span className="text-[11px] text-slate-500">Khadakwasla Basin AWS</span>
              </div>
            </div>

            {/* GIS Overview + Quick Hazard Control */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-8 h-[550px] rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
                <MapView
                  roads={roads}
                  nodes={nodes}
                  shelters={shelters}
                  hospitals={hospitals}
                  emergencyFacilities={facilities}
                  reports={reports}
                  selectedRoadId={selectedRoad?.id}
                  onSelectRoad={onSelectRoad}
                />
              </div>

              {/* Road Status Manager (Section 7.C) */}
              <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Authoritative Road Controls</h3>
                  <span className="text-[10px] text-slate-400 font-mono">Real-time Override</span>
                </div>

                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                  {roads.map(road => {
                    const isBlocked = road.status === 'blocked';
                    return (
                      <div key={road.id} className="p-3 bg-slate-800/60 border border-slate-700/80 rounded-xl text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white truncate max-w-[170px]">{road.name}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            isBlocked ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
                          }`}>
                            {road.status.toUpperCase()}
                          </span>
                        </div>

                        <div className="flex justify-between text-[11px] text-slate-400">
                          <span>Risk: <strong className="text-cyan-300">{road.riskScore}/100</strong></span>
                          <span>Elev: {road.baseElevationM}m</span>
                        </div>

                        <div className="pt-1 flex space-x-2">
                          {isBlocked ? (
                            <button
                              onClick={() => onUpdateRoadStatus(road.id, 'open', 35)}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-1 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                              <span>Reopen Road</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => onUpdateRoadStatus(road.id, 'blocked', 100)}
                              className="flex-1 bg-red-600 hover:bg-red-500 text-white py-1 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              <span>Declare Blocked</span>
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

        {/* VIEW 2: GIS RISK MAP FULLSCREEN (Section 7.B & 7.C) */}
        {activeTab === 'map' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Advanced GIS Hydrological Risk Map</h3>
                <p className="text-xs text-slate-400">Multi-layer geographic inspection for Pune & Pimpri-Chinchwad corridors</p>
              </div>
              <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1.5 rounded-xl border border-slate-700">
                13 Intersections • 16 Arterial Edges
              </span>
            </div>

            <div className="h-[650px] rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
              <MapView
                roads={roads}
                nodes={nodes}
                shelters={shelters}
                hospitals={hospitals}
                emergencyFacilities={facilities}
                reports={reports}
                selectedRoadId={selectedRoad?.id}
                onSelectRoad={onSelectRoad}
              />
            </div>
          </div>
        )}

        {/* VIEW 3: INCIDENT MANAGEMENT (Section 7.D) */}
        {activeTab === 'incidents' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white">Emergency Incident Verification Centre</h3>
                <p className="text-xs text-slate-400">Section 7.D: Verify citizen reports before establishing authoritative road hazards</p>
              </div>
              <span className="text-xs font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-800 px-3 py-1.5 rounded-xl">
                {reports.filter(r => r.verificationStatus === 'Reported').length} Pending Audits
              </span>
            </div>

            <div className="space-y-3">
              {reports.map(rep => (
                <div key={rep.id} className="bg-slate-800/70 border border-slate-700 rounded-xl p-4 text-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1.5 max-w-xl">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white text-sm">{rep.locationName}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        rep.severity === 'Critical' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {rep.severity}
                      </span>
                      <span className="text-slate-400">({rep.reportType})</span>
                    </div>

                    <p className="text-slate-300">{rep.description}</p>

                    <div className="text-[11px] text-slate-400 flex items-center space-x-3">
                      <span>Submitted: {new Date(rep.timestamp).toLocaleString()}</span>
                      <span>•</span>
                      <span>By: <strong className="text-slate-300">{rep.userName || rep.userId}</strong></span>
                      <span>•</span>
                      <span>Confidence: <strong className="text-cyan-300">{Math.round(rep.confidenceScore * 100)}%</strong></span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-2 shrink-0">
                    {rep.verificationStatus !== 'Verified' && (
                      <button
                        onClick={() => onVerifyReport(rep.id, 'Verified')}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3 py-2 rounded-xl flex items-center space-x-1"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Verify Incident</span>
                      </button>
                    )}

                    {rep.verificationStatus !== 'Rejected' && (
                      <button
                        onClick={() => onVerifyReport(rep.id, 'Rejected')}
                        className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs px-3 py-2 rounded-xl flex items-center space-x-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    )}

                    {rep.verificationStatus !== 'Resolved' && (
                      <button
                        onClick={() => onVerifyReport(rep.id, 'Resolved')}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3 py-2 rounded-xl"
                      >
                        Mark Resolved
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 4: SCENARIO SIMULATOR (Section 7.F) */}
        {activeTab === 'simulator' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
            <div className="border-b border-slate-800 pb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <CloudRain className="w-5 h-5 text-indigo-400" />
                  <span>Section 7.F Pre-Flood Scenario Simulator</span>
                </h3>
                <p className="text-xs text-slate-400">Hypothetical What-If stress testing without modifying live operational data</p>
              </div>
              <span className="text-xs bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-full font-mono font-bold">
                Simulation Sandbox
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: Parameter adjustments */}
              <div className="space-y-4 bg-slate-800/60 p-4 rounded-xl border border-slate-700 text-xs">
                <div>
                  <div className="flex justify-between mb-1.5">
                    <span className="font-semibold text-slate-300">Simulated Cloudburst Rainfall:</span>
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
                    <span>75mm (Severe)</span>
                    <span>150mm (Catastrophic Cloudburst)</span>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-2">Simulate Road Inundation Closures:</label>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
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
                        <span>{r.name} ({r.baseElevationM}m)</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleRunScenario}
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg"
                >
                  Run Flood Impact Simulation
                </button>
              </div>

              {/* Right: Simulation Output */}
              <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700 text-xs space-y-3">
                <h4 className="font-bold text-white text-xs uppercase tracking-wider">Simulated Inundation Results</h4>

                {simResults ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-3 bg-slate-900 rounded-xl border border-slate-700">
                        <span className="text-slate-400 text-[10px] block">Avg Risk Increase</span>
                        <span className="text-lg font-bold text-amber-400">+{simResults.avgRiskDelta}%</span>
                      </div>
                      <div className="p-3 bg-slate-900 rounded-xl border border-slate-700">
                        <span className="text-slate-400 text-[10px] block">Threatened Shelters</span>
                        <span className="text-lg font-bold text-red-400">{simResults.affectedShelters} Facilities</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-slate-400 text-[11px] block font-semibold">Newly Critical Road Corridors:</span>
                      <div className="space-y-1 max-h-36 overflow-y-auto">
                        {simResults.newlyCriticalRoads.map((name, i) => (
                          <div key={i} className="p-2 bg-red-950/40 border border-red-900/60 rounded text-red-300 text-[11px]">
                            ⚠️ {name}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-400 text-xs py-8 text-center">
                    Adjust simulation parameters and click "Run Flood Impact Simulation" to calculate hydraulic impact.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 5: ANALYTICS (Section 7.G) */}
        {activeTab === 'analytics' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
            <h3 className="text-base font-bold text-white">Risk & Impact Analytics (Pune Basin)</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700 space-y-2">
                <span className="text-slate-400 font-semibold block">Corridor Risk Breakdown</span>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between"><span>Sinhagad Road Basin:</span> <strong className="text-red-400">Critical (88)</strong></div>
                  <div className="flex justify-between"><span>Bund Garden Bridge:</span> <strong className="text-orange-400">High (68)</strong></div>
                  <div className="flex justify-between"><span>FC / JM Road:</span> <strong className="text-amber-400">Moderate (42)</strong></div>
                  <div className="flex justify-between"><span>Kothrud Karve Road:</span> <strong className="text-emerald-400">Low (18)</strong></div>
                </div>
              </div>

              <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700 space-y-2">
                <span className="text-slate-400 font-semibold block">Catchment Discharge Telemetry</span>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between"><span>Khadakwasla Dam:</span> <strong className="text-cyan-300">18,400 cusecs</strong></div>
                  <div className="flex justify-between"><span>Pavana River Crest:</span> <strong className="text-cyan-300">1.8m above datum</strong></div>
                  <div className="flex justify-between"><span>Mutha River Level:</span> <strong className="text-amber-400">Submerging Bhide causeway</strong></div>
                </div>
              </div>

              <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700 space-y-2">
                <span className="text-slate-400 font-semibold block">Evacuation Preparedness</span>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between"><span>Total Shelter Capacity:</span> <strong className="text-white">2,050 persons</strong></div>
                  <div className="flex justify-between"><span>Current Occupancy:</span> <strong className="text-cyan-300">645 persons (31%)</strong></div>
                  <div className="flex justify-between"><span>Animal Rescue Beds:</span> <strong className="text-emerald-400">140 kennels ready (RESQ)</strong></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 6: DATASET MANAGEMENT (Section 7.H) */}
        {activeTab === 'datasets' && (
          <DatasetExplorer />
        )}

        {/* VIEW 7: AUDIT LOGS (Section 7.I) */}
        {activeTab === 'audit' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <KeyRound className="w-5 h-5 text-indigo-400" />
                  <span>Immutable Operational Audit Trail</span>
                </h3>
                <p className="text-xs text-slate-400">All sensitive actions (road closures, incident approvals) are cryptographically logged</p>
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

        {/* VIEW 8: ADMIN EXPERT APPROVALS (Section 4.E) */}
        {activeTab === 'approvals' && isAdmin && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <UserCheck className="w-5 h-5 text-amber-400" />
                  <span>Administrator Expert Clearances Desk</span>
                </h3>
                <p className="text-xs text-slate-400">Review official credentials before granting disaster response command privileges</p>
              </div>
            </div>

            <div className="space-y-3">
              {applications.map(appItem => (
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

                    <div className="text-slate-300 flex items-center space-x-3 text-[11px]">
                      <span>{appItem.email}</span>
                      <span>•</span>
                      <span>{appItem.organisation}</span>
                      <span>•</span>
                      <span>{appItem.designation}</span>
                    </div>

                    <div className="text-[10px] text-slate-500">
                      Applied: {new Date(appItem.appliedAt).toLocaleString()}
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
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
