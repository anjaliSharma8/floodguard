import React, { useState } from 'react';
import { CommunityReport, LivePoll, RouteFeedback, Language } from '../types';
import { calculatePollBreakdown } from '../utils/rules';
import { TRANSLATIONS } from '../utils/i18n';
import { 
  Users, 
  AlertTriangle, 
  Vote, 
  PlusCircle, 
  CheckCircle2, 
  Clock, 
  Filter, 
  Camera, 
  ThumbsUp, 
  MapPin, 
  Sparkles,
  BarChart3
} from 'lucide-react';

interface CommunitySectionProps {
  reports: CommunityReport[];
  polls: LivePoll[];
  routeFeedbacks: RouteFeedback[];
  lang: Language;
  onAddReport: (report: Partial<CommunityReport>) => void;
  onVotePoll: (pollId: string, option: string) => void;
}

export const CommunitySection: React.FC<CommunitySectionProps> = ({
  reports,
  polls,
  routeFeedbacks,
  lang,
  onAddReport,
  onVotePoll
}) => {
  const t = TRANSLATIONS[lang];

  // Reporting Form Modal State
  const [showModal, setShowModal] = useState(false);
  const [reportType, setReportType] = useState<CommunityReport['reportType']>('Waterlogging');
  const [locationName, setLocationName] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<CommunityReport['severity']>('Moderate');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Community Feed Filters
  const [selectedFilter, setSelectedFilter] = useState<'All' | 'Verified' | 'Critical' | 'Blocked'>('All');
  const [activeTab, setActiveTab] = useState<'reports' | 'polls' | 'feedback'>('reports');

  const filteredReports = reports.filter(r => {
    if (selectedFilter === 'Verified') return r.verificationStatus === 'Verified';
    if (selectedFilter === 'Critical') return r.severity === 'Critical';
    if (selectedFilter === 'Blocked') return r.reportType === 'Road blocked';
    return true;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationName.trim()) return;

    setIsSubmitting(true);
    // Rough coordinates around Pune center
    const lat = 18.5204 + (Math.random() - 0.5) * 0.06;
    const lng = 73.8567 + (Math.random() - 0.5) * 0.06;

    onAddReport({
      locationName: locationName.trim(),
      reportType,
      severity,
      description: description.trim() || 'Citizen reported water hazard',
      lat,
      lng
    });

    setIsSubmitting(false);
    setSubmitSuccess(true);
    setTimeout(() => {
      setSubmitSuccess(false);
      setShowModal(false);
      setLocationName('');
      setDescription('');
    }, 1500);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl text-slate-100 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-blue-600/20 text-cyan-400 rounded-xl border border-cyan-500/30">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-wide">{t.communityReports}</h2>
            <p className="text-xs text-slate-400">Crowdsourced flood telemetry, live news polls & trip feedback</p>
          </div>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center justify-center space-x-1.5 shadow-lg transition-all"
        >
          <PlusCircle className="w-4 h-4" />
          <span>{t.reportIncident}</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('reports')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 ${
            activeTab === 'reports' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Citizen Feed ({reports.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('polls')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 ${
            activeTab === 'polls' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>{t.activePolls} ({polls.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('feedback')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 ${
            activeTab === 'feedback' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          <ThumbsUp className="w-3.5 h-3.5" />
          <span>Trip Feedback ({routeFeedbacks.length})</span>
        </button>
      </div>

      {/* TAB 1: Citizen Feed */}
      {activeTab === 'reports' && (
        <div className="space-y-3">
          {/* Filter Pills */}
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-slate-400 flex items-center space-x-1 text-[11px]">
              <Filter className="w-3 h-3" />
              <span>Filter:</span>
            </span>
            {(['All', 'Verified', 'Critical', 'Blocked'] as const).map(filter => (
              <button
                key={filter}
                onClick={() => setSelectedFilter(filter)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
                  selectedFilter === filter
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {/* Feed List */}
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {filteredReports.map(report => (
              <div
                key={report.id}
                className="bg-slate-800/60 hover:bg-slate-800 border border-slate-700/80 rounded-xl p-3 text-xs transition-all space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-white text-sm">{report.locationName}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      report.severity === 'Critical' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                      (report.severity === 'High' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30')
                    }`}>
                      {report.severity}
                    </span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                    report.verificationStatus === 'Verified' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-300'
                  }`}>
                    {report.verificationStatus}
                  </span>
                </div>

                <p className="text-slate-300 leading-relaxed text-xs">{report.description}</p>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-700/60">
                  <span className="flex items-center space-x-1">
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    <span>{report.reportType}</span>
                  </span>
                  <span>
                    Confidence: <strong className="text-cyan-300">{Math.round(report.confidenceScore * 100)}%</strong> • {new Date(report.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: Live Public Polls */}
      {activeTab === 'polls' && (
        <div className="space-y-4">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Real-time community consensus mechanism (duplicate vote protected)</span>
            <span className="text-cyan-400 font-mono">Live Sync</span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {polls.map(poll => {
              const breakdown = calculatePollBreakdown(poll.votes);

              return (
                <div key={poll.id} className="bg-slate-800/70 border border-slate-700 rounded-xl p-4 text-xs space-y-3 shadow">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-white text-sm">{poll.question}</h3>
                    <span className="text-[11px] bg-blue-500/20 text-cyan-300 px-2 py-0.5 rounded-full font-bold">
                      {poll.totalVotes} Votes
                    </span>
                  </div>

                  {/* Poll Options with Voting & Animated Progress Bars */}
                  <div className="space-y-2">
                    {breakdown.map(({ option, count, percentage }) => {
                      let barColor = 'bg-emerald-500';
                      if (option.includes('Heavy') || option.includes('blocked')) barColor = 'bg-red-500';
                      else if (option.includes('Minor')) barColor = 'bg-amber-500';

                      return (
                        <div key={option} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <button
                              onClick={() => onVotePoll(poll.id, option)}
                              className="text-slate-200 hover:text-cyan-300 font-medium text-left truncate flex items-center space-x-1.5"
                            >
                              <Vote className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                              <span className="truncate">{option}</span>
                            </button>
                            <span className="font-mono text-slate-300 shrink-0 pl-2">
                              {percentage}% ({count})
                            </span>
                          </div>
                          {/* Progress bar track */}
                          <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${barColor} transition-all duration-500`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: Safe Route Feedback */}
      {activeTab === 'feedback' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            Citizens who completed journeys report actual road passability to calibrate graph costs:
          </p>

          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {routeFeedbacks.map(fb => (
              <div key={fb.id} className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{fb.routeName}</span>
                  <span className="text-amber-400 font-bold">{'★'.repeat(fb.rating)}</span>
                </div>
                <div className="flex items-center space-x-2 text-[11px]">
                  <span className={`px-2 py-0.5 rounded font-semibold ${
                    fb.reachedSafely ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {fb.reachedSafely ? '✅ Reached Safely' : '⚠️ Encountered Hazard'}
                  </span>
                  <span className="text-slate-400">• Water Level: {fb.waterLevelCategory}</span>
                  <span className="text-slate-400">• Time: {fb.travelTimeMins}m</span>
                </div>
                <p className="text-slate-300 text-xs italic">"{fb.routeCondition}"</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Report Submission Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <span>{t.reportIncident}</span>
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            {submitSuccess ? (
              <div className="p-4 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-semibold text-center">
                Report submitted successfully! It is queued for authority review and citizen confirmation.
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{t.locationName}</label>
                  <input
                    type="text"
                    required
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    placeholder="E.g., Sinhagad Road near Anand Nagar Bridge"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">{t.reportType}</label>
                    <select
                      value={reportType}
                      onChange={(e) => setReportType(e.target.value as any)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                    >
                      <option value="Waterlogging">Waterlogging</option>
                      <option value="Road flooded">Road flooded</option>
                      <option value="Road blocked">Road blocked</option>
                      <option value="Heavy rainfall">Heavy rainfall</option>
                      <option value="Drainage overflow">Drainage overflow</option>
                      <option value="Fallen tree">Fallen tree</option>
                      <option value="Rescue required">Rescue required</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">{t.severity}</label>
                    <select
                      value={severity}
                      onChange={(e) => setSeverity(e.target.value as any)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                    >
                      <option value="Low">Low (Passable)</option>
                      <option value="Moderate">Moderate (Slow)</option>
                      <option value="High">High (Submerged curbs)</option>
                      <option value="Critical">Critical (Impassable / Risk)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{t.description}</label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Provide depth, moving water speed, landmarks or trapped vehicle details..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                {/* Simulated photo upload note */}
                <div className="p-2.5 bg-slate-800/60 rounded-xl border border-dashed border-slate-700 flex items-center space-x-2 text-slate-400">
                  <Camera className="w-4 h-4 text-cyan-400" />
                  <span className="text-[11px]">Geo-tagged photos attached automatically from phone sensors</span>
                </div>

                <div className="flex space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-xl font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white py-2.5 rounded-xl font-bold shadow-lg"
                  >
                    {isSubmitting ? 'Uploading...' : t.submitReport}
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
