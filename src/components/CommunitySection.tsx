import React, { useState } from 'react';
import { CommunityReport, LivePoll, RoadSegment, RouteFeedback, Language } from '../types';
import { calculatePollBreakdown } from '../utils/rules';
import { TRANSLATIONS } from '../utils/i18n';
import {
  Users,
  AlertTriangle,
  Vote,
  PlusCircle,
  Filter,
  Camera,
  ThumbsUp,
  BarChart3,
  LocateFixed,
  CheckCircle2,
  X
} from 'lucide-react';

interface CommunitySectionProps {
  reports: CommunityReport[];
  polls: LivePoll[];
  roads?: RoadSegment[];
  routeFeedbacks: RouteFeedback[];
  lang: Language;
  onAddReport: (report: Partial<CommunityReport>) => Promise<{ ok: boolean; error?: string; queued?: boolean }> | void;
  onVotePoll: (pollId: string, option: string) => Promise<{ ok: boolean; error?: string }> | void;
}

const MAX_PHOTO_BYTES = 2.5 * 1024 * 1024;
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'];

export const CommunitySection: React.FC<CommunitySectionProps> = ({
  reports,
  polls,
  roads = [],
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
  const [selectedRoadId, setSelectedRoadId] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<CommunityReport['severity']>('Moderate');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(undefined);
  const [photoName, setPhotoName] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitQueued, setSubmitQueued] = useState(false);

  // Poll feedback notice
  const [pollNotice, setPollNotice] = useState<{ type: 'error' | 'info'; message: string } | null>(null);

  // Community Feed Filters
  const [selectedFilter, setSelectedFilter] = useState<'All' | 'Verified' | 'Critical' | 'Blocked'>('All');
  const [activeTab, setActiveTab] = useState<'reports' | 'polls' | 'feedback'>('reports');

  const filteredReports = reports.filter(r => {
    if (selectedFilter === 'Verified') return r.verificationStatus === 'Verified';
    if (selectedFilter === 'Critical') return r.severity === 'Critical';
    if (selectedFilter === 'Blocked') return r.reportType === 'Road blocked';
    return true;
  });

  const handleUseGps = () => {
    setFormError(null);
    if (!navigator.geolocation) {
      setFormError('Geolocation is unavailable on this browser. Select a corridor or enter landmark.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setCoords({
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5))
        });
      },
      err => {
        setFormError(`Could not capture GPS location (${err.message}).`);
      },
      { timeout: 6000 }
    );
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setPhotoDataUrl(undefined);
      setPhotoName('');
      return;
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      setFormError('Only PNG, JPEG, or WEBP photos are supported.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setFormError('Photo size must be 2.5 MB or smaller.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhotoDataUrl(reader.result);
        setPhotoName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!locationName.trim()) {
      setFormError('Please specify a landmark or street location.');
      return;
    }

    const matchedRoad = roads.find(r => r.id === selectedRoadId);
    const midpoint =
      matchedRoad && matchedRoad.coordinates.length > 0
        ? matchedRoad.coordinates[Math.floor(matchedRoad.coordinates.length / 2)]
        : null;

    const reportCoordinates = coords
      ? { lat: coords.lat, lng: coords.lng }
      : midpoint
      ? { lat: midpoint[0], lng: midpoint[1] }
      : null;
    if (!reportCoordinates) {
      setFormError('Capture your location with GPS or select a mapped road before submitting.');
      return;
    }

    setIsSubmitting(true);
    const { lat, lng } = reportCoordinates;

    try {
      const res = await onAddReport({
        roadId: selectedRoadId || undefined,
        locationName: locationName.trim(),
        reportType,
        severity,
        description: description.trim() || 'Citizen reported water hazard',
        lat,
        lng,
        imageUrl: photoDataUrl
      });

      if (res && !res.ok) {
        setFormError(res.error || 'Could not submit report.');
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      setSubmitSuccess(true);
      setSubmitQueued(Boolean(res?.queued));
      if (!res?.queued) {
        setTimeout(() => {
          setSubmitSuccess(false);
          setShowModal(false);
          setLocationName('');
          setSelectedRoadId('');
          setCoords(null);
          setDescription('');
          setPhotoDataUrl(undefined);
          setPhotoName('');
        }, 1400);
      }
    } catch {
      setFormError('Network error while submitting report.');
      setIsSubmitting(false);
    }
  };

  const handleCastVote = async (pollId: string, option: string) => {
    setPollNotice(null);
    const res = await onVotePoll(pollId, option);
    if (res && !res.ok) {
      setPollNotice({ type: 'error', message: res.error || 'Unable to register vote.' });
    } else {
      setPollNotice({ type: 'info', message: `Recorded vote: "${option}"` });
    }
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
            <p className="text-xs text-slate-400">Citizen hazard reports (pending expert review), live road polls & trip feedback</p>
          </div>
        </div>

        <button
          onClick={() => {
            setFormError(null);
            setShowModal(true);
          }}
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
          <div className="flex flex-wrap items-center gap-2 text-xs">
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
            {filteredReports.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-800/40 rounded-xl border border-slate-800">
                No reports match this filter.
              </div>
            ) : (
              filteredReports.map(report => (
                <div
                  key={report.id}
                  className="bg-slate-800/60 hover:bg-slate-800 border border-slate-700/80 rounded-xl p-3 text-xs transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-2 min-w-0">
                      <span className="font-bold text-white text-sm truncate">{report.locationName}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                        report.severity === 'Critical' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                        (report.severity === 'High' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30')
                      }`}>
                        {report.severity}
                      </span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-semibold shrink-0 ${
                      report.verificationStatus === 'Verified' ? 'bg-emerald-500/20 text-emerald-400' :
                      report.verificationStatus === 'Rejected' ? 'bg-red-500/15 text-red-300' :
                      'bg-slate-700 text-slate-300'
                    }`}>
                      {report.verificationStatus}
                    </span>
                  </div>

                  <p className="text-slate-300 leading-relaxed text-xs">{report.description}</p>

                  {report.imageUrl && (
                    <img
                      src={report.imageUrl}
                      alt={`Hazard photo at ${report.locationName}`}
                      className="w-full max-h-36 object-cover rounded-lg border border-slate-700 mt-1"
                    />
                  )}

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
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Live Public Polls */}
      {activeTab === 'polls' && (
        <div className="space-y-4">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Community consensus poll (one verified vote per account)</span>
            <span className="text-cyan-400 font-mono">SQLite Persisted</span>
          </div>

          {pollNotice && (
            <div className={`p-2.5 rounded-xl text-xs border ${
              pollNotice.type === 'error'
                ? 'bg-red-950/60 border-red-800 text-red-300'
                : 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
            }`}>
              {pollNotice.message}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            {polls.map(poll => {
              const breakdown = calculatePollBreakdown(poll.votes);
              const alreadyVoted = Boolean(poll.userVotedOption);

              return (
                <div key={poll.id} className="bg-slate-800/70 border border-slate-700 rounded-xl p-4 text-xs space-y-3 shadow">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-white text-sm">{poll.question}</h3>
                    <span className="text-[11px] bg-blue-500/20 text-cyan-300 px-2 py-0.5 rounded-full font-bold shrink-0">
                      {poll.totalVotes} Votes
                    </span>
                  </div>

                  {alreadyVoted && (
                    <div className="text-[11px] text-emerald-400 flex items-center space-x-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Your vote recorded: <strong>{poll.userVotedOption}</strong></span>
                    </div>
                  )}

                  {/* Poll Options with Voting & Progress Bars */}
                  <div className="space-y-2">
                    {breakdown.map(({ option, count, percentage }) => {
                      let barColor = 'bg-emerald-500';
                      if (option.includes('Heavy') || option.includes('blocked')) barColor = 'bg-red-500';
                      else if (option.includes('Minor') || option.includes('Slow')) barColor = 'bg-amber-500';
                      const isUserChoice = poll.userVotedOption === option;

                      return (
                        <div key={option} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <button
                              type="button"
                              onClick={() => handleCastVote(poll.id, option)}
                              disabled={alreadyVoted}
                              className={`font-medium text-left truncate flex items-center space-x-1.5 transition-colors ${
                                isUserChoice
                                  ? 'text-emerald-300 font-bold'
                                  : alreadyVoted
                                  ? 'text-slate-400 cursor-default'
                                  : 'text-slate-200 hover:text-cyan-300 cursor-pointer'
                              }`}
                            >
                              <Vote className={`w-3.5 h-3.5 shrink-0 ${isUserChoice ? 'text-emerald-400' : 'text-cyan-400'}`} />
                              <span className="truncate">{option}</span>
                            </button>
                            <span className="font-mono text-slate-300 shrink-0 pl-2">
                              {percentage}% ({count})
                            </span>
                          </div>
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
            Citizens who completed journeys report actual road passability:
          </p>

          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {routeFeedbacks.map(fb => (
              <div key={fb.id} className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{fb.routeName}</span>
                  <span className="text-amber-400 font-bold">{'★'.repeat(fb.rating)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className={`px-2 py-0.5 rounded font-semibold ${
                    fb.reachedSafely ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {fb.reachedSafely ? 'Reached Safely' : 'Encountered Hazard'}
                  </span>
                  <span className="text-slate-400">• Water: {fb.waterLevelCategory}</span>
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
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <span>{t.reportIncident}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white p-1"
                aria-label="Close report modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {submitSuccess ? (
              <div className={`p-4 rounded-xl text-xs font-semibold text-center ${
                submitQueued
                  ? 'bg-amber-500/15 border border-amber-500/40 text-amber-200'
                  : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
              }`}>
                {submitQueued
                  ? 'Report encrypted and saved on this device only. It has NOT been submitted or reviewed; it will be retried when you reconnect and sign in as the same user.'
                  : 'Report persisted! The linked road is flagged for caution while awaiting Expert verification.'}
                {submitQueued && (
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitSuccess(false);
                      setSubmitQueued(false);
                      setShowModal(false);
                      setLocationName('');
                      setSelectedRoadId('');
                      setCoords(null);
                      setDescription('');
                      setPhotoDataUrl(undefined);
                      setPhotoName('');
                    }}
                    className="mt-3 block min-h-10 w-full rounded-lg border border-amber-400/40 px-3 py-2 text-white hover:bg-amber-500/15"
                  >
                    Close
                  </button>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3 text-xs">
                {formError && (
                  <div className="p-2.5 bg-red-950/60 border border-red-800 rounded-xl text-red-300">
                    {formError}
                  </div>
                )}

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{t.locationName}</label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      required
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                      placeholder="E.g., Sinhagad Road near Anand Nagar Bridge"
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={handleUseGps}
                      title="Capture GPS coordinates"
                      className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-cyan-400 shrink-0"
                    >
                      <LocateFixed className="w-4 h-4" />
                    </button>
                  </div>
                  {coords && (
                    <span className="text-[10px] text-emerald-400 mt-1 block">
                      GPS captured: {coords.lat}, {coords.lng}
                    </span>
                  )}
                </div>

                {roads.length > 0 && (
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Affected Road Corridor (Optional)</label>
                    <select
                      value={selectedRoadId}
                      onChange={(e) => setSelectedRoadId(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                    >
                      <option value="">Auto-snap from coordinates</option>
                      {roads.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">{t.reportType}</label>
                    <select
                      value={reportType}
                      onChange={(e) => setReportType(e.target.value as CommunityReport['reportType'])}
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
                      onChange={(e) => setSeverity(e.target.value as CommunityReport['severity'])}
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
                    placeholder="Provide depth estimate, moving water speed, or landmarks..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                {/* Real Optional Photo Upload (PNG/JPEG/WEBP <= 2.5MB) */}
                <div className="p-2.5 bg-slate-800/60 rounded-xl border border-dashed border-slate-700 space-y-1.5">
                  <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
                    <Camera className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="text-[11px] font-medium">
                      {photoName ? `Attached: ${photoName}` : 'Attach incident photo (PNG/JPEG/WEBP, max 2.5 MB)'}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handlePhotoChange}
                      className="sr-only"
                    />
                  </label>
                  {photoDataUrl && (
                    <img
                      src={photoDataUrl}
                      alt="Preview"
                      className="w-full max-h-28 object-cover rounded-lg border border-slate-700"
                    />
                  )}
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
                    {isSubmitting ? 'Submitting...' : t.submitReport}
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
