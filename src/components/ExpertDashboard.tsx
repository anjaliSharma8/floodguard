import React, { useState } from 'react';
import { RoadSegment, Shelter, CommunityReport, RainfallObservation, Language } from '../types';
import { TRANSLATIONS } from '../utils/i18n';
import { 
  SlidersHorizontal, 
  ShieldAlert, 
  CheckCircle, 
  XCircle, 
  CloudRain, 
  Flame, 
  AlertOctagon, 
  Activity, 
  FileText, 
  Users, 
  BarChart2, 
  Send,
  Lock,
  Unlock
} from 'lucide-react';

interface ExpertDashboardProps {
  roads: RoadSegment[];
  shelters: Shelter[];
  reports: CommunityReport[];
  rainfall: RainfallObservation[];
  lang: Language;
  onUpdateRoadStatus: (roadId: string, status: RoadSegment['status'], riskScore?: number) => void;
  onVerifyReport: (reportId: string, status: CommunityReport['verificationStatus'], action?: string) => void;
  onSimulateRainfall: (rainfallMm: number) => void;
}

export const ExpertDashboard: React.FC<ExpertDashboardProps> = ({
  roads,
  shelters,
  reports,
  rainfall,
  lang,
  onUpdateRoadStatus,
  onVerifyReport,
  onSimulateRainfall
}) => {
  const t = TRANSLATIONS[lang];

  // Pre-flood simulation state
  const [simulatedRainfallMm, setSimulatedRainfallMm] = useState<number>(45);

  // Post-flood damage logs state
  const [damageLogs, setDamageLogs] = useState<{ id: string; location: string; type: string; status: string }[]>([
    { id: 'DMG_01', location: 'Anand Nagar Culvert Sinhagad Rd', type: 'Silt Blockage & Retaining Wall Breach', status: 'Crews Deployed' },
    { id: 'DMG_02', location: 'Bund Garden Riverside Railing', type: 'Submerged debris & bridge walkway damage', status: 'Inspection Queued' }
  ]);
  const [newDamageLocation, setNewDamageLocation] = useState('');
  const [newDamageType, setNewDamageType] = useState('');

  const activeReportsCount = reports.filter(r => r.verificationStatus !== 'Resolved').length;
  const blockedRoadsCount = roads.filter(r => r.status === 'blocked').length;
  const totalShelterCapacity = shelters.reduce((sum, s) => sum + s.capacity, 0);
  const totalShelterOccupancy = shelters.reduce((sum, s) => sum + s.currentOccupancy, 0);

  const handleApplySimulation = () => {
    onSimulateRainfall(simulatedRainfallMm);
  };

  const handleAddDamageLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDamageLocation) return;
    setDamageLogs(prev => [
      { id: `DMG_${Date.now()}`, location: newDamageLocation, type: newDamageType || 'Structural review', status: 'Pending Dispatch' },
      ...prev
    ]);
    setNewDamageLocation('');
    setNewDamageType('');
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl text-slate-100 space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-wide">{t.expertDashboardTitle}</h2>
            <p className="text-xs text-slate-400">Section 8 & 9 Official Monitoring, Incident Triage, What-If Simulators & Road Closures</p>
          </div>
        </div>
        <span className="text-[11px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-3 py-1 rounded-full font-bold self-start">
          PMC / PCMC Authority Auth: Verified
        </span>
      </div>

      {/* Authority KPI Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700">
          <span className="text-[11px] text-slate-400 font-semibold block">Active Citizen Reports</span>
          <div className="text-xl font-extrabold text-amber-400 mt-1 flex items-center justify-between">
            <span>{activeReportsCount}</span>
            <Activity className="w-4 h-4 text-amber-400 opacity-60" />
          </div>
          <span className="text-[10px] text-slate-500">{reports.filter(r => r.verificationStatus === 'Verified').length} Verified</span>
        </div>

        <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700">
          <span className="text-[11px] text-slate-400 font-semibold block">Officially Blocked Roads</span>
          <div className="text-xl font-extrabold text-red-400 mt-1 flex items-center justify-between">
            <span>{blockedRoadsCount}</span>
            <AlertOctagon className="w-4 h-4 text-red-400 opacity-60" />
          </div>
          <span className="text-[10px] text-slate-500">Excluded from routes</span>
        </div>

        <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700">
          <span className="text-[11px] text-slate-400 font-semibold block">Shelter Occupancy</span>
          <div className="text-xl font-extrabold text-cyan-400 mt-1 flex items-center justify-between">
            <span>{totalShelterOccupancy} / {totalShelterCapacity}</span>
            <Users className="w-4 h-4 text-cyan-400 opacity-60" />
          </div>
          <span className="text-[10px] text-slate-500">{Math.round((totalShelterOccupancy / totalShelterCapacity) * 100)}% utilization</span>
        </div>

        <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700">
          <span className="text-[11px] text-slate-400 font-semibold block">Peak Catchment Rain</span>
          <div className="text-xl font-extrabold text-blue-400 mt-1 flex items-center justify-between">
            <span>88.0 mm</span>
            <CloudRain className="w-4 h-4 text-blue-400 opacity-60" />
          </div>
          <span className="text-[10px] text-slate-500">Khadakwasla Dam Basin</span>
        </div>
      </div>

      {/* SECTION 9: PRE-FLOOD RAINFALL WHAT-IF SIMULATION */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950/60 border border-indigo-900/60 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CloudRain className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-200">{t.simRainfall}</h3>
          </div>
          <span className="text-[10px] bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded font-mono">
            Hypothetical Simulation Mode
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs text-slate-300">
            <span>Simulate Cloudburst Intensity: <strong className="text-cyan-300 text-sm">{simulatedRainfallMm} mm</strong></span>
            <span className="text-[11px] text-slate-400">
              {simulatedRainfallMm > 100 ? 'Extreme Red Alert Cloudburst' : (simulatedRainfallMm > 60 ? 'Heavy Inundation' : 'Standard Monsoon')}
            </span>
          </div>

          <input
            type="range"
            min="10"
            max="150"
            step="5"
            value={simulatedRainfallMm}
            onChange={(e) => setSimulatedRainfallMm(parseInt(e.target.value))}
            className="w-full accent-indigo-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <p className="text-[11px] text-slate-400 italic">
            Simulates dynamic runoff into Mutha riverbed and recalculates all road segment risk scores.
          </p>
          <button
            onClick={handleApplySimulation}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2 rounded-lg shadow transition-all"
          >
            {t.recalcNetwork}
          </button>
        </div>
      </div>

      {/* SECTION 8B: INCIDENT VERIFICATION DESK */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">{t.verifyReports}</h3>
          <span className="text-[11px] text-slate-400">Citizen submissions requiring emergency operator audit</span>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {reports.map(report => (
            <div
              key={report.id}
              className="bg-slate-800/70 border border-slate-700/80 rounded-xl p-3 text-xs flex flex-col md:flex-row md:items-center justify-between gap-3"
            >
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-white text-sm">{report.locationName}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    report.severity === 'Critical' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {report.severity}
                  </span>
                  <span className="text-[10px] text-slate-400">({report.reportType})</span>
                </div>
                <p className="text-slate-300 text-xs">{report.description}</p>
                <div className="text-[10px] text-slate-400">
                  Status: <strong className="text-cyan-300">{report.verificationStatus}</strong> • Submitted by {report.userId}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2 shrink-0">
                {report.verificationStatus !== 'Verified' && (
                  <button
                    onClick={() => onVerifyReport(report.id, 'Verified')}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-2.5 py-1.5 rounded-lg font-semibold flex items-center space-x-1"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Verify</span>
                  </button>
                )}

                {report.verificationStatus !== 'Rejected' && (
                  <button
                    onClick={() => onVerifyReport(report.id, 'Rejected')}
                    className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs px-2.5 py-1.5 rounded-lg flex items-center space-x-1"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                )}

                {report.verificationStatus !== 'Resolved' && (
                  <button
                    onClick={() => onVerifyReport(report.id, 'Resolved')}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-2.5 py-1.5 rounded-lg font-semibold"
                  >
                    Resolved
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 8C: ROAD STATUS & BLOCKAGE CONTROL */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">{t.roadManager}</h3>
          <span className="text-[11px] text-slate-400">Officially toggle road passage for citizen safety</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
          {roads.map(road => {
            const isBlocked = road.status === 'blocked';

            return (
              <div
                key={road.id}
                className={`p-3 rounded-xl border text-xs space-y-2 ${
                  isBlocked ? 'bg-red-950/40 border-red-700/80' : 'bg-slate-800/60 border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{road.name}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    isBlocked ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {road.status.toUpperCase()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Dist: {road.distanceKm}km • Elev: {road.baseElevationM}m</span>
                  <span>Flood Risk: <strong className="text-cyan-300">{road.riskScore}/100</strong></span>
                </div>

                <div className="flex space-x-2 pt-1">
                  {isBlocked ? (
                    <button
                      onClick={() => onUpdateRoadStatus(road.id, 'open', 35)}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      <span>{t.markOpen}</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => onUpdateRoadStatus(road.id, 'blocked', 100)}
                      className="flex-1 bg-red-600 hover:bg-red-500 text-white py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>{t.markBlocked}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 10: POST-FLOOD DAMAGE MANAGEMENT */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3">
        <div className="flex items-center space-x-2">
          <FileText className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">{t.postFloodTitle}</h3>
        </div>

        <form onSubmit={handleAddDamageLog} className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          <input
            type="text"
            required
            value={newDamageLocation}
            onChange={(e) => setNewDamageLocation(e.target.value)}
            placeholder="Affected road or bridge name..."
            className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100"
          />
          <input
            type="text"
            value={newDamageType}
            onChange={(e) => setNewDamageType(e.target.value)}
            placeholder="Damage details (e.g. wall breach, silt)..."
            className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100"
          />
          <button
            type="submit"
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 rounded-lg text-xs"
          >
            Log Damage & Dispatch Crews
          </button>
        </form>

        <div className="space-y-1.5 pt-2">
          {damageLogs.map(log => (
            <div key={log.id} className="flex items-center justify-between text-xs bg-slate-900/80 p-2 rounded-lg border border-slate-800">
              <div>
                <strong className="text-white">{log.location}</strong>: <span className="text-slate-300">{log.type}</span>
              </div>
              <span className="text-[10px] bg-blue-500/20 text-cyan-300 px-2 py-0.5 rounded font-semibold">
                {log.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
