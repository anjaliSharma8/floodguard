import React, { useState } from 'react';
import { Language } from '../types';
import { TRANSLATIONS } from '../utils/i18n';
import { OfflineStorageSummary } from '../services/offlineStorage';
import {
  WifiOff,
  X,
  ShieldCheck,
  HardDrive,
  AlertTriangle,
  CheckCircle2,
  Download,
  LoaderCircle,
  CloudOff,
  PhoneCall
} from 'lucide-react';

interface OfflineGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  deviceOnline: boolean;
  backendAvailable: boolean | null;
  openMeteoStatus: string | null;
  lastWeatherUpdate: string | null;
  lastLiveDataUpdate: string | null;
  trafficStatus: string | null;
  summary: OfflineStorageSummary | null;
  pendingQueueError: string | null;
  onDownloadOfflineData: () => Promise<{ saved: number; errors: string[] }>;
}

const DATASET_LABELS: Record<string, string> = {
  roads: 'Road graph and current road status',
  shelters: 'Emergency shelters',
  hospitals: 'Hospitals',
  'emergency-facilities': 'Emergency facilities and contacts',
  waterways: 'Waterways',
  'historical-floods': 'Historical flood locations',
  rainfall: 'Rainfall feed snapshot'
};

function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'Unavailable';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const OfflineGuideModal: React.FC<OfflineGuideModalProps> = ({
  isOpen,
  onClose,
  lang,
  deviceOnline,
  backendAvailable,
  openMeteoStatus,
  lastWeatherUpdate,
  lastLiveDataUpdate,
  trafficStatus,
  summary,
  pendingQueueError,
  onDownloadOfflineData
}) => {
  const t = TRANSLATIONS[lang];
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  if (!isOpen) return null;

  const handleDownload = async () => {
    setIsDownloading(true);
    setDownloadMessage(null);
    try {
      const result = await onDownloadOfflineData();
      const details = result.errors.length
        ? ` Saved ${result.saved} datasets; ${result.errors.join(' • ')}`
        : ` Saved ${result.saved} datasets for offline use.`;
      setDownloadMessage(details);
    } catch (error) {
      setDownloadMessage(
        error instanceof Error ? error.message : 'Offline data download failed.'
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const savedRoads = summary?.datasets.find(dataset => dataset.id === 'roads');
  const savedRainfall = summary?.datasets.find(dataset => dataset.id === 'rainfall');

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden text-slate-100 text-xs">
        <div className="bg-gradient-to-r from-amber-950 via-slate-900 to-slate-900 px-4 py-3.5 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-amber-600 rounded-xl text-slate-950 shadow">
              <WifiOff className="w-5 h-5 font-bold" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">{t.offlineGuide}</h3>
              <p className="text-[11px] text-slate-400">Offline data, freshness, and emergency options</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4">
          <section className="grid gap-2 sm:grid-cols-2" aria-label="Connectivity status">
            <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
              <div className="flex items-center gap-2 font-semibold text-white">
                <span className={`h-2.5 w-2.5 rounded-full ${deviceOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
                Device network
              </div>
              <p className="mt-1 text-slate-300">{deviceOnline ? 'Connected (browser-reported)' : 'Offline'}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
              <div className="flex items-center gap-2 font-semibold text-white">
                <span className={`h-2.5 w-2.5 rounded-full ${
                  backendAvailable === true ? 'bg-emerald-400' : backendAvailable === false ? 'bg-red-400' : 'bg-blue-400'
                }`} />
                SanketSetu backend
              </div>
              <p className="mt-1 text-slate-300">
                {backendAvailable === true ? 'Reachable' : backendAvailable === false ? 'Unavailable' : 'Checking'}
              </p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
              <div className="flex items-center gap-2 font-semibold text-white">
                <span className={`h-2.5 w-2.5 rounded-full ${openMeteoStatus === 'OK' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                Weather provider
              </div>
              <p className="mt-1 text-slate-300">
                Open-Meteo: {openMeteoStatus || 'Status unavailable'}
                {lastWeatherUpdate && ` · updated ${new Date(lastWeatherUpdate).toLocaleString()}`}
              </p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
              <div className="flex items-center gap-2 font-semibold text-white">
                <span className={`h-2.5 w-2.5 rounded-full ${trafficStatus === 'LIVE' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                Traffic provider
              </div>
              <p className="mt-1 text-slate-300">{trafficStatus || 'Provider status unavailable'}</p>
            </div>
          </section>

          <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-red-100 leading-relaxed">
            <div className="flex items-center gap-2 font-bold text-red-200 mb-1">
              <PhoneCall className="w-4 h-4 shrink-0" />
              SOS submission is not configured
            </div>
            This app cannot dispatch or transmit an SOS. An offline SOS request can be encrypted and saved on this device, but it is not delivered and cannot synchronize without a real submission endpoint. Call an emergency service directly; cellular calls may still work without mobile data.
          </div>

          <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-3 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="flex items-center gap-2 font-bold text-white">
                  <HardDrive className="w-4 h-4 text-cyan-400" />
                  Download offline data
                </h4>
                <p className="mt-1 text-slate-300">
                  Public data only. Private reports, alerts, votes, and login tokens are not cached.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { void handleDownload(); }}
                disabled={isDownloading || !deviceOnline || backendAvailable === false}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-cyan-700 px-3 py-2 font-bold text-white hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDownloading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {isDownloading ? 'Downloading…' : 'Download / Update'}
              </button>
            </div>
            {downloadMessage && (
              <p role="status" className="rounded-lg bg-slate-950/70 p-2 text-slate-200">{downloadMessage}</p>
            )}
            <div className="space-y-1.5">
              {(summary?.datasets || []).map(dataset => (
                <div key={dataset.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-950/40 px-2.5 py-2">
                  <span className="flex items-center gap-2 text-slate-200">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    {DATASET_LABELS[dataset.id] || dataset.id}
                    {dataset.id === 'roads' && dataset.data && typeof dataset.data === 'object'
                      ? (() => {
                          const roadData = dataset.data as { nodes?: Record<string, unknown>; segments?: unknown[] };
                          return roadData.nodes && Array.isArray(roadData.segments)
                            ? ` (${Object.keys(roadData.nodes).length} nodes, ${roadData.segments.length} segments)`
                            : '';
                        })()
                      : dataset.recordCount !== null
                      ? ` (${dataset.recordCount})`
                      : ''}
                  </span>
                  <span className="text-slate-400">
                    Saved {new Date(dataset.savedAt).toLocaleString()} · {formatBytes(dataset.sizeBytes)}
                  </span>
                </div>
              ))}
              {(!summary || summary.datasets.length === 0) && (
                <p className="text-slate-400">No offline data has been downloaded yet.</p>
              )}
            </div>
            <div className="flex flex-wrap justify-between gap-2 text-slate-400">
              <span>Browser storage: {formatBytes(summary?.usageBytes ?? null)} used of {formatBytes(summary?.quotaBytes ?? null)}</span>
              <span>
                {lastLiveDataUpdate
                  ? `Last backend road-data refresh: ${new Date(lastLiveDataUpdate).toLocaleString()}`
                  : 'Last backend road-data refresh: unavailable'}
              </span>
              <span>
                {savedRoads?.sourceUpdatedAt
                  ? `Road data source update: ${new Date(savedRoads.sourceUpdatedAt).toLocaleString()}`
                  : savedRainfall?.sourceUpdatedAt
                  ? `Rainfall update: ${new Date(savedRainfall.sourceUpdatedAt).toLocaleString()}`
                  : 'Source update time not available'}
              </span>
            </div>
            <p className="text-[11px] text-amber-200">
              Cached road-risk data can be stale. Newly verified closures and current provider updates cannot be checked offline. External map tiles are not downloaded.
            </p>
            <p className="text-[11px] text-slate-400">
              Pending reports: {summary?.pendingReportCount ?? 0} (encrypted locally; not submitted until the backend acknowledges them). Pending SOS requests: {summary?.pendingSosCount ?? 0} (not transmitted).
            </p>
            {pendingQueueError && (
              <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-950/40 p-2 text-amber-200">
                Pending report sync status: {pendingQueueError}
              </p>
            )}
          </section>

          <div className="p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-100 leading-relaxed">
            <div className="flex items-center gap-2 font-bold text-amber-200 mb-1">
              <CloudOff className="h-4 w-4" />
              Offline routing limitations
            </div>
            Local routing can use the downloaded road graph, but it cannot verify live weather, traffic, road closures, or new community reports. Treat cached risk as an estimate, not a safety guarantee.
          </div>

          <div className="space-y-2">
            <span className="font-bold text-slate-200 text-xs flex items-center space-x-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Critical offline flood actions:</span>
            </span>
            <div className="space-y-1.5 text-slate-300">
              <div className="p-2.5 bg-slate-800/40 rounded-lg border border-slate-700/60">
                <strong className="text-white">1. Electrical isolation:</strong> Turn off main power MCBs only if this can be done without entering or touching floodwater. Do not touch wet inverters or transformers.
              </div>
              <div className="p-2.5 bg-slate-800/40 rounded-lg border border-slate-700/60">
                <strong className="text-white">2. Move to safer ground:</strong> Follow local emergency instructions and avoid flooded roads, underpasses, and fast-moving water.
              </div>
              <div className="p-2.5 bg-slate-800/40 rounded-lg border border-slate-700/60">
                <strong className="text-white">3. Turn around, don&apos;t drown:</strong> Never walk or drive through floodwater when depth or current is uncertain.
              </div>
              <div className="p-2.5 bg-slate-800/40 rounded-lg border border-slate-700/60">
                <strong className="text-white">4. Keep animals safe:</strong> Move animals away from rising water only when it is safe to do so.
              </div>
            </div>
          </div>

          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 space-y-1.5">
            <span className="font-bold text-slate-200 block">Direct emergency helplines:</span>
            <div className="flex flex-wrap justify-between gap-2 text-slate-300 font-mono text-[11px]">
              <span>PMC Disaster: <strong>020-25501269</strong></span>
              <span>Fire: <strong>101</strong></span>
              <span>Ambulance: <strong>108</strong></span>
            </div>
          </div>
        </div>

        <div className="p-3 bg-slate-900 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-xl text-xs"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
