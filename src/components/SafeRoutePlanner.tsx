import React, { useState } from 'react';
import { RoadNode, RoadSegment, RouteFeedback, Language } from '../types';
import { calculateDijkstraRoute, RouteCalculationResult } from '../utils/rules';
import { TRANSLATIONS } from '../utils/i18n';
import { speakText } from '../utils/speech';
import { 
  Navigation, 
  ShieldCheck, 
  AlertTriangle, 
  Clock, 
  MapPin, 
  Sliders, 
  Volume2, 
  CheckCircle, 
  ChevronRight, 
  ArrowRight,
  TrendingUp,
  RefreshCw
} from 'lucide-react';

interface SafeRoutePlannerProps {
  nodes: Record<string, RoadNode>;
  roads: RoadSegment[];
  lang: Language;
  onRouteCalculated: (result: { shortest: RouteCalculationResult; safest: RouteCalculationResult }) => void;
  onSubmitFeedback: (feedback: Partial<RouteFeedback>) => void;
}

export const SafeRoutePlanner: React.FC<SafeRoutePlannerProps> = ({
  nodes,
  roads,
  lang,
  onRouteCalculated,
  onSubmitFeedback
}) => {
  const t = TRANSLATIONS[lang];

  const nodeEntries = Object.values(nodes);

  const [originId, setOriginId] = useState<string>('N_SHIVAJINAGAR');
  const [destId, setDestId] = useState<string>('N_SINHAGAD_RD');
  const [lambdaRisk, setLambdaRisk] = useState<number>(1.8);

  const [activeCalculation, setActiveCalculation] = useState<{
    shortest: RouteCalculationResult;
    safest: RouteCalculationResult;
  } | null>(null);

  const [selectedRouteType, setSelectedRouteType] = useState<'safest' | 'shortest'>('safest');

  // Route feedback modal state
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [reachedSafely, setReachedSafely] = useState(true);
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [rating, setRating] = useState(5);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);

  const handleCalculate = () => {
    // Map current roads into GraphEdge format
    const graphEdges = roads.map(r => ({
      id: r.id,
      from: r.from,
      to: r.to,
      name: r.name,
      distanceKm: r.distanceKm,
      speedKmph: r.speedKmph,
      riskScore: r.riskScore,
      status: r.status,
      baseElevationM: r.baseElevationM
    }));

    const shortest = calculateDijkstraRoute(nodes, graphEdges, originId, destId, 'shortest', lambdaRisk);
    const safest = calculateDijkstraRoute(nodes, graphEdges, originId, destId, 'safest', lambdaRisk);

    const result = { shortest, safest };
    setActiveCalculation(result);
    onRouteCalculated(result);
  };

  const handleSpeakDirections = () => {
    if (!activeCalculation) return;
    const current = selectedRouteType === 'safest' ? activeCalculation.safest : activeCalculation.shortest;
    if (!current.feasible) {
      speakText('Warning: No feasible route found due to flood closures.', lang);
      return;
    }
    const turns = current.edges.map(e => `${e.name}, distance ${e.distanceKm} kilometers, risk score ${e.riskScore}`).join('. Then take ');
    const text = `Recommended ${selectedRouteType} route from ${nodes[originId].name} to ${nodes[destId].name}. Estimated travel time: ${current.travelTimeMins} minutes. ${turns}. Please maintain emergency vigilance.`;
    speakText(text, lang);
  };

  const submitFeedbackAction = (e: React.FormEvent) => {
    e.preventDefault();
    const route = activeCalculation ? (selectedRouteType === 'safest' ? activeCalculation.safest : activeCalculation.shortest) : null;
    onSubmitFeedback({
      routeName: route ? `${nodes[originId]?.name} to ${nodes[destId]?.name} (${selectedRouteType})` : 'Pune Route',
      reachedSafely,
      routeCondition: feedbackNotes || (reachedSafely ? 'Passed without issue' : 'Encountered high water or detour'),
      waterLevelCategory: reachedSafely ? 'None / Shallow Puddles' : 'Deep Waterlogging',
      travelTimeMins: route ? route.travelTimeMins : 15,
      rating
    });
    setFeedbackSuccess(true);
    setTimeout(() => {
      setFeedbackSuccess(false);
      setShowFeedbackModal(false);
      setFeedbackNotes('');
    }, 2000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl text-slate-100 space-y-5">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          <div className="p-2 bg-blue-600/20 text-cyan-400 rounded-xl border border-cyan-500/30">
            <Navigation className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-wide">{t.findSafeRoute}</h2>
            <p className="text-xs text-slate-400">Dijkstra graph optimization with flood risk penalties</p>
          </div>
        </div>
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center space-x-1">
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t.origin}</span>
          </label>
          <select
            value={originId}
            onChange={(e) => setOriginId(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            {nodeEntries.map(n => (
              <option key={n.id} value={n.id}>{n.name} ({n.elevationM}m)</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center space-x-1">
            <MapPin className="w-3.5 h-3.5 text-red-400" />
            <span>{t.destination}</span>
          </label>
          <select
            value={destId}
            onChange={(e) => setDestId(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            {nodeEntries.map(n => (
              <option key={n.id} value={n.id}>{n.name} ({n.elevationM}m)</option>
            ))}
          </select>
        </div>
      </div>

      {/* Flood Risk Avoidance Penalty Slider */}
      <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/80">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-semibold text-slate-300 flex items-center space-x-1.5">
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>{t.riskTolerance}: <strong className="text-cyan-300">{lambdaRisk.toFixed(1)}x</strong></span>
          </span>
          <span className="text-[11px] text-slate-400">
            {lambdaRisk > 2.5 ? 'Ultra-cautious (divert around any hazard)' : (lambdaRisk > 1.2 ? 'Balanced safety & time' : 'Minimal detour')}
          </span>
        </div>
        <input
          type="range"
          min="0.2"
          max="3.5"
          step="0.1"
          value={lambdaRisk}
          onChange={(e) => setLambdaRisk(parseFloat(e.target.value))}
          className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
        />
      </div>

      {/* Action Button */}
      <div className="flex items-center space-x-2">
        <button
          onClick={handleCalculate}
          className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold py-2.5 px-4 rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2 text-xs uppercase tracking-wider"
        >
          <RefreshCw className="w-4 h-4" />
          <span>{t.findSafeRoute}</span>
        </button>
      </div>

      {/* Calculation Results Card */}
      {activeCalculation && (
        <div className="space-y-4 pt-2 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">{t.routeComparison}</h3>
            <button
              onClick={handleSpeakDirections}
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 font-semibold"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>{t.voiceSpeakRoute}</span>
            </button>
          </div>

          {/* Route Comparison Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Safest Route Option */}
            <div
              onClick={() => setSelectedRouteType('safest')}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                selectedRouteType === 'safest'
                  ? 'bg-blue-950/60 border-cyan-500 shadow-md ring-1 ring-cyan-500'
                  : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-cyan-300 flex items-center space-x-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>{t.calcSafest} (Recommended)</span>
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  activeCalculation.safest.safetyRating === 'Safe' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {activeCalculation.safest.safetyRating}
                </span>
              </div>

              {activeCalculation.safest.feasible ? (
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                  <div>
                    <span className="text-slate-400 text-[10px]">Distance:</span>
                    <div className="font-bold text-white text-sm">{activeCalculation.safest.totalDistanceKm} km</div>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px]">Est. Time:</span>
                    <div className="font-bold text-white text-sm">{activeCalculation.safest.travelTimeMins} mins</div>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px]">Avg Risk:</span>
                    <div className="font-bold text-emerald-400">{activeCalculation.safest.averageRiskScore}/100</div>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px]">Peak Risk:</span>
                    <div className="font-bold text-amber-400">{activeCalculation.safest.maxRiskScore}/100</div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-red-400 flex items-center space-x-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{activeCalculation.safest.message}</span>
                </div>
              )}
            </div>

            {/* Fastest Route Option */}
            <div
              onClick={() => setSelectedRouteType('shortest')}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                selectedRouteType === 'shortest'
                  ? 'bg-blue-950/60 border-cyan-500 shadow-md ring-1 ring-cyan-500'
                  : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-300 flex items-center space-x-1">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span>{t.calcShortest}</span>
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  activeCalculation.shortest.safetyRating === 'Hazardous' ? 'bg-red-500/20 text-red-400' : 'bg-slate-700 text-slate-300'
                }`}>
                  {activeCalculation.shortest.safetyRating}
                </span>
              </div>

              {activeCalculation.shortest.feasible ? (
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                  <div>
                    <span className="text-slate-400 text-[10px]">Distance:</span>
                    <div className="font-bold text-white text-sm">{activeCalculation.shortest.totalDistanceKm} km</div>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px]">Est. Time:</span>
                    <div className="font-bold text-white text-sm">{activeCalculation.shortest.travelTimeMins} mins</div>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px]">Avg Risk:</span>
                    <div className="font-bold text-amber-400">{activeCalculation.shortest.averageRiskScore}/100</div>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px]">Peak Risk:</span>
                    <div className="font-bold text-red-400">{activeCalculation.shortest.maxRiskScore}/100</div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-red-400 flex items-center space-x-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Blocked</span>
                </div>
              )}
            </div>
          </div>

          {/* Turn by turn segments of selected route */}
          {((selectedRouteType === 'safest' ? activeCalculation.safest : activeCalculation.shortest).feasible) && (
            <div className="bg-slate-800/70 rounded-xl p-3 border border-slate-700/80 space-y-2">
              <span className="text-xs font-semibold text-slate-300 block">Turn-by-Turn Navigation Segments:</span>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {(selectedRouteType === 'safest' ? activeCalculation.safest : activeCalculation.shortest).edges.map((e, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                    <div className="flex items-center space-x-2 truncate">
                      <span className="w-5 h-5 rounded-full bg-slate-800 text-cyan-400 flex items-center justify-center font-bold text-[10px] shrink-0">
                        {idx + 1}
                      </span>
                      <span className="truncate text-slate-200 font-medium">{e.name}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-[11px] shrink-0 pl-2">
                      <span className="text-slate-400">{e.distanceKm} km</span>
                      <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                        e.riskScore > 60 ? 'bg-red-500/20 text-red-400' : (e.riskScore > 35 ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400')
                      }`}>
                        Risk {e.riskScore}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Feedback CTA */}
              <div className="pt-2 border-t border-slate-700 flex justify-between items-center">
                <span className="text-xs text-slate-400">{t.reachedSafelyQuestion}</span>
                <button
                  onClick={() => setShowFeedbackModal(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{t.submitFeedback}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Safety Notice */}
      <p className="text-[11px] text-slate-400 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 leading-relaxed">
        {t.safeNotice}
      </p>

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              <span>{t.submitFeedback}</span>
            </h3>

            {feedbackSuccess ? (
              <div className="p-4 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-semibold text-center">
                Thank you! Your feedback helps calibrate safety weights for Pune citizens.
              </div>
            ) : (
              <form onSubmit={submitFeedbackAction} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Did you arrive safely?</label>
                  <div className="flex space-x-4">
                    <label className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="radio"
                        checked={reachedSafely}
                        onChange={() => setReachedSafely(true)}
                        className="text-emerald-500"
                      />
                      <span className="text-slate-200">Yes, reached safely</span>
                    </label>
                    <label className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="radio"
                        checked={!reachedSafely}
                        onChange={() => setReachedSafely(false)}
                        className="text-red-500"
                      />
                      <span className="text-slate-200">Encountered waterlogging</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Observed Road Condition</label>
                  <textarea
                    rows={2}
                    value={feedbackNotes}
                    onChange={(e) => setFeedbackNotes(e.target.value)}
                    placeholder="E.g. Minor puddle near Nal Stop, but completely passable"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Route Safety Rating (1-5 Stars)</label>
                  <select
                    value={rating}
                    onChange={(e) => setRating(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200"
                  >
                    <option value={5}>⭐⭐⭐⭐⭐ (5 - Perfectly safe)</option>
                    <option value={4}>⭐⭐⭐⭐ (4 - Good, minor puddles)</option>
                    <option value={3}>⭐⭐⭐ (3 - Moderate water, proceed cautiously)</option>
                    <option value={2}>⭐⭐ (2 - High water, avoid small cars)</option>
                    <option value={1}>⭐ (1 - Dangerous, blocked)</option>
                  </select>
                </div>

                <div className="flex space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowFeedbackModal(false)}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-xl"
                  >
                    Submit Feedback
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
