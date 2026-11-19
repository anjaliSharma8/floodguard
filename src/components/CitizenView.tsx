import React, { useState } from 'react';
import {
  User,
  RoadSegment,
  RoadNode,
  Shelter,
  Hospital,
  EmergencyFacility,
  CommunityReport,
  LivePoll,
  RouteFeedback,
  RainfallFeedMetadata,
  WaterwayFeature,
  AppNotification,
  Language,
  EvacuationPreferences
} from '../types';
import { MultiRouteResponse, RouteMode } from '../utils/rules';
import { TRANSLATIONS } from '../utils/i18n';
import { MapView } from './MapView';
import { SafeRoutePlanner } from './SafeRoutePlanner';
import { CommunitySection } from './CommunitySection';
import { EmergencyResources } from './EmergencyResources';
import { DatasetExplorer } from './DatasetExplorer';
import {
  ShieldAlert,
  MapPin,
  Users,
  PhoneCall,
  Bot,
  FileText,
  LogOut,
  Mic,
  Wifi,
  WifiOff,
  Baby,
  HeartHandshake,
  Accessibility,
  PawPrint,
  Compass,
  Bell,
  Database,
  Send,
  Info,
  CheckCheck
} from 'lucide-react';

interface CitizenViewProps {
  user: User;
  onLogout: () => void;
  roads: RoadSegment[];
  nodes: Record<string, RoadNode>;
  shelters: Shelter[];
  hospitals: Hospital[];
  facilities: EmergencyFacility[];
  waterways: WaterwayFeature[];
  reports: CommunityReport[];
  polls: LivePoll[];
  routeFeedbacks: RouteFeedback[];
  notifications: AppNotification[];
  rainfallFeed: RainfallFeedMetadata | null;
  lang: Language;
  setLang: (lang: Language) => void;
  isOffline: boolean;
  setIsOffline: (offline: boolean) => void;
  onOpenChat: () => void;
  onOpenOfflineGuide: () => void;
  onTriggerVoice: () => void;
  onRunCommand: (text: string) => void;
  isVoiceListening: boolean;
  voiceFeedback: string | null;
  onAddReport: (report: Partial<CommunityReport>) => Promise<{ ok: boolean; error?: string }>;
  onVotePoll: (pollId: string, option: string) => Promise<{ ok: boolean; error?: string }>;
  onSubmitFeedback: (feedback: Partial<RouteFeedback>) => Promise<void> | void;
  onMarkNotificationRead: (id: string) => void;
  activeCalculation: (MultiRouteResponse & { activeMode: RouteMode; altIndex?: number }) | null;
  onRouteCalculated: (res: MultiRouteResponse & { activeMode: RouteMode; altIndex?: number }) => void;
  selectedRoad: RoadSegment | null;
  onSelectRoad: (road: RoadSegment) => void;
  externalOriginId?: string;
  externalDestId?: string;
  onGpsDetectedOrigin?: (nodeId: string) => void;
  activeNavOverride?: 'dashboard' | 'routes' | 'community' | 'emergency' | 'my-reports' | 'alerts' | 'datasets' | 'profile';
  onClearNavOverride?: () => void;
}

export const CitizenView: React.FC<CitizenViewProps> = ({
  user,
  onLogout,
  roads,
  nodes,
  shelters,
  hospitals,
  facilities,
  waterways,
  reports,
  polls,
  routeFeedbacks,
  notifications,
  rainfallFeed,
  lang,
  setLang,
  isOffline,
  setIsOffline,
  onOpenChat,
  onOpenOfflineGuide,
  onTriggerVoice,
  onRunCommand,
  isVoiceListening,
  voiceFeedback,
  onAddReport,
  onVotePoll,
  onSubmitFeedback,
  onMarkNotificationRead,
  activeCalculation,
  onRouteCalculated,
  selectedRoad,
  onSelectRoad,
  externalOriginId,
  externalDestId,
  onGpsDetectedOrigin,
  activeNavOverride,
  onClearNavOverride
}) => {
  const t = TRANSLATIONS[lang];
  const [activeNavState, setActiveNavState] = useState<
    'dashboard' | 'routes' | 'community' | 'emergency' | 'my-reports' | 'alerts' | 'datasets' | 'profile'
  >('dashboard');
  const [commandInput, setCommandInput] = useState('');

  const activeNav = activeNavOverride || activeNavState;
  const setActiveNav = (
    next: 'dashboard' | 'routes' | 'community' | 'emergency' | 'my-reports' | 'alerts' | 'datasets' | 'profile'
  ) => {
    onClearNavOverride?.();
    setActiveNavState(next);
  };

  // Personal Evacuation Assistant Preferences
  const [evacPrefs, setEvacPrefs] = useState<EvacuationPreferences>({
    hasChildren: false,
    hasElderly: false,
    hasMobilityRequirements: false,
    hasPets: false
  });

  const filteredShelters = shelters.filter(s => {
    if (evacPrefs.hasPets && !s.petFriendly) return false;
    if (evacPrefs.hasMobilityRequirements && !s.wheelchairAccessible) return false;
    return true;
  });

  const myReports = reports.filter(r => r.userId === user.id || r.userName === user.fullName);
  const unreadAlerts = notifications.filter(n => !n.isRead).length;

  // Derive active & alternative route edges for MapView
  const selectedRoute = activeCalculation
    ? activeCalculation.activeMode === 'safest' &&
      activeCalculation.altIndex !== undefined &&
      activeCalculation.alternatives[activeCalculation.altIndex]
      ? activeCalculation.alternatives[activeCalculation.altIndex]
      : activeCalculation[activeCalculation.activeMode]
    : null;

  const selectedEdgeKey = selectedRoute ? selectedRoute.edges.map(e => e.id).join(',') : '';

  const activeRouteEdges = selectedRoute
    ? selectedRoute.edges.map(edge => roads.find(r => r.id === edge.id)).filter((r): r is RoadSegment => Boolean(r))
    : undefined;

  const altRoute = activeCalculation
    ? activeCalculation.activeMode !== 'safest' &&
      activeCalculation.safest.feasible &&
      activeCalculation.safest.edges.map(e => e.id).join(',') !== selectedEdgeKey
      ? activeCalculation.safest
      : activeCalculation.alternatives.find(alt => alt.edges.map(e => e.id).join(',') !== selectedEdgeKey)
    : undefined;

  const altRouteEdges = altRoute
    ? altRoute.edges.map(edge => roads.find(r => r.id === edge.id)).filter((r): r is RoadSegment => Boolean(r))
    : undefined;

  // Real rainfall summary from Open-Meteo feed
  const availableStations = (rainfallFeed?.observations || []).filter(o => o.isAvailable && o.observedPast24hMm !== null);
  const peak24hMm = availableStations.length
    ? Math.max(...availableStations.map(o => o.observedPast24hMm || 0))
    : null;

  const closedRoadsCount = roads.filter(r => r.status === 'CLOSED').length;
  const verifiedHazardCount = roads.filter(r => r.status === 'VERIFIED_HAZARD').length;

  const handleMapGps = async (lat: number, lng: number) => {
    try {
      const res = await fetch('/api/routes/snap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng })
      });
      const data = await res.json();
      if (res.ok && data.nearestNode?.id) {
        onGpsDetectedOrigin?.(data.nearestNode.id);
      }
    } catch {
      // Ignore offline snap failures
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Citizen Alert Ticker (Real telemetry only — zero fabricated gauge numbers) */}
      <div className="bg-amber-600 text-slate-950 px-4 py-1.5 text-xs font-semibold flex items-center justify-between overflow-hidden">
        <div className="flex items-center space-x-2 truncate">
          <span className="bg-red-700 text-white px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold shrink-0">
            CITIZEN ADVISORY
          </span>
          <span className="truncate">{t.weatherAlert}</span>
        </div>
        <div className="hidden md:flex items-center space-x-3 text-xs pl-4 shrink-0">
          <span>
            Open-Meteo 24h Peak:{' '}
            <strong>{peak24hMm !== null ? `${peak24hMm.toFixed(1)} mm` : 'Unavailable'}</strong>
          </span>
          <span>•</span>
          <span>
            IMD Feed:{' '}
            <strong>{rainfallFeed?.imdApiStatus === 'CONFIGURED' ? 'Active' : 'Unavailable (No Key)'}</strong>
          </span>
        </div>
      </div>

      {/* Citizen Header / Navigation */}
      <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between min-h-16 py-2 gap-2">
            {/* Logo */}
            <div className="flex items-center space-x-2 cursor-pointer shrink-0" onClick={() => setActiveNav('dashboard')}>
              <div className="p-1.5 sm:p-2 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-xl shadow-md flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="font-extrabold text-base sm:text-xl text-white tracking-tight whitespace-nowrap">SanketSetu</span>
                  <span className="hidden sm:inline-flex text-[10px] bg-blue-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full font-mono font-bold">
                    Citizen
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 hidden sm:block whitespace-nowrap">Pune & PCMC Safe-Route Network</p>
              </div>
            </div>

            {/* Citizen Navigation (Zero Authority Controls) */}
            <nav className="hidden xl:flex items-center space-x-1 shrink-0" aria-label="Citizen Navigation">
              <button
                onClick={() => setActiveNav('dashboard')}
                className={`px-2.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1.5 ${
                  activeNav === 'dashboard' ? 'bg-blue-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Compass className="w-4 h-4" />
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => setActiveNav('routes')}
                className={`px-2.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1.5 ${
                  activeNav === 'routes' ? 'bg-blue-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <MapPin className="w-4 h-4" />
                <span>Safe Routes</span>
              </button>

              <button
                onClick={() => setActiveNav('community')}
                className={`px-2.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1.5 ${
                  activeNav === 'community' ? 'bg-blue-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Community</span>
              </button>

              <button
                onClick={() => setActiveNav('emergency')}
                className={`px-2.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1.5 ${
                  activeNav === 'emergency' ? 'bg-red-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <PhoneCall className="w-4 h-4" />
                <span>Emergency SOS</span>
              </button>

              <button
                onClick={() => setActiveNav('my-reports')}
                className={`px-2.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1.5 ${
                  activeNav === 'my-reports' ? 'bg-blue-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>My Reports ({myReports.length})</span>
              </button>

              <button
                onClick={() => setActiveNav('alerts')}
                className={`px-2.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1.5 ${
                  activeNav === 'alerts' ? 'bg-blue-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Bell className="w-4 h-4" />
                <span>Alerts {unreadAlerts > 0 ? `(${unreadAlerts})` : ''}</span>
              </button>

              <button
                onClick={() => setActiveNav('datasets')}
                className={`px-2.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1.5 ${
                  activeNav === 'datasets' ? 'bg-blue-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Database className="w-4 h-4" />
                <span>Sources</span>
              </button>
            </nav>

            {/* Right Controls */}
            <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
              <button
                onClick={onTriggerVoice}
                title={t.voiceAssistant}
                className={`p-1.5 sm:p-2 rounded-lg border transition-all flex items-center space-x-1 text-xs font-semibold ${
                  isVoiceListening
                    ? 'bg-red-600 border-red-500 text-white animate-pulse'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-cyan-400'
                }`}
              >
                <Mic className="w-4 h-4" />
                <span className="hidden sm:inline">{isVoiceListening ? 'Listening...' : 'Voice'}</span>
              </button>

              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as Language)}
                aria-label="Select language"
                className="bg-slate-800 border border-slate-700 text-slate-200 text-[11px] sm:text-xs rounded-lg px-1.5 sm:px-2 py-1.5 focus:outline-none"
              >
                <option value="en">EN</option>
                <option value="hi">HI</option>
                <option value="mr">MR</option>
              </select>

              <button
                onClick={() => {
                  const next = !isOffline;
                  setIsOffline(next);
                  if (next) onOpenOfflineGuide();
                }}
                title={isOffline ? 'Offline Mode Active' : 'Online Connection Active'}
                className={`p-1.5 sm:p-2 rounded-lg border transition-colors ${
                  isOffline
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                    : 'bg-slate-800 text-emerald-400 border-slate-700 hover:bg-slate-700'
                }`}
              >
                {isOffline ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
              </button>

              <button
                onClick={onOpenChat}
                aria-label="Open Assistant"
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold p-1.5 sm:px-3 sm:py-2 rounded-lg shadow flex items-center space-x-1.5"
              >
                <Bot className="w-4 h-4 text-cyan-300" />
                <span className="hidden sm:inline">Assistant</span>
              </button>

              <div className="flex items-center pl-1 sm:pl-2 space-x-1 sm:space-x-2 border-l border-slate-800">
                <button
                  onClick={() => setActiveNav('profile')}
                  className="hidden sm:flex items-center space-x-1.5 text-xs text-slate-300 hover:text-white"
                  title="Citizen Profile"
                >
                  <span className="w-7 h-7 rounded-full bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 flex items-center justify-center font-bold text-xs">
                    {user.fullName.charAt(0)}
                  </span>
                </button>

                <button
                  onClick={onLogout}
                  title="Log out of Citizen Mode"
                  className="p-1.5 bg-slate-800 hover:bg-red-950/60 text-slate-400 hover:text-red-400 rounded-lg border border-slate-700 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Citizen Navigation Bar */}
          <div className="flex xl:hidden overflow-x-auto py-2 space-x-1 border-t border-slate-800 text-xs">
            <button onClick={() => setActiveNav('dashboard')} className={`px-3 py-1 rounded-lg whitespace-nowrap font-medium ${activeNav === 'dashboard' ? 'bg-blue-600 text-white' : 'text-slate-300'}`}>Dashboard</button>
            <button onClick={() => setActiveNav('routes')} className={`px-3 py-1 rounded-lg whitespace-nowrap font-medium ${activeNav === 'routes' ? 'bg-blue-600 text-white' : 'text-slate-300'}`}>Routes</button>
            <button onClick={() => setActiveNav('community')} className={`px-3 py-1 rounded-lg whitespace-nowrap font-medium ${activeNav === 'community' ? 'bg-blue-600 text-white' : 'text-slate-300'}`}>Community</button>
            <button onClick={() => setActiveNav('emergency')} className={`px-3 py-1 rounded-lg whitespace-nowrap font-medium ${activeNav === 'emergency' ? 'bg-red-600 text-white' : 'text-slate-300'}`}>SOS</button>
            <button onClick={() => setActiveNav('my-reports')} className={`px-3 py-1 rounded-lg whitespace-nowrap font-medium ${activeNav === 'my-reports' ? 'bg-blue-600 text-white' : 'text-slate-300'}`}>My Reports ({myReports.length})</button>
            <button onClick={() => setActiveNav('alerts')} className={`px-3 py-1 rounded-lg whitespace-nowrap font-medium ${activeNav === 'alerts' ? 'bg-blue-600 text-white' : 'text-slate-300'}`}>Alerts ({unreadAlerts})</button>
            <button onClick={() => setActiveNav('datasets')} className={`px-3 py-1 rounded-lg whitespace-nowrap font-medium ${activeNav === 'datasets' ? 'bg-blue-600 text-white' : 'text-slate-300'}`}>Sources</button>
          </div>
        </div>
      </header>

      {/* Voice Feedback / Text Command Bar */}
      {(voiceFeedback || isVoiceListening) && (
        <div className="bg-slate-900 border-b border-cyan-900/60 px-4 py-2 text-xs">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-cyan-300 font-medium">
              {isVoiceListening ? t.voiceListening : voiceFeedback}
            </span>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!commandInput.trim()) return;
                onRunCommand(commandInput.trim());
                setCommandInput('');
              }}
              className="flex items-center space-x-2"
            >
              <input
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder="Type voice command (e.g., Safe route to Kothrud, Show shelters)"
                className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white w-64 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
              <button
                type="submit"
                className="bg-cyan-600 hover:bg-cyan-500 text-white px-2.5 py-1 rounded-lg font-semibold flex items-center space-x-1"
              >
                <Send className="w-3 h-3" />
                <span>Run</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Main Citizen Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* VIEW 1: CITIZEN DASHBOARD */}
        {activeNav === 'dashboard' && (
          <div className="space-y-6">
            {/* Quick Status Bar */}
            <div className="bg-gradient-to-r from-blue-950/60 to-slate-900 border border-blue-900/60 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Personal Flood Safety Desk</span>
                <h2 className="text-xl font-black text-white mt-0.5">Welcome, {user.fullName}</h2>
                <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                  Directed safe-route engine over 32 Pune & Pimpri-Chinchwad junctions and 46 OSM corridors, fused with Open-Meteo precipitation and expert-verified road closures.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0 text-xs">
                <div className="bg-slate-900/80 px-3 py-2 rounded-xl border border-slate-800">
                  <span className="text-slate-400 text-[10px] block">Weather Feed</span>
                  <span className={`font-bold ${rainfallFeed?.openMeteoStatus === 'OK' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {rainfallFeed?.openMeteoStatus === 'OK' ? 'Open-Meteo Live' : 'Feed Delayed'}
                  </span>
                </div>
                <div className="bg-slate-900/80 px-3 py-2 rounded-xl border border-slate-800">
                  <span className="text-slate-400 text-[10px] block">Official Road Closures</span>
                  <span className="font-bold text-red-400">{closedRoadsCount} Closed • {verifiedHazardCount} Hazards</span>
                </div>
              </div>
            </div>

            {/* Personal Evacuation Assistant */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <HeartHandshake className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-sm font-bold text-white">Personal Evacuation Preferences</h3>
                </div>
                <span className="text-[11px] text-slate-400">Filters matching emergency shelters</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <label className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center space-x-2 ${
                  evacPrefs.hasChildren ? 'bg-cyan-950/60 border-cyan-500 text-white' : 'bg-slate-800/60 border-slate-700 text-slate-300'
                }`}>
                  <input
                    type="checkbox"
                    checked={evacPrefs.hasChildren}
                    onChange={(e) => setEvacPrefs(prev => ({ ...prev, hasChildren: e.target.checked }))}
                    className="sr-only"
                  />
                  <Baby className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="font-semibold text-xs">With Children</span>
                </label>

                <label className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center space-x-2 ${
                  evacPrefs.hasElderly ? 'bg-cyan-950/60 border-cyan-500 text-white' : 'bg-slate-800/60 border-slate-700 text-slate-300'
                }`}>
                  <input
                    type="checkbox"
                    checked={evacPrefs.hasElderly}
                    onChange={(e) => setEvacPrefs(prev => ({ ...prev, hasElderly: e.target.checked }))}
                    className="sr-only"
                  />
                  <HeartHandshake className="w-4 h-4 text-pink-400 shrink-0" />
                  <span className="font-semibold text-xs">With Elderly</span>
                </label>

                <label className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center space-x-2 ${
                  evacPrefs.hasMobilityRequirements ? 'bg-cyan-950/60 border-cyan-500 text-white' : 'bg-slate-800/60 border-slate-700 text-slate-300'
                }`}>
                  <input
                    type="checkbox"
                    checked={evacPrefs.hasMobilityRequirements}
                    onChange={(e) => setEvacPrefs(prev => ({ ...prev, hasMobilityRequirements: e.target.checked }))}
                    className="sr-only"
                  />
                  <Accessibility className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="font-semibold text-xs">Wheelchair Access</span>
                </label>

                <label className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center space-x-2 ${
                  evacPrefs.hasPets ? 'bg-cyan-950/60 border-cyan-500 text-white' : 'bg-slate-800/60 border-slate-700 text-slate-300'
                }`}>
                  <input
                    type="checkbox"
                    checked={evacPrefs.hasPets}
                    onChange={(e) => setEvacPrefs(prev => ({ ...prev, hasPets: e.target.checked }))}
                    className="sr-only"
                  />
                  <PawPrint className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-semibold text-xs">With Pets / Animals</span>
                </label>
              </div>

              {(evacPrefs.hasPets || evacPrefs.hasMobilityRequirements) && (
                <div className="p-2.5 bg-blue-950/40 border border-blue-800/60 rounded-xl text-[11px] text-cyan-300 flex items-center space-x-2">
                  <Info className="w-4 h-4 shrink-0" />
                  <span>
                    Showing {filteredShelters.length} shelters matching your accessibility / pet criteria on the map and SOS directory.
                  </span>
                </div>
              )}
            </div>

            {/* Map & Route Quick View */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-7 h-[560px] rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
                <MapView
                  roads={roads}
                  nodes={nodes}
                  shelters={filteredShelters}
                  hospitals={hospitals}
                  emergencyFacilities={facilities}
                  waterways={waterways}
                  reports={reports}
                  activeRouteEdges={activeRouteEdges}
                  altRouteEdges={altRouteEdges}
                  startNode={activeCalculation?.originNode}
                  targetNode={activeCalculation?.targetNode}
                  selectedRoadId={selectedRoad?.id}
                  onSelectRoad={onSelectRoad}
                  onGpsDetected={handleMapGps}
                />
              </div>

              <div className="lg:col-span-5 space-y-4">
                <SafeRoutePlanner
                  nodes={nodes}
                  roads={roads}
                  lang={lang}
                  externalOriginId={externalOriginId}
                  externalDestId={externalDestId}
                  onRouteCalculated={onRouteCalculated}
                  onSubmitFeedback={onSubmitFeedback}
                />
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: MAP & SAFE ROUTES */}
        {activeNav === 'routes' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 h-[650px] rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
              <MapView
                roads={roads}
                nodes={nodes}
                shelters={filteredShelters}
                hospitals={hospitals}
                emergencyFacilities={facilities}
                waterways={waterways}
                reports={reports}
                activeRouteEdges={activeRouteEdges}
                altRouteEdges={altRouteEdges}
                startNode={activeCalculation?.originNode}
                targetNode={activeCalculation?.targetNode}
                selectedRoadId={selectedRoad?.id}
                onSelectRoad={onSelectRoad}
                onGpsDetected={handleMapGps}
              />
            </div>
            <div className="lg:col-span-5">
              <SafeRoutePlanner
                nodes={nodes}
                roads={roads}
                lang={lang}
                externalOriginId={externalOriginId}
                externalDestId={externalDestId}
                onRouteCalculated={onRouteCalculated}
                onSubmitFeedback={onSubmitFeedback}
              />
            </div>
          </div>
        )}

        {/* VIEW 3: COMMUNITY & POLLS */}
        {activeNav === 'community' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7">
              <CommunitySection
                reports={reports}
                polls={polls}
                roads={roads}
                routeFeedbacks={routeFeedbacks}
                lang={lang}
                onAddReport={onAddReport}
                onVotePoll={onVotePoll}
              />
            </div>
            <div className="lg:col-span-5 h-[560px] rounded-2xl overflow-hidden border border-slate-800 shadow-xl">
              <MapView
                roads={roads}
                nodes={nodes}
                shelters={filteredShelters}
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

        {/* VIEW 4: EMERGENCY SOS */}
        {activeNav === 'emergency' && (
          <EmergencyResources
            shelters={filteredShelters}
            hospitals={hospitals}
            emergencyFacilities={facilities}
            lang={lang}
          />
        )}

        {/* VIEW 5: MY REPORTS */}
        {activeNav === 'my-reports' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white">My Submitted Incident Reports</h3>
                <p className="text-xs text-slate-400">Track verification status and expert review notes for your submissions</p>
              </div>
              <button
                onClick={() => setActiveNav('community')}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-4 py-2 rounded-xl"
              >
                Submit New Incident
              </button>
            </div>

            {myReports.length === 0 ? (
              <div className="text-center py-12 text-slate-400 space-y-2">
                <FileText className="w-10 h-10 mx-auto text-slate-600" />
                <p className="text-xs">You have not submitted any flood reports yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myReports.map(rep => (
                  <div key={rep.id} className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white text-sm">{rep.locationName}</span>
                        <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded font-bold">{rep.severity}</span>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                        rep.verificationStatus === 'Verified' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                        (rep.verificationStatus === 'Rejected' ? 'bg-slate-700 text-slate-400' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30')
                      }`}>
                        {rep.verificationStatus}
                      </span>
                    </div>

                    <p className="text-slate-300">{rep.description}</p>
                    {rep.reviewNotes && (
                      <p className="text-[11px] text-cyan-300 bg-cyan-950/40 px-2.5 py-1 rounded border border-cyan-900/60">
                        Expert Note: {rep.reviewNotes}
                      </p>
                    )}

                    <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1 border-t border-slate-700/60">
                      <span>Submitted: {new Date(rep.timestamp).toLocaleString()}</span>
                      {rep.reviewedBy && (
                        <span className="text-cyan-300">Reviewed by: {rep.reviewedBy}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW 6: NOTIFICATIONS / ALERTS */}
        {activeNav === 'alerts' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <Bell className="w-5 h-5 text-cyan-400" />
                  <span>{t.notifications}</span>
                </h3>
                <p className="text-xs text-slate-400">Official road closures, reopenings, and report review updates</p>
              </div>
              <span className="text-xs bg-slate-800 text-cyan-300 px-3 py-1 rounded-full border border-slate-700">
                {unreadAlerts} Unread
              </span>
            </div>

            {notifications.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">No active alerts or notifications right now.</p>
            ) : (
              <div className="space-y-2.5">
                {notifications.map(n => (
                  <div
                    key={n.id}
                    className={`p-3.5 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                      n.severity === 'critical'
                        ? 'bg-red-950/30 border-red-800/70'
                        : n.severity === 'warning'
                        ? 'bg-amber-950/30 border-amber-800/70'
                        : 'bg-slate-800/60 border-slate-700'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white">{n.title}</span>
                        {!n.isRead && (
                          <span className="text-[10px] bg-cyan-500 text-slate-950 font-bold px-1.5 py-0.5 rounded">NEW</span>
                        )}
                      </div>
                      <p className="text-slate-300">{n.message}</p>
                      <span className="text-[10px] text-slate-500 block">{new Date(n.createdAt).toLocaleString()}</span>
                    </div>
                    {!n.isRead && (
                      <button
                        onClick={() => onMarkNotificationRead(n.id)}
                        className="text-[11px] bg-slate-800 hover:bg-slate-700 text-cyan-300 px-2.5 py-1 rounded-lg border border-slate-700 shrink-0 flex items-center space-x-1"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>Mark Read</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW 7: TRANSPARENT DATA SOURCES */}
        {activeNav === 'datasets' && (
          <DatasetExplorer rainfallFeed={rainfallFeed} />
        )}

        {/* VIEW 8: CITIZEN PROFILE */}
        {activeNav === 'profile' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-xl mx-auto shadow-2xl space-y-5">
            <h3 className="text-base font-bold text-white border-b border-slate-800 pb-3">Citizen Profile</h3>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between p-3 bg-slate-800/60 rounded-xl border border-slate-700">
                <span className="text-slate-400">Full Name:</span>
                <span className="font-bold text-white">{user.fullName}</span>
              </div>
              <div className="flex justify-between p-3 bg-slate-800/60 rounded-xl border border-slate-700">
                <span className="text-slate-400">Registered Email:</span>
                <span className="font-bold text-white">{user.email}</span>
              </div>
              <div className="flex justify-between p-3 bg-slate-800/60 rounded-xl border border-slate-700">
                <span className="text-slate-400">Phone:</span>
                <span className="font-bold text-white">{user.phone || 'Not provided'}</span>
              </div>
              <div className="flex justify-between p-3 bg-slate-800/60 rounded-xl border border-slate-700">
                <span className="text-slate-400">Role:</span>
                <span className="font-bold text-cyan-400">CITIZEN (Active)</span>
              </div>
            </div>

            <button
              onClick={onLogout}
              className="w-full bg-red-600/80 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition-colors"
            >
              Log Out of Citizen Account
            </button>
          </div>
        )}
      </main>
    </div>
  );
};
