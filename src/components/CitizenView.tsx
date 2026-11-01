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
  RainfallObservation,
  Language,
  EvacuationPreferences
} from '../types';
import { RouteCalculationResult } from '../utils/rules';
import { TRANSLATIONS } from '../utils/i18n';
import { MapView } from './MapView';
import { SafeRoutePlanner } from './SafeRoutePlanner';
import { CommunitySection } from './CommunitySection';
import { EmergencyResources } from './EmergencyResources';
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
  Clock,
  Compass,
  CheckCircle2,
  AlertTriangle,
  Info
} from 'lucide-react';

interface CitizenViewProps {
  user: User;
  token: string;
  onLogout: () => void;
  roads: RoadSegment[];
  nodes: Record<string, RoadNode>;
  shelters: Shelter[];
  hospitals: Hospital[];
  facilities: EmergencyFacility[];
  reports: CommunityReport[];
  polls: LivePoll[];
  routeFeedbacks: RouteFeedback[];
  rainfall: RainfallObservation[];
  lang: Language;
  setLang: (lang: Language) => void;
  isOffline: boolean;
  setIsOffline: (offline: boolean) => void;
  onOpenChat: () => void;
  onOpenOfflineGuide: () => void;
  onTriggerVoice: () => void;
  isVoiceListening: boolean;
  onAddReport: (report: Partial<CommunityReport>) => void;
  onVotePoll: (pollId: string, option: string) => void;
  onSubmitFeedback: (feedback: Partial<RouteFeedback>) => void;
  activeCalculation: { shortest: RouteCalculationResult; safest: RouteCalculationResult } | null;
  onRouteCalculated: (res: { shortest: RouteCalculationResult; safest: RouteCalculationResult }) => void;
  selectedRoad: RoadSegment | null;
  onSelectRoad: (road: RoadSegment) => void;
}

export const CitizenView: React.FC<CitizenViewProps> = ({
  user,
  token,
  onLogout,
  roads,
  nodes,
  shelters,
  hospitals,
  facilities,
  reports,
  polls,
  routeFeedbacks,
  rainfall,
  lang,
  setLang,
  isOffline,
  setIsOffline,
  onOpenChat,
  onOpenOfflineGuide,
  onTriggerVoice,
  isVoiceListening,
  onAddReport,
  onVotePoll,
  onSubmitFeedback,
  activeCalculation,
  onRouteCalculated,
  selectedRoad,
  onSelectRoad
}) => {
  const t = TRANSLATIONS[lang];
  const [activeNav, setActiveNav] = useState<'dashboard' | 'routes' | 'community' | 'emergency' | 'my-reports' | 'profile'>('dashboard');

  // Personal Evacuation Assistant Preferences (Section 6.G)
  const [evacPrefs, setEvacPrefs] = useState<EvacuationPreferences>({
    hasChildren: false,
    hasElderly: false,
    hasMobilityRequirements: false,
    hasPets: false
  });

  // Filter shelters based on citizen's evacuation preferences
  const filteredShelters = shelters.filter(s => {
    if (evacPrefs.hasPets && !s.petFriendly) return false;
    if (evacPrefs.hasMobilityRequirements && !s.wheelchairAccessible) return false;
    return true;
  });

  // My Reports submitted by this citizen
  const myReports = reports.filter(r => r.userId === user.id || r.userName === user.fullName);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Citizen Alert Ticker */}
      <div className="bg-amber-600 text-slate-950 px-4 py-1.5 text-xs font-semibold flex items-center justify-between overflow-hidden">
        <div className="flex items-center space-x-2 truncate">
          <span className="bg-red-700 text-white px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold animate-pulse">
            LIVE CITIZEN ADVISORY
          </span>
          <span className="truncate">{t.weatherAlert}</span>
        </div>
        <div className="hidden md:flex items-center space-x-3 text-xs pl-4 shrink-0">
          <span>Mutha River Discharge: High</span>
          <span>•</span>
          <span>Khadakwasla Dam: 18,400 cfs</span>
        </div>
      </div>

      {/* Citizen Header / Navigation */}
      <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveNav('dashboard')}>
              <div className="p-2 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-xl shadow-md flex items-center justify-center">
                <ShieldAlert className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-extrabold text-xl text-white tracking-tight">FloodGuard</span>
                  <span className="text-[10px] bg-blue-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full font-mono font-bold">
                    Citizen Mode
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 hidden sm:block">Pune & PCMC Emergency Navigation</p>
              </div>
            </div>

            {/* Strict Citizen Navigation: Zero Authority Controls (Section 6) */}
            <nav className="hidden lg:flex items-center space-x-1" aria-label="Citizen Navigation">
              <button
                onClick={() => setActiveNav('dashboard')}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
                  activeNav === 'dashboard' ? 'bg-blue-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Compass className="w-4 h-4" />
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => setActiveNav('routes')}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
                  activeNav === 'routes' ? 'bg-blue-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <MapPin className="w-4 h-4" />
                <span>Map & Safe Routes</span>
              </button>

              <button
                onClick={() => setActiveNav('community')}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
                  activeNav === 'community' ? 'bg-blue-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Community & Polls</span>
              </button>

              <button
                onClick={() => setActiveNav('emergency')}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
                  activeNav === 'emergency' ? 'bg-red-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <PhoneCall className="w-4 h-4" />
                <span>Emergency SOS</span>
              </button>

              <button
                onClick={() => setActiveNav('my-reports')}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
                  activeNav === 'my-reports' ? 'bg-blue-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>My Reports ({myReports.length})</span>
              </button>
            </nav>

            {/* Right Controls: Voice, Language, Offline, AI Guard, Profile */}
            <div className="flex items-center space-x-2">
              {/* Voice button */}
              <button
                onClick={onTriggerVoice}
                title={t.voiceAssistant}
                className={`p-2 rounded-lg border transition-all flex items-center space-x-1 text-xs font-semibold ${
                  isVoiceListening
                    ? 'bg-red-600 border-red-500 text-white animate-pulse'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-cyan-400'
                }`}
              >
                <Mic className="w-4 h-4" />
                <span className="hidden sm:inline">{isVoiceListening ? 'Listening...' : 'Voice'}</span>
              </button>

              {/* Language Switcher */}
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as Language)}
                aria-label="Select language"
                className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none"
              >
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
                <option value="mr">मराठी</option>
              </select>

              {/* Offline indicator */}
              <button
                onClick={() => {
                  const next = !isOffline;
                  setIsOffline(next);
                  if (next) onOpenOfflineGuide();
                }}
                title={isOffline ? 'Offline Mode Active' : 'Online Connection Active'}
                className={`p-2 rounded-lg border transition-colors ${
                  isOffline 
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' 
                    : 'bg-slate-800 text-emerald-400 border-slate-700 hover:bg-slate-700'
                }`}
              >
                {isOffline ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
              </button>

              {/* AI Guard Chatbot */}
              <button
                onClick={onOpenChat}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold px-3 py-2 rounded-lg shadow flex items-center space-x-1.5"
              >
                <Bot className="w-4 h-4 text-cyan-300" />
                <span className="hidden sm:inline">AI Guard</span>
              </button>

              {/* User Profile / Logout */}
              <div className="flex items-center pl-2 space-x-2 border-l border-slate-800">
                <button
                  onClick={() => setActiveNav('profile')}
                  className="flex items-center space-x-1.5 text-xs text-slate-300 hover:text-white"
                  title="Citizen Profile"
                >
                  <span className="w-7 h-7 rounded-full bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 flex items-center justify-center font-bold text-xs">
                    {user.fullName.charAt(0)}
                  </span>
                  <span className="hidden xl:inline font-medium truncate max-w-[100px]">{user.fullName.split(' ')[0]}</span>
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
          <div className="flex lg:hidden overflow-x-auto py-2 space-x-1 border-t border-slate-800 text-xs">
            <button
              onClick={() => setActiveNav('dashboard')}
              className={`px-3 py-1 rounded-lg whitespace-nowrap font-medium ${activeNav === 'dashboard' ? 'bg-blue-600 text-white' : 'text-slate-300'}`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveNav('routes')}
              className={`px-3 py-1 rounded-lg whitespace-nowrap font-medium ${activeNav === 'routes' ? 'bg-blue-600 text-white' : 'text-slate-300'}`}
            >
              Map & Routes
            </button>
            <button
              onClick={() => setActiveNav('community')}
              className={`px-3 py-1 rounded-lg whitespace-nowrap font-medium ${activeNav === 'community' ? 'bg-blue-600 text-white' : 'text-slate-300'}`}
            >
              Community & Polls
            </button>
            <button
              onClick={() => setActiveNav('emergency')}
              className={`px-3 py-1 rounded-lg whitespace-nowrap font-medium ${activeNav === 'emergency' ? 'bg-red-600 text-white' : 'text-slate-300'}`}
            >
              Emergency SOS
            </button>
            <button
              onClick={() => setActiveNav('my-reports')}
              className={`px-3 py-1 rounded-lg whitespace-nowrap font-medium ${activeNav === 'my-reports' ? 'bg-blue-600 text-white' : 'text-slate-300'}`}
            >
              My Reports ({myReports.length})
            </button>
          </div>
        </div>
      </header>

      {/* Main Citizen Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* VIEW 1: CITIZEN DASHBOARD (Section 6.A) */}
        {activeNav === 'dashboard' && (
          <div className="space-y-6">
            {/* Quick Status Bar */}
            <div className="bg-gradient-to-r from-blue-950/60 to-slate-900 border border-blue-900/60 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Personal Flood Safety Desk</span>
                <h2 className="text-xl font-black text-white mt-0.5">Welcome, {user.fullName}</h2>
                <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                  Monitoring Pune & Pimpri-Chinchwad municipal rivers. Current rainfall status across IMD stations indicates elevated runoff in Mutha riverbank zones.
                </p>
              </div>

              <div className="flex items-center space-x-3 shrink-0 text-xs">
                <div className="bg-slate-900/80 px-3 py-2 rounded-xl border border-slate-800">
                  <span className="text-slate-400 text-[10px] block">Data Freshness</span>
                  <span className="font-bold text-emerald-400 flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                    <span>Live Telemetry</span>
                  </span>
                </div>
                <div className="bg-slate-900/80 px-3 py-2 rounded-xl border border-slate-800">
                  <span className="text-slate-400 text-[10px] block">Verified Hazards</span>
                  <span className="font-bold text-red-400">{reports.filter(r => r.verificationStatus === 'Verified').length} Active Hazards</span>
                </div>
              </div>
            </div>

            {/* Personal Evacuation Assistant (Section 6.G) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <HeartHandshake className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-sm font-bold text-white">Personal Evacuation Assistant</h3>
                </div>
                <span className="text-[11px] text-slate-400">Customizes shelter & route recommendations</span>
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
                    Matching shelters updated: {filteredShelters.length} suitable facilities identified in Pune with verified accommodations.
                  </span>
                </div>
              )}
            </div>

            {/* Map & Route Quick View */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-7 h-[550px] rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
                <MapView
                  roads={roads}
                  nodes={nodes}
                  shelters={filteredShelters}
                  hospitals={hospitals}
                  emergencyFacilities={facilities}
                  reports={reports}
                  activeRouteEdges={activeCalculation?.safest.edges
                    .map(edge => roads.find(r => r.id === edge.id))
                    .filter((r): r is RoadSegment => Boolean(r))}
                  selectedRoadId={selectedRoad?.id}
                  onSelectRoad={onSelectRoad}
                />
              </div>

              <div className="lg:col-span-5 space-y-4">
                <SafeRoutePlanner
                  nodes={nodes}
                  roads={roads}
                  lang={lang}
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
                reports={reports}
                activeRouteEdges={activeCalculation?.safest.edges
                  .map(edge => roads.find(r => r.id === edge.id))
                  .filter((r): r is RoadSegment => Boolean(r))}
                selectedRoadId={selectedRoad?.id}
                onSelectRoad={onSelectRoad}
              />
            </div>
            <div className="lg:col-span-5">
              <SafeRoutePlanner
                nodes={nodes}
                roads={roads}
                lang={lang}
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
                routeFeedbacks={routeFeedbacks}
                lang={lang}
                onAddReport={onAddReport}
                onVotePoll={onVotePoll}
              />
            </div>
            <div className="lg:col-span-5 h-[550px] rounded-2xl overflow-hidden border border-slate-800 shadow-xl">
              <MapView
                roads={roads}
                nodes={nodes}
                shelters={filteredShelters}
                hospitals={hospitals}
                emergencyFacilities={facilities}
                reports={reports}
              />
            </div>
          </div>
        )}

        {/* VIEW 4: EMERGENCY SOS & ANIMAL RESCUE */}
        {activeNav === 'emergency' && (
          <EmergencyResources
            shelters={filteredShelters}
            hospitals={hospitals}
            emergencyFacilities={facilities}
            lang={lang}
          />
        )}

        {/* VIEW 5: MY REPORTS (Section 6.E) */}
        {activeNav === 'my-reports' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white">My Submitted Incident Reports</h3>
                <p className="text-xs text-slate-400">Track official verification status and authority action for your submissions</p>
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

                    <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1 border-t border-slate-700/60">
                      <span>Submitted: {new Date(rep.timestamp).toLocaleString()}</span>
                      {rep.reviewedBy && (
                        <span className="text-cyan-300">Audited by: {rep.reviewedBy}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW 6: CITIZEN PROFILE */}
        {activeNav === 'profile' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-xl mx-auto shadow-2xl space-y-5">
            <h3 className="text-base font-bold text-white border-b border-slate-800 pb-3">Citizen Profile Information</h3>

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
                <span className="text-slate-400">Account Role:</span>
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
