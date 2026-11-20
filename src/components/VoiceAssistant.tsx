import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { FunctionCall, LiveServerMessage, Session } from '@google/genai';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  LoaderCircle,
  Mic,
  MicOff,
  PhoneCall,
  Volume2,
  X
} from 'lucide-react';
import {
  AppNotification,
  CommunityReport,
  EmergencyFacility,
  Hospital,
  Language,
  RoadNode,
  RoadSegment,
  Shelter
} from '../types';
import { ActiveRouteSelection, RouteMode, getRouteRiskCounts } from '../utils/rules';
import {
  checkMicrophonePermission,
  isSpeechRecognitionSupported,
  isSpeechVoiceAvailable,
  speakText,
  SpeechRecognitionListener,
  startSpeechRecognition,
  stopSpeaking
} from '../utils/speech';
import { SosSubmissionRequest, SosSubmissionResult } from '../services/sosService';
import { decodePcm16Audio, encodePcm16Audio } from '../services/geminiLiveAudio';
import { requiresBackendGrounding } from '../utils/assistantSafety';
import {
  findMentionedNodes,
  findRoadMention,
  normalizeVoiceText,
  recognizeRouteMode,
  recognizeVoiceIntent
} from '../utils/voiceCommands';
import {
  getEmergencyDialNumbers,
  getRelevantEmergencyContacts,
  matchEmergencyContacts
} from '../utils/emergencyContacts';

type AppSection = 'dashboard' | 'routes' | 'community' | 'emergency' | 'my-reports' | 'alerts';
type MapLayer = 'shelters' | 'hospitals' | 'reports';
type AssistantStatus = 'ready' | 'requesting' | 'listening' | 'processing' | 'speaking' | 'live' | 'error';

interface VoiceAssistantProps {
  isOpen: boolean;
  lang: Language;
  token?: string | null;
  setLang: (lang: Language) => void;
  nodes: Record<string, RoadNode>;
  roads: RoadSegment[];
  emergencyFacilities: EmergencyFacility[];
  shelters: Shelter[];
  hospitals: Hospital[];
  reports: CommunityReport[];
  myReports: CommunityReport[];
  notifications: AppNotification[];
  activeRoute: ActiveRouteSelection | null;
  onNavigate: (section: AppSection) => void;
  onRequestRoute: (originId: string, destinationId: string, mode: RouteMode) => void;
  onSelectRoute: (mode: RouteMode, alternativeIndex?: number) => void;
  onShowMapLayer: (layer: MapLayer, center?: [number, number]) => void;
  onFilterShelters: (filters: { petFriendly: boolean; wheelchairAccessible: boolean }) => void;
  onAddReport: (report: Partial<CommunityReport>) => Promise<{ ok: boolean; error?: string; queued?: boolean }>;
  onSubmitSos: (request: SosSubmissionRequest) => Promise<SosSubmissionResult>;
  onListeningChange: (listening: boolean) => void;
  onClose: () => void;
}

interface ConversationMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
}

interface RouteContext {
  originId?: string;
  destinationId?: string;
  mode: RouteMode;
  awaiting?: 'origin' | 'destination';
}

interface ReportDraft {
  phase: 'location' | 'description' | 'severity' | 'confirmation';
  reportType: CommunityReport['reportType'];
  locationName?: string;
  roadId?: string;
  lat?: number;
  lng?: number;
  description?: string;
  severity?: CommunityReport['severity'];
}

type PendingContactAction =
  | { stage: 'choose-contact'; contacts: EmergencyFacility[]; createdAt: number }
  | { stage: 'choose-number'; contact: EmergencyFacility; numbers: string[]; createdAt: number }
  | { stage: 'confirm'; contact: EmergencyFacility; number: string; createdAt: number };

interface PendingSos {
  id: number;
  phase: 'preparing' | 'confirm' | 'submitting' | 'unavailable' | 'failed' | 'submitted' | 'queued';
  transcript: string;
  contacts: EmergencyFacility[];
  createdAt: number;
  location?: {
    latitude: number;
    longitude: number;
    accuracyM: number;
  };
  result?: SosSubmissionResult;
}

const routeModeLabel: Record<RouteMode, string> = {
  safest: 'safest',
  fastest: 'fastest',
  shortest: 'shortest'
};

function languageText(lang: Language, english: string, hindi: string, marathi: string): string {
  return lang === 'hi' ? hindi : lang === 'mr' ? marathi : english;
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function severityFromText(text: string): CommunityReport['severity'] | undefined {
  const normalized = normalizeVoiceText(text);
  if (/(critical|dangerous|life threatening|गंभीर|गंभीरता)/.test(normalized)) return 'Critical';
  if (/(high|severe|उच्च|ज्यादा|जास्त)/.test(normalized)) return 'High';
  if (/(moderate|medium|मध्यम|मध्यम)/.test(normalized)) return 'Moderate';
  if (/(low|minor|कम|कमी)/.test(normalized)) return 'Low';
  return undefined;
}

function reportTypeFromText(text: string): CommunityReport['reportType'] {
  const normalized = normalizeVoiceText(text);
  if (/(blocked|blockage|बंद|अवरोध)/.test(normalized)) return 'Road blocked';
  if (/(heavy rain|तेज बारिश|मुसळधार)/.test(normalized)) return 'Heavy rainfall';
  if (/(drain|overflow|नाला|नाली)/.test(normalized)) return 'Drainage overflow';
  if (/(tree|पेड़|झाड)/.test(normalized)) return 'Fallen tree';
  if (/(rescue|trapped|बचाव|बचाओ)/.test(normalized)) return 'Rescue required';
  if (/(flood|flooded|बाढ़|पूर)/.test(normalized)) return 'Road flooded';
  return 'Waterlogging';
}

function getUserFacingStatus(status: AssistantStatus, lang: Language): string {
  if (status === 'requesting') return languageText(lang, 'Requesting microphone access...', 'माइक्रोफ़ोन अनुमति माँग रहा हूँ...', 'मायक्रोफोनची परवानगी मागत आहे...');
  if (status === 'listening') return languageText(lang, "I'm listening...", 'मैं सुन रहा हूँ...', 'मी ऐकत आहे...');
  if (status === 'processing') return languageText(lang, 'Understanding your request...', 'आपकी बात समझ रहा हूँ...', 'तुमची विनंती समजून घेत आहे...');
  if (status === 'speaking') return languageText(lang, 'SanketSetu is speaking...', 'संकेतसेतु बोल रहा है...', 'संकेतसेतू बोलत आहे...');
  if (status === 'live') return languageText(lang, 'Gemini Live is connected. Speak naturally; you can interrupt it.', 'Gemini Live जुड़ा है। सामान्य रूप से बोलें; आप बीच में रोक सकते हैं।', 'Gemini Live जोडले आहे. नैसर्गिकपणे बोला; तुम्ही मध्येच थांबवू शकता.');
  if (status === 'error') return languageText(lang, "Sorry, I couldn't understand. Please try again.", 'क्षमा करें, समझ नहीं पाया। फिर से बोलें।', 'क्षमस्व, समजले नाही. पुन्हा प्रयत्न करा.');
  return languageText(lang, 'Tap the microphone to speak.', 'बोलने के लिए माइक्रोफ़ोन दबाएँ।', 'बोलण्यासाठी मायक्रोफोन दाबा.');
}

export const VoiceAssistant: React.FC<VoiceAssistantProps> = ({
  isOpen,
  lang,
  token,
  setLang,
  nodes,
  roads,
  emergencyFacilities,
  shelters,
  hospitals,
  reports,
  myReports,
  notifications,
  activeRoute,
  onNavigate,
  onRequestRoute,
  onSelectRoute,
  onShowMapLayer,
  onFilterShelters,
  onAddReport,
  onSubmitSos,
  onListeningChange,
  onClose
}) => {
  const [status, setStatus] = useState<AssistantStatus>('ready');
  const [permission, setPermission] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [textFallback, setTextFallback] = useState('');
  const [showTextFallback, setShowTextFallback] = useState(false);
  const [notice, setNotice] = useState('');
  const [liveConnected, setLiveConnected] = useState(false);
  const [liveConnecting, setLiveConnecting] = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const isStartingRef = useRef(false);
  const startSequenceRef = useRef(0);
  const transcriptHandlerRef = useRef<(text: string) => Promise<void>>(async () => undefined);
  const startedForOpenRef = useRef(false);
  const lastResponseRef = useRef('');
  const messagesRef = useRef<ConversationMessage[]>([]);
  const liveSessionRef = useRef<Session | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const liveAudioContextRef = useRef<AudioContext | null>(null);
  const liveAudioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const liveAudioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const livePlaybackSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const liveAttemptRef = useRef(0);
  const manualLiveCloseRef = useRef(false);
  const liveAssistantMessageIdRef = useRef<number | null>(null);
  const livePlaybackTimeRef = useRef(0);
  const liveGroundingRequiredRef = useRef(false);
  const liveBackendResultReceivedRef = useRef(false);
  const liveGroundingNoticeShownRef = useRef(false);
  const pendingRouteRef = useRef<RouteContext | null>(null);
  const sosRequestIdRef = useRef(0);
  const sosSubmissionLockRef = useRef(false);
  const [routeContext, setRouteContext] = useState<RouteContext | null>(null);
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null);
  const [pendingSos, setPendingSos] = useState<PendingSos | null>(null);
  const [pendingContactAction, setPendingContactAction] = useState<PendingContactAction | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const addMessage = useCallback((role: ConversationMessage['role'], text: string) => {
    setMessages(previous => [...previous, { id: Date.now() + Math.random(), role, text }]);
  }, []);

  const say = useCallback((text: string) => {
    lastResponseRef.current = text;
    addMessage('assistant', text);
    setNotice('');
    if (!isSpeechVoiceAvailable(lang)) {
      setNotice(languageText(
        lang,
        'No matching spoken voice is installed. The response is shown as text.',
        'इस भाषा की आवाज़ उपलब्ध नहीं है। जवाब पाठ में दिखाया गया है।',
        'या भाषेतील आवाज उपलब्ध नाही. उत्तर मजकूरात दाखवले आहे.'
      ));
      setStatus('ready');
      return;
    }
    setStatus('speaking');
    const started = speakText(
      text,
      lang,
      error => {
        setNotice(error);
        setStatus('error');
        isStartingRef.current = false;
      },
      {
        onStart: () => setStatus('speaking'),
        onEnd: () => setStatus(current => current === 'speaking' ? 'ready' : current)
      }
    );
    if (!started) setStatus('error');
  }, [addMessage, lang]);

  const stopListening = useCallback(() => {
    startSequenceRef.current += 1;
    isStartingRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    onListeningChange(false);
    setStatus(current => current === 'listening' ? 'ready' : current);
  }, [onListeningChange]);

  const cleanupGeminiLive = useCallback((updateState = true) => {
    liveAttemptRef.current += 1;
    manualLiveCloseRef.current = true;
    liveSessionRef.current?.close();
    liveSessionRef.current = null;
    liveAudioSourceRef.current?.disconnect();
    liveAudioSourceRef.current = null;
    liveAudioProcessorRef.current?.disconnect();
    liveAudioProcessorRef.current = null;
    liveStreamRef.current?.getTracks().forEach(track => track.stop());
    liveStreamRef.current = null;
    livePlaybackSourcesRef.current.forEach(source => {
      try {
        source.stop();
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'InvalidStateError')) {
          console.warn('[SanketSetu] Could not stop a Gemini Live audio buffer cleanly.');
        }
      }
    });
    livePlaybackSourcesRef.current.clear();
    const audioContext = liveAudioContextRef.current;
    liveAudioContextRef.current = null;
    if (audioContext && audioContext.state !== 'closed') {
      void audioContext.close().catch(() => {
        console.warn('[SanketSetu] Could not close the Gemini Live audio context cleanly.');
      });
    }
    livePlaybackTimeRef.current = 0;
    liveAssistantMessageIdRef.current = null;
    onListeningChange(false);
    if (updateState) {
      setLiveConnected(false);
      setLiveConnecting(false);
    }
  }, [onListeningChange]);

  const closeAssistant = useCallback(() => {
    stopListening();
    cleanupGeminiLive();
    stopSpeaking();
    sosRequestIdRef.current += 1;
    setPendingSos(null);
    setPendingContactAction(null);
    setStatus('ready');
    onClose();
  }, [onClose, stopListening, cleanupGeminiLive]);

  const capturePosition = useCallback(
    () => new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Location is unavailable in this browser.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, error => reject(new Error(error.message)), {
        enableHighAccuracy: true,
        timeout: 12_000,
        maximumAge: 0
      });
    }),
    []
  );

  const requestRoute = useCallback((originId: string, destinationId: string, mode: RouteMode) => {
    const context = { originId, destinationId, mode };
    pendingRouteRef.current = context;
    setRouteContext(context);
    onNavigate('routes');
    onRequestRoute(originId, destinationId, mode);
    const origin = nodes[originId]?.name || 'your starting point';
    const destination = nodes[destinationId]?.name || 'your destination';
    say(languageText(
      lang,
      `Calculating the ${routeModeLabel[mode]} available route from ${origin} to ${destination}. Flood risk is an estimate, not a safety guarantee.`,
      `${origin} से ${destination} तक ${mode === 'fastest' ? 'सबसे तेज़' : mode === 'shortest' ? 'सबसे छोटा' : 'कम अनुमानित जोखिम वाला'} मार्ग खोज रहा हूँ। जोखिम अनुमान है, सुरक्षा की गारंटी नहीं।`,
      `${origin} ते ${destination} पर्यंत ${mode === 'fastest' ? 'जलद' : mode === 'shortest' ? 'लहान' : 'कमी अंदाजित जोखीम असलेला'} मार्ग शोधत आहे. जोखीम हा अंदाज आहे, सुरक्षिततेची हमी नाही.`
    ));
  }, [lang, nodes, onNavigate, onRequestRoute, say]);

  useEffect(() => {
    if (!activeRoute?.selectedRoute || !routeContext) return;
    if (
      activeRoute.originNode.id !== routeContext.originId ||
      activeRoute.targetNode.id !== routeContext.destinationId ||
      activeRoute.activeMode !== routeContext.mode
    ) return;
    if (pendingRouteRef.current !== routeContext) return;
    pendingRouteRef.current = null;
    const route = activeRoute.selectedRoute;
    if (!route.feasible) {
      say(languageText(
        lang,
        'No feasible route was returned for those locations. Try another origin or destination.',
        'इन स्थानों के लिए कोई चलने योग्य मार्ग नहीं मिला। दूसरा स्थान चुनें।',
        'या ठिकाणांसाठी मार्ग उपलब्ध नाही. दुसरे ठिकाण निवडा.'
      ));
      return;
    }
    const counts = getRouteRiskCounts(route);
    const warning = counts.high + counts.severe + counts.closed;
    const summary = languageText(
      lang,
      `The ${routeModeLabel[routeContext.mode]} route is ${route.totalDistanceKm.toFixed(1)} kilometres and about ${Math.round(route.travelTimeMins)} minutes. It has ${warning} high, severe, or closed road segments and ${counts.unknown} segments with unknown risk. These are estimated conditions, not a guarantee of safety.`,
      `${routeModeLabel[routeContext.mode]} मार्ग ${route.totalDistanceKm.toFixed(1)} किलोमीटर का है और लगभग ${Math.round(route.travelTimeMins)} मिनट लेगा। इसमें ${warning} उच्च जोखिम, गंभीर या बंद सड़क खंड और ${counts.unknown} अज्ञात जोखिम वाले खंड हैं। यह अनुमान है, सुरक्षा की गारंटी नहीं।`,
      `${routeModeLabel[routeContext.mode]} मार्ग ${route.totalDistanceKm.toFixed(1)} किलोमीटरचा असून अंदाजे ${Math.round(route.travelTimeMins)} मिनिटे लागतील. यात ${warning} उच्च/गंभीर जोखीम किंवा बंद रस्ते आणि ${counts.unknown} अज्ञात जोखीम असलेले भाग आहेत. हा अंदाज आहे, सुरक्षिततेची हमी नाही.`
    );
    say(summary);
  }, [activeRoute, lang, routeContext, say]);

  const startListening = useCallback(() => {
    if (recognitionRef.current || isStartingRef.current) return;
    isStartingRef.current = true;
    const requestId = ++startSequenceRef.current;
    stopSpeaking();
    setNotice('');
    setTranscript('');
    if (!isSpeechRecognitionSupported()) {
      setStatus('error');
      setNotice(languageText(
        lang,
        'Speech recognition is not supported by this browser. You can enter a command below instead.',
        'यह ब्राउज़र आवाज़ पहचान का समर्थन नहीं करता। नीचे कमांड लिखें।',
        'हा ब्राउझर आवाज ओळखत नाही. खाली आदेश लिहा.'
      ));
      return;
    }
    setStatus('requesting');
    onListeningChange(false);
    void checkMicrophonePermission().then(currentPermission => {
      if (requestId !== startSequenceRef.current) return;
      setPermission(currentPermission);
      if (currentPermission === 'denied') {
        isStartingRef.current = false;
        setStatus('error');
        setNotice(languageText(
          lang,
          'Microphone permission is denied. Enable it in your browser site settings, then try again.',
          'माइक्रोफ़ोन अनुमति अस्वीकृत है। ब्राउज़र की साइट सेटिंग में इसे चालू करके फिर प्रयास करें।',
          'मायक्रोफोन परवानगी नाकारली आहे. ब्राउझरच्या साइट सेटिंगमध्ये परवानगी देऊन पुन्हा प्रयत्न करा.'
        ));
        return;
      }

      const listener: SpeechRecognitionListener = {
        onStart: () => {
          isStartingRef.current = false;
          setPermission('granted');
          onListeningChange(true);
          setStatus('listening');
        },
        onInterim: text => setTranscript(text),
        onResult: text => {
          setTranscript(text);
          addMessage('user', text);
          onListeningChange(false);
          setStatus('processing');
          void transcriptHandlerRef.current(text);
        },
        onError: error => {
          isStartingRef.current = false;
          onListeningChange(false);
          setStatus('error');
          setNotice(error);
          if (error.toLowerCase().includes('permission denied')) setPermission('denied');
        },
        onEnd: () => {
          isStartingRef.current = false;
          recognitionRef.current = null;
          onListeningChange(false);
          setStatus(current => current === 'listening' || current === 'requesting' ? 'ready' : current);
        }
      };
      recognitionRef.current = startSpeechRecognition(lang, listener);
      if (!recognitionRef.current) isStartingRef.current = false;
    }).catch(error => {
      if (requestId !== startSequenceRef.current) return;
      isStartingRef.current = false;
      onListeningChange(false);
      setStatus('error');
      setNotice(error instanceof Error ? error.message : String(error));
    });
  }, [addMessage, lang, onListeningChange, stopSpeaking]);

  const selectRouteNodes = useCallback(async (transcriptText: string, mode: RouteMode) => {
    const mentions = findMentionedNodes(transcriptText, nodes);
    const normalized = normalizeVoiceText(transcriptText);
    let originId = routeContext?.originId || activeRoute?.originNode.id;
    let destinationId = routeContext?.destinationId || activeRoute?.targetNode.id;
    if (mentions.length >= 2) {
      originId = mentions[0].id;
      destinationId = mentions[1].id;
    } else if (mentions.length === 1) {
      if (routeContext?.awaiting === 'origin' || /\b(from|starting at|start at|से|पासून)\b/.test(normalized)) {
        originId = mentions[0].id;
      } else {
        destinationId = mentions[0].id;
      }
    }

    if (/(my location|current location|gps|मेरी जगह|मेरा स्थान|माझे स्थान|सध्याचे ठिकाण)/.test(normalized)) {
      try {
        const position = await capturePosition();
        const nearest = Object.values(nodes).reduce<RoadNode | null>((best, node) => {
          if (!best) return node;
          return distanceMeters(position.coords.latitude, position.coords.longitude, node.lat, node.lng) <
            distanceMeters(position.coords.latitude, position.coords.longitude, best.lat, best.lng)
            ? node
            : best;
        }, null);
        if (nearest) originId = nearest.id;
      } catch {
        say(languageText(
          lang,
          'I could not access your location. Please name a starting place or allow location access.',
          'आपकी जगह नहीं मिल सकी। शुरू करने की जगह बताएं या स्थान अनुमति दें।',
          'तुमचे ठिकाण मिळाले नाही. सुरुवातीचे ठिकाण सांगा किंवा स्थान परवानगी द्या.'
        ));
        return;
      }
    }

    if (!destinationId) {
      setRouteContext({ originId, mode, awaiting: 'destination' });
      say(languageText(lang, 'Where would you like to go? Please say a place name shown in SanketSetu.', 'आप कहाँ जाना चाहते हैं? SanketSetu में दिखने वाला स्थान बताएं।', 'तुम्हाला कुठे जायचे आहे? SanketSetu मध्ये दिसणारे ठिकाण सांगा.'));
      return;
    }
    if (!originId) {
      setRouteContext({ destinationId, mode, awaiting: 'origin' });
      say(languageText(lang, 'Where are you starting from? You can name a road-network location or say use my current location.', 'आप कहाँ से शुरू कर रहे हैं? स्थान का नाम बताएं या कहें मेरी वर्तमान जगह इस्तेमाल करें।', 'तुम्ही कुठून सुरू करणार? ठिकाणाचे नाव सांगा किंवा माझे सध्याचे स्थान वापरा असे म्हणा.'));
      return;
    }
    requestRoute(originId, destinationId, mode);
  }, [activeRoute, capturePosition, lang, nodes, requestRoute, routeContext, say]);

  const submitReport = useCallback(async () => {
    if (!reportDraft?.locationName || !reportDraft.description || !reportDraft.severity ||
        typeof reportDraft.lat !== 'number' || typeof reportDraft.lng !== 'number') {
      setReportDraft(current => current ? { ...current, phase: 'location' } : current);
      say(languageText(
        lang,
        'I still need a real location. Say use my current location and allow GPS, or name a road from the map.',
        'मुझे वास्तविक स्थान चाहिए। वर्तमान स्थान का उपयोग कहें और GPS की अनुमति दें, या मानचित्र की सड़क का नाम बताएं।',
        'मला प्रत्यक्ष ठिकाण आवश्यक आहे. माझे सध्याचे स्थान वापरा असे सांगा आणि GPS परवानगी द्या, किंवा नकाशावरील रस्ता सांगा.'
      ));
      return;
    }
    const result = await onAddReport({
      reportType: reportDraft.reportType,
      locationName: reportDraft.locationName,
      roadId: reportDraft.roadId,
      lat: reportDraft.lat,
      lng: reportDraft.lng,
      description: reportDraft.description,
      severity: reportDraft.severity
    });
    if (!result.ok) {
      say(result.error || languageText(lang, 'The report could not be submitted. Please try again.', 'रिपोर्ट जमा नहीं हुई। फिर से प्रयास करें।', 'अहवाल पाठवता आला नाही. पुन्हा प्रयत्न करा.'));
      return;
    }
    setReportDraft(null);
    onNavigate('community');
    say(result.queued
      ? 'Your report is encrypted and saved on this device only. It has NOT been submitted or reviewed; it will be retried after reconnecting and signing in as the same user.'
      : languageText(lang, 'Your report was submitted. It is awaiting verification.', 'आपकी रिपोर्ट जमा हुई। सत्यापन बाकी है।', 'तुमचा अहवाल पाठवला आहे. पडताळणी बाकी आहे.'));
  }, [lang, onAddReport, onNavigate, reportDraft, say]);

  const promptContactConfirmation = useCallback((contact: EmergencyFacility) => {
    const numbers = getEmergencyDialNumbers(contact.contact);
    if (numbers.length === 0) {
      setPendingContactAction(null);
      say(languageText(
        lang,
        `The directory has no dialable number for ${contact.name}. I will not guess a number.`,
        `निर्देशिका में ${contact.name} का डायल करने योग्य नंबर नहीं है। मैं नंबर का अनुमान नहीं लगाऊँगा।`,
        `${contact.name} साठी निर्देशिकेत डायल करता येईल असा क्रमांक नाही. मी क्रमांकाचा अंदाज लावणार नाही.`
      ));
      return;
    }

    const createdAt = Date.now();
    if (numbers.length > 1) {
      setPendingContactAction({ stage: 'choose-number', contact, numbers, createdAt });
      say(languageText(
        lang,
        `The directory lists ${numbers.join(' or ')} for ${contact.name}. Which number should I open?`,
        `${contact.name} के लिए निर्देशिका में ${numbers.join(' या ')} हैं। कौन सा नंबर खोलूँ?`,
        `${contact.name} साठी निर्देशिकेत ${numbers.join(' किंवा ')} आहेत. कोणता क्रमांक उघडू?`
      ));
      return;
    }

    setPendingContactAction({ stage: 'confirm', contact, number: numbers[0], createdAt });
    say(languageText(
      lang,
      `I found ${contact.name}. The directory number is ${numbers[0]}. Say yes to open your device dialer, or cancel.`,
      `${contact.name} मिला। निर्देशिका का नंबर ${numbers[0]} है। डायलर खोलने के लिए हाँ कहें, या रद्द करें।`,
      `${contact.name} सापडले. निर्देशिकेतील क्रमांक ${numbers[0]} आहे. डायलर उघडण्यासाठी हो म्हणा, किंवा रद्द करा.`
    ));
  }, [lang, say]);

  const startEmergencyContactRequest = useCallback((
    transcriptText: string,
    candidates: EmergencyFacility[] = emergencyFacilities
  ) => {
    const matches = matchEmergencyContacts(transcriptText, candidates);
    if (matches.length === 0) {
      if (candidates.length === emergencyFacilities.length && /emergency services|emergency help|आपातकालीन सेवा|आपत्कालीन सेवा/.test(normalizeVoiceText(transcriptText))) {
        setPendingContactAction({
          stage: 'choose-contact',
          contacts: emergencyFacilities,
          createdAt: Date.now()
        });
        const names = emergencyFacilities.map(contact => contact.name).join(', ');
        say(languageText(
          lang,
          `Which directory contact do you need? Available contacts are: ${names}.`,
          `आपको निर्देशिका में किस संपर्क की आवश्यकता है? उपलब्ध संपर्क हैं: ${names}।`,
          `निर्देशिकेतील कोणता संपर्क हवा आहे? उपलब्ध संपर्क: ${names}.`
        ));
        return;
      }
      setPendingContactAction(null);
      say(languageText(
        lang,
        `I couldn't find that contact in the emergency directory. Please say the contact name as listed there.`,
        `आपातकालीन निर्देशिका में यह संपर्क नहीं मिला। कृपया सूची में दिया गया नाम बोलें।`,
        `आपत्कालीन निर्देशिकेत हा संपर्क सापडला नाही. कृपया सूचीतील नाव सांगा.`
      ));
      return;
    }
    if (matches.length > 1) {
      setPendingContactAction({
        stage: 'choose-contact',
        contacts: matches,
        createdAt: Date.now()
      });
      const names = matches.map(contact => contact.name).join(' or ');
      say(languageText(
        lang,
        `I found multiple contacts: ${names}. Which one do you mean?`,
        `कई संपर्क मिले: ${matches.map(contact => contact.name).join(' या ')}। आप किसे चाहते हैं?`,
        `अनेक संपर्क सापडले: ${matches.map(contact => contact.name).join(' किंवा ')}. कोणता हवा आहे?`
      ));
      return;
    }
    promptContactConfirmation(matches[0]);
  }, [emergencyFacilities, lang, promptContactConfirmation, say]);

  const beginSosConfirmation = useCallback(async (transcriptText: string) => {
    const requestId = ++sosRequestIdRef.current;
    const pending: PendingSos = {
      id: requestId,
      phase: 'preparing',
      transcript: transcriptText,
      contacts: getRelevantEmergencyContacts(transcriptText, emergencyFacilities),
      createdAt: Date.now()
    };
    setPendingSos(pending);
    setPendingContactAction(null);
    onNavigate('emergency');
    say(languageText(
      lang,
      'I heard your emergency request. I am checking whether your device can provide a current location. No SOS is being sent before your confirmation.',
      'आपातकालीन अनुरोध सुना। मैं देख रहा हूँ कि आपका उपकरण वर्तमान स्थान दे सकता है या नहीं। आपकी पुष्टि से पहले कोई SOS नहीं भेजा जा रहा है।',
      'आपत्कालीन विनंती ऐकली. तुमचे उपकरण सध्याचे स्थान देऊ शकते का ते तपासत आहे. तुमच्या पुष्टीपूर्वी SOS पाठवला जात नाही.'
    ));

    let location: PendingSos['location'];
    try {
      const position = await capturePosition();
      if (
        Number.isFinite(position.coords.latitude) &&
        Number.isFinite(position.coords.longitude) &&
        Number.isFinite(position.coords.accuracy)
      ) {
        location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: position.coords.accuracy
        };
      }
    } catch {
      location = undefined;
    }

    if (sosRequestIdRef.current !== requestId) return;
    setPendingSos(current => current?.id === requestId
      ? { ...current, phase: 'confirm', location }
      : current
    );
    say(languageText(
      lang,
      location
        ? `Your current location is ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}, accuracy about ${Math.round(location.accuracyM)} metres. Confirm the SOS request to check for backend submission, or say a contact name for call options. What type of assistance do you need?`
        : 'I could not get a current GPS location. You can still confirm to check for backend submission, or say a contact name for call options. What type of assistance do you need? No location coordinates will be included.',
      location
        ? `आपका वर्तमान स्थान ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)} है, सटीकता लगभग ${Math.round(location.accuracyM)} मीटर। बैकएंड सबमिशन जाँचने के लिए SOS की पुष्टि करें, या कॉल विकल्पों के लिए संपर्क का नाम कहें। आपको किस सहायता की आवश्यकता है?`
        : 'वर्तमान GPS स्थान नहीं मिल सका। आप बैकएंड सबमिशन जाँचने की पुष्टि कर सकते हैं या कॉल विकल्पों के लिए संपर्क का नाम कह सकते हैं। आपको किस सहायता की आवश्यकता है? कोई स्थान निर्देशांक शामिल नहीं होगा।',
      location
        ? `तुमचे सध्याचे स्थान ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)} आहे, अचूकता अंदाजे ${Math.round(location.accuracyM)} मीटर. बॅकएंड सबमिशन तपासण्यासाठी SOS पुष्टी करा किंवा कॉल पर्यायांसाठी संपर्काचे नाव सांगा. कोणती मदत हवी आहे?`
        : 'सध्याचे GPS स्थान मिळाले नाही. बॅकएंड सबमिशन तपासण्यासाठी पुष्टी करा किंवा कॉल पर्यायांसाठी संपर्काचे नाव सांगा. कोणती मदत हवी आहे? स्थानाचे निर्देशांक पाठवले जाणार नाहीत.'
    ));
  }, [capturePosition, emergencyFacilities, lang, onNavigate, say]);

  const submitConfirmedSos = useCallback(async (request: PendingSos) => {
    if (sosSubmissionLockRef.current) return;
    sosSubmissionLockRef.current = true;
    setPendingSos(current => current?.id === request.id
      ? { ...current, phase: 'submitting' }
      : current
    );

    const submission: SosSubmissionRequest = {
      idempotencyKey: `voice-sos-${request.id}`,
      transcript: request.transcript,
      requestedAt: new Date(request.createdAt).toISOString(),
      ...(request.location ? { location: request.location } : {})
    };

    try {
      const result = await onSubmitSos(submission);
      setPendingSos(current => current?.id === request.id
        ? { ...current, phase: result.status, result }
        : current
      );
      if (result.status === 'submitted' && result.dispatchStatus !== 'notified') {
        say(`${result.message} Dispatch notification is not confirmed. Please call an emergency service directly.`);
      } else {
        say(result.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown submission error.';
      const result: SosSubmissionResult = {
        status: 'failed',
        message: `SOS submission failed: ${message} Please call an emergency service directly.`
      };
      setPendingSos(current => current?.id === request.id
        ? { ...current, phase: 'failed', result }
        : current
      );
      say(result.message);
    } finally {
      sosSubmissionLockRef.current = false;
    }
  }, [onSubmitSos, say]);

  const askGemini = async (question: string) => {
    try {
      const history = messages
        .filter((message, index, list) =>
          !(index === list.length - 1 && message.role === 'user' && message.text === question)
        )
        .slice(-20)
        .map(message => ({
          role: message.role === 'user' ? 'user' : 'model',
          text: message.text
        }));
      const response = await fetch('/api/chatbot/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ message: question, lang, history })
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(typeof result.error === 'string' ? result.error : 'Assistant request failed.');
      }
      say(result.reply);
      if (result.aiStatus === 'unavailable') {
        setNotice(`AI unavailable (${result.errorCategory || 'unknown'}). The response contains backend data only.`);
      }
      setStatus('speaking');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The assistant request failed.';
      setNotice(`Could not reach the assistant backend. No AI response was generated. ${message}`);
      setStatus('error');
    }
  };

  const appendLiveAssistantTranscript = (text: string) => {
    if (!text.trim()) return;
    setMessages(previous => {
      const currentId = liveAssistantMessageIdRef.current;
      if (currentId !== null) {
        return previous.map(message =>
          message.id === currentId ? { ...message, text: message.text + text } : message
        );
      }
      const id = Date.now() + Math.random();
      liveAssistantMessageIdRef.current = id;
      return [...previous, { id, role: 'assistant', text }];
    });
  };

  const playLiveAudio = (base64: string) => {
    const audioContext = liveAudioContextRef.current;
    if (!audioContext) return;
    const samples = decodePcm16Audio(base64);
    if (!samples.length) return;
    const buffer = audioContext.createBuffer(1, samples.length, 24000);
    buffer.getChannelData(0).set(samples);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.onended = () => {
      livePlaybackSourcesRef.current.delete(source);
      if (livePlaybackSourcesRef.current.size === 0) {
        setStatus(current => current === 'speaking' ? 'live' : current);
      }
    };
    const startAt = Math.max(audioContext.currentTime, livePlaybackTimeRef.current);
    source.start(startAt);
    livePlaybackTimeRef.current = startAt + buffer.duration;
    livePlaybackSourcesRef.current.add(source);
    setStatus('speaking');
  };

  const handleLiveToolCalls = async (
    session: Session,
    functionCalls: FunctionCall[],
    attempt: number
  ) => {
    const functionResponses = [];
    let lookupFailed = false;
    for (const call of functionCalls) {
      const query = call.name === 'querySanketSetuBackend' && typeof call.args?.query === 'string'
        ? call.args.query.trim().slice(0, 4000)
        : '';
      if (!query) {
        lookupFailed = true;
        break;
      }

      try {
        const history = messagesRef.current.slice(-20).map(message => ({
          role: message.role === 'user' ? 'user' : 'model',
          text: message.text
        }));
        const response = await fetch('/api/chatbot/message', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ message: query, lang, history })
        });
        const result = await response.json();
        if (!response.ok || typeof result.reply !== 'string') throw new Error('Backend query failed.');
        functionResponses.push({
          ...(call.id ? { id: call.id } : {}),
          name: call.name,
          response: {
            reply: result.reply,
            aiStatus: result.aiStatus,
            errorCategory: result.errorCategory,
            source: result.source,
            timestamp: result.timestamp
          }
        });
      } catch {
        lookupFailed = true;
        break;
      }
    }

    if (liveAttemptRef.current !== attempt || liveSessionRef.current !== session) return;
    if (lookupFailed || functionResponses.length !== functionCalls.length || !functionResponses.length) {
      setNotice('Verified backend lookup failed. No live answer was generated for this current-condition request.');
      cleanupGeminiLive();
      setStatus('error');
      return;
    }

    try {
      await session.sendToolResponse({ functionResponses });
      liveBackendResultReceivedRef.current = true;
    } catch {
      if (liveAttemptRef.current !== attempt) return;
      setNotice('The verified backend result could not be returned to Gemini Live. No AI answer was generated.');
      cleanupGeminiLive();
      setStatus('error');
    }
  };

  async function startGeminiLive(): Promise<void> {
    if (liveConnecting || liveConnected) return;
    stopListening();
    stopSpeaking();
    setNotice('');
    setTranscript('');
    setLiveConnecting(true);
    setStatus('requesting');
    manualLiveCloseRef.current = false;
    const attempt = ++liveAttemptRef.current;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('This browser does not provide secure microphone access for Gemini Live.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      if (liveAttemptRef.current !== attempt) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      liveStreamRef.current = stream;
      setPermission('granted');

      const tokenResponse = await fetch('/api/ai/live-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ lang })
      });
      const tokenResult = await tokenResponse.json();
      if (!tokenResponse.ok || typeof tokenResult.token !== 'string' || typeof tokenResult.model !== 'string') {
        const category = typeof tokenResult.errorCategory === 'string' ? tokenResult.errorCategory : 'live_api_unavailable';
        throw new Error(`Gemini Live unavailable (${category}).`);
      }
      if (liveAttemptRef.current !== attempt) return;

      const { GoogleGenAI, Modality } = await import('@google/genai');
      const liveClient = new GoogleGenAI({
        apiKey: tokenResult.token,
        httpOptions: { apiVersion: 'v1beta' }
      });
      const session = await liveClient.live.connect({
        model: tokenResult.model,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
            if (liveAttemptRef.current !== attempt) return;
            setLiveConnected(true);
            setLiveConnecting(false);
            setStatus('live');
            onListeningChange(true);
          },
          onmessage: (message: LiveServerMessage) => {
            if (liveAttemptRef.current !== attempt) return;
            const content = message.serverContent;
            if (content?.interimInputTranscription?.text) {
              setTranscript(content.interimInputTranscription.text);
            }
            if (content?.inputTranscription?.text) {
              setTranscript('');
              liveAssistantMessageIdRef.current = null;
              liveGroundingRequiredRef.current = requiresBackendGrounding(content.inputTranscription.text);
              liveBackendResultReceivedRef.current = false;
              liveGroundingNoticeShownRef.current = false;
              addMessage('user', content.inputTranscription.text);
            }
            if (content?.outputTranscription?.text) {
              if (liveGroundingRequiredRef.current && !liveBackendResultReceivedRef.current) {
                if (!liveGroundingNoticeShownRef.current) {
                  setNotice('A current-condition answer was withheld because no verified backend result was received.');
                  liveGroundingNoticeShownRef.current = true;
                }
              } else {
                appendLiveAssistantTranscript(content.outputTranscription.text);
              }
            }
            if (content?.interrupted) {
              livePlaybackSourcesRef.current.forEach(source => {
                try {
                  source.stop();
                } catch {
                  livePlaybackSourcesRef.current.delete(source);
                }
              });
              livePlaybackSourcesRef.current.clear();
              livePlaybackTimeRef.current = 0;
              setStatus('live');
            }
            for (const part of content?.modelTurn?.parts || []) {
              const audio = part.inlineData;
              if (audio?.data && audio.mimeType?.startsWith('audio/pcm')) {
                if (liveGroundingRequiredRef.current && !liveBackendResultReceivedRef.current) {
                  if (!liveGroundingNoticeShownRef.current) {
                    setNotice('A current-condition answer was withheld because no verified backend result was received.');
                    liveGroundingNoticeShownRef.current = true;
                  }
                  continue;
                }
                try {
                  playLiveAudio(audio.data);
                } catch {
                  setNotice('Gemini Live returned audio that this browser could not play. Use browser speech fallback.');
                }
              }
            }
            if (content?.turnComplete && livePlaybackSourcesRef.current.size === 0) setStatus('live');
            if (message.toolCall?.functionCalls?.length && liveSessionRef.current) {
              void handleLiveToolCalls(liveSessionRef.current, message.toolCall.functionCalls, attempt);
            }
          },
          onerror: () => {
            if (liveAttemptRef.current !== attempt || manualLiveCloseRef.current) return;
            cleanupGeminiLive();
            setNotice('Gemini Live connection failed. Reconnect or use the clearly labeled browser speech fallback.');
            setStatus('error');
          },
          onclose: () => {
            if (liveAttemptRef.current !== attempt || manualLiveCloseRef.current) return;
            cleanupGeminiLive();
            setNotice('Gemini Live disconnected. Reconnect with a fresh short-lived token or use browser speech fallback.');
            setStatus('error');
          }
        }
      });
      if (liveAttemptRef.current !== attempt) {
        session.close();
        return;
      }
      liveSessionRef.current = session;
      const audioContext = new AudioContext({ sampleRate: 16000 });
      liveAudioContextRef.current = audioContext;
      await audioContext.resume();
      if (liveAttemptRef.current !== attempt) return;

      const microphoneSource = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      liveAudioSourceRef.current = microphoneSource;
      liveAudioProcessorRef.current = processor;
      processor.onaudioprocess = event => {
        if (liveSessionRef.current !== session) return;
        try {
          const audio = encodePcm16Audio(event.inputBuffer.getChannelData(0), audioContext.sampleRate);
          session.sendRealtimeInput({ audio: { data: audio, mimeType: 'audio/pcm;rate=16000' } });
          event.outputBuffer.getChannelData(0).fill(0);
        } catch {
          setNotice('Microphone audio could not be streamed to Gemini Live. Use browser speech fallback.');
          cleanupGeminiLive();
          setStatus('error');
        }
      };
      microphoneSource.connect(processor);
      processor.connect(audioContext.destination);
      setLiveConnected(true);
      setLiveConnecting(false);
      setStatus('live');
      onListeningChange(true);
    } catch (error) {
      if (liveAttemptRef.current !== attempt) return;
      cleanupGeminiLive(false);
      setLiveConnected(false);
      setLiveConnecting(false);
      setStatus('error');
      const permissionDenied = error instanceof DOMException && error.name === 'NotAllowedError';
      if (permissionDenied) setPermission('denied');
      const message = permissionDenied
        ? 'Microphone permission was denied. Allow microphone access in browser settings.'
        : error instanceof Error ? error.message : 'Gemini Live could not connect.';
      setNotice(`${message} Browser speech recognition remains available as fallback.`);
    }
  }

  function stopGeminiLive(): void {
    cleanupGeminiLive();
    setStatus('ready');
    setNotice('Gemini Live stopped. Tap the microphone to resume browser speech recognition.');
  }

  async function handleTranscript(text: string): Promise<void> {
    const normalized = normalizeVoiceText(text);
    if (reportDraft) {
      if (recognizeVoiceIntent(text) === 'cancel') {
        setReportDraft(null);
        say(languageText(lang, 'Report cancelled. Nothing was submitted.', 'रिपोर्ट रद्द हुई। कुछ जमा नहीं हुआ।', 'अहवाल रद्द केला. काहीही पाठवले नाही.'));
        return;
      }
      if (reportDraft.phase === 'location') {
        if (/(use my (current )?location|gps|मेरी जगह|मेरा स्थान|माझे स्थान|सध्याचे ठिकाण)/.test(normalized)) {
          try {
            const position = await capturePosition();
            setReportDraft(current => current ? {
              ...current,
              locationName: languageText(lang, 'GPS location', 'GPS स्थान', 'GPS ठिकाण'),
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              phase: 'description'
            } : current);
            say(languageText(lang, 'Location captured from your device. Briefly describe what happened.', 'आपके उपकरण से स्थान मिला। क्या हुआ, संक्षेप में बताएं।', 'तुमच्या उपकरणातून ठिकाण मिळाले. काय घडले ते थोडक्यात सांगा.'));
          } catch {
            say(languageText(lang, 'Location access was not available. Please name the affected road, or try GPS again.', 'स्थान अनुमति नहीं मिली। प्रभावित सड़क का नाम बताएं या GPS फिर आज़माएं।', 'स्थान परवानगी मिळाली नाही. प्रभावित रस्ता सांगा किंवा GPS पुन्हा वापरा.'));
          }
          return;
        }
        const roadName = findRoadMention(text, roads.map(road => road.name));
        if (roadName) {
          const road = roads.find(item => item.name === roadName);
          const point = road?.coordinates[Math.floor((road.coordinates.length - 1) / 2)];
          if (road && point) {
            setReportDraft(current => current ? {
              ...current,
              locationName: roadName,
              roadId: road.id,
              lat: point[0],
              lng: point[1],
              phase: 'description'
            } : current);
            say(languageText(lang, `Using the mapped road location ${roadName}. Briefly describe what happened.`, `मानचित्र पर दर्ज ${roadName} स्थान इस्तेमाल कर रहा हूँ। क्या हुआ, संक्षेप में बताएं।`, `नकाशावरील ${roadName} ठिकाण वापरत आहे. काय घडले ते थोडक्यात सांगा.`));
            return;
          }
        }
        setReportDraft(current => current ? { ...current, locationName: text.trim() } : current);
        say(languageText(lang, 'I heard that location name. To attach real coordinates, say use my current location or name a mapped road.', 'स्थान का नाम सुना। वास्तविक निर्देशांक के लिए मेरी वर्तमान जगह कहें या मानचित्र की सड़क बताएं।', 'ठिकाणाचे नाव ऐकले. प्रत्यक्ष निर्देशांकांसाठी माझे सध्याचे स्थान वापरा किंवा नकाशावरील रस्ता सांगा.'));
        return;
      }
      if (reportDraft.phase === 'description') {
        setReportDraft(current => current ? { ...current, description: text.trim(), phase: 'severity' } : current);
        say(languageText(lang, 'How severe is it: low, moderate, high, or critical?', 'गंभीरता बताएं: कम, मध्यम, अधिक या अत्यंत गंभीर?', 'तीव्रता सांगा: कमी, मध्यम, जास्त किंवा गंभीर?'));
        return;
      }
      if (reportDraft.phase === 'severity') {
        const severity = severityFromText(text);
        if (!severity) {
          say(languageText(lang, 'Please say low, moderate, high, or critical.', 'कृपया कम, मध्यम, अधिक या अत्यंत गंभीर कहें।', 'कृपया कमी, मध्यम, जास्त किंवा गंभीर असे सांगा.'));
          return;
        }
        const completed = { ...reportDraft, severity, phase: 'confirmation' as const };
        setReportDraft(completed);
        say(languageText(
          lang,
          `Please confirm this report: ${completed.reportType} at ${completed.locationName}, severity ${severity}. Description: ${completed.description}. Say confirm to submit, or cancel.`,
          `कृपया रिपोर्ट की पुष्टि करें: ${completed.locationName} पर ${completed.reportType}, गंभीरता ${severity}। विवरण: ${completed.description}। जमा करने के लिए हाँ कहें, रद्द करने के लिए रद्द कहें।`,
          `अहवाल तपासा: ${completed.locationName} येथे ${completed.reportType}, तीव्रता ${severity}. तपशील: ${completed.description}. पाठवण्यासाठी हो म्हणा, रद्द करण्यासाठी रद्द म्हणा.`
        ));
        return;
      }
      const intent = recognizeVoiceIntent(text);
      if (intent === 'cancel') {
        setReportDraft(null);
        say(languageText(lang, 'Report cancelled. Nothing was submitted.', 'रिपोर्ट रद्द हुई। कुछ जमा नहीं हुआ।', 'अहवाल रद्द केला. काहीही पाठवले नाही.'));
      } else if (intent === 'confirm') {
        await submitReport();
      } else {
        say(languageText(lang, 'Please say confirm to submit this report, or cancel.', 'जमा करने के लिए पुष्टि कहें, या रद्द कहें।', 'अहवाल पाठवण्यासाठी हो म्हणा किंवा रद्द म्हणा.'));
      }
      return;
    }

    if (pendingContactAction) {
      if (Date.now() - pendingContactAction.createdAt > 60_000) {
        setPendingContactAction(null);
      } else {
        const contactIntent = recognizeVoiceIntent(text);
        if (contactIntent === 'cancel') {
          setPendingContactAction(null);
          say(languageText(lang, 'Cancelled. I did not open the dialer.', 'रद्द किया। मैंने डायलर नहीं खोला।', 'रद्द केले. डायलर उघडला नाही.'));
          return;
        }
        if (pendingContactAction.stage === 'choose-contact') {
          startEmergencyContactRequest(text, pendingContactAction.contacts);
          return;
        }
        if (pendingContactAction.stage === 'choose-number') {
          const spokenNumbers = getEmergencyDialNumbers(text);
          const selectedNumber = pendingContactAction.numbers.find(number =>
            spokenNumbers.some(spoken => spoken.replace(/\D/g, '') === number.replace(/\D/g, ''))
          );
          const selectedIndex = /\b(first|1st)\b|पहला|पहिली|पहिला/.test(normalizeVoiceText(text))
            ? 0
            : /\b(second|2nd)\b|दूसरा|दूसरी|दुसरा/.test(normalizeVoiceText(text))
            ? 1
            : -1;
          const number = selectedNumber || pendingContactAction.numbers[selectedIndex];
          if (!number) {
            say(languageText(
              lang,
              `Please choose one of these directory numbers: ${pendingContactAction.numbers.join(' or ')}. Say cancel to stop.`,
              `कृपया निर्देशिका के नंबरों में से चुनें: ${pendingContactAction.numbers.join(' या ')}। रद्द करने के लिए रद्द कहें।`,
              `कृपया निर्देशिकेतील क्रमांक निवडा: ${pendingContactAction.numbers.join(' किंवा ')}. थांबण्यासाठी रद्द म्हणा.`
            ));
            return;
          }
          setPendingContactAction({
            stage: 'confirm',
            contact: pendingContactAction.contact,
            number,
            createdAt: Date.now()
          });
          say(languageText(
            lang,
            `You selected ${number} for ${pendingContactAction.contact.name}. Say yes to open the device dialer, or cancel.`,
            `${pendingContactAction.contact.name} के लिए ${number} चुना। डायलर खोलने के लिए हाँ कहें, या रद्द करें।`,
            `${pendingContactAction.contact.name} साठी ${number} निवडला. डायलर उघडण्यासाठी हो म्हणा, किंवा रद्द करा.`
          ));
          return;
        }
        if (contactIntent === 'confirm') {
          const { contact, number } = pendingContactAction;
          setPendingContactAction(null);
          say(languageText(
            lang,
            `Opening your device dialer for ${contact.name}, ${number}. The call is not complete until you place it.`,
            `${contact.name}, ${number} के लिए डायलर खोल रहा हूँ। कॉल तभी पूरा होगा जब आप कॉल करेंगे।`,
            `${contact.name}, ${number} साठी डायलर उघडत आहे. तुम्ही कॉल केल्यावरच कॉल सुरू होईल.`
          ));
          window.location.href = `tel:${number}`;
          return;
        }
        if (contactIntent === 'repeat') {
          say(lastResponseRef.current);
          return;
        }
        say(languageText(
          lang,
          'Please say yes to open the device dialer, or cancel.',
          'डायलर खोलने के लिए हाँ कहें, या रद्द करें।',
          'डायलर उघडण्यासाठी हो म्हणा, किंवा रद्द करा.'
        ));
        return;
      }
    }

    const callRequested =
      /(^|\s)(call|phone|dial|ring)(\s|$)/.test(normalized) ||
      ['कॉल', 'फोन', 'लगाओ', 'फोन करा', 'कॉल करा', 'फोन लावा'].some(phrase => normalized.includes(phrase));
    if (callRequested) {
      sosRequestIdRef.current += 1;
      setPendingSos(null);
      startEmergencyContactRequest(text);
      return;
    }

    if (
      pendingSos &&
      ['confirm', 'failed', 'unavailable', 'submitted', 'queued'].includes(pendingSos.phase) &&
      matchEmergencyContacts(text, pendingSos.contacts).length > 0
    ) {
      setPendingSos(null);
      startEmergencyContactRequest(text, pendingSos.contacts);
      return;
    }

    if (
      pendingSos &&
      ['preparing', 'confirm', 'submitting', 'failed'].includes(pendingSos.phase) &&
      Date.now() - pendingSos.createdAt <= 60_000
    ) {
      const intent = recognizeVoiceIntent(text);
      if (intent === 'cancel') {
        if (pendingSos.phase === 'submitting') {
          say('SOS submission is already in progress. Wait for the backend result; cancellation may not stop a request already sent.');
        } else {
          if (pendingSos.phase === 'preparing') sosRequestIdRef.current += 1;
          setPendingSos(null);
          say(languageText(lang, 'Cancelled. No SOS was submitted.', 'रद्द किया। कोई SOS जमा नहीं हुआ।', 'रद्द केले. SOS सबमिट केले नाही.'));
        }
        return;
      }
      if (intent === 'repeat' && lastResponseRef.current) {
        say(lastResponseRef.current);
        return;
      }
      if (pendingSos.phase === 'preparing' || pendingSos.phase === 'submitting') {
        say(languageText(
          lang,
          pendingSos.phase === 'preparing' ? 'I am checking your location. Please wait, or say cancel.' : 'The backend request is in progress. Please wait for its result.',
          pendingSos.phase === 'preparing' ? 'स्थान जाँच रहा हूँ। कृपया प्रतीक्षा करें या रद्द कहें।' : 'बैकएंड अनुरोध जारी है। कृपया परिणाम की प्रतीक्षा करें।',
          pendingSos.phase === 'preparing' ? 'स्थान तपासत आहे. कृपया थांबा किंवा रद्द म्हणा.' : 'बॅकएंड विनंती सुरू आहे. कृपया निकालाची प्रतीक्षा करा.'
        ));
        return;
      }
      if (pendingSos.phase === 'confirm' && intent === 'confirm') {
        await submitConfirmedSos(pendingSos);
        return;
      }
      if (pendingSos.phase === 'failed' && intent === 'retry') {
        await submitConfirmedSos(pendingSos);
        return;
      }
      say(languageText(
        lang,
        pendingSos.phase === 'failed'
          ? 'The SOS request did not complete. Say retry to try the backend again, or call an emergency service directly.'
          : 'Please say confirm SOS to continue, or cancel. No request is sent until you confirm.',
        pendingSos.phase === 'failed'
          ? 'SOS अनुरोध पूरा नहीं हुआ। बैकएंड फिर आज़माने के लिए retry कहें, या सीधे आपातकालीन सेवा को कॉल करें।'
          : 'जारी रखने के लिए SOS की पुष्टि कहें, या रद्द करें। पुष्टि से पहले कोई अनुरोध नहीं भेजा जाता।',
        pendingSos.phase === 'failed'
          ? 'SOS विनंती पूर्ण झाली नाही. बॅकएंड पुन्हा प्रयत्न करण्यासाठी retry म्हणा किंवा आपत्कालीन सेवेला थेट कॉल करा.'
          : 'पुढे जाण्यासाठी SOS पुष्टी करा किंवा रद्द करा. पुष्टीपूर्वी विनंती पाठवली जात नाही.'
      ));
      return;
    }

    if (
      pendingSos &&
      ['preparing', 'confirm', 'submitting', 'failed'].includes(pendingSos.phase) &&
      Date.now() - pendingSos.createdAt > 60_000
    ) {
      setPendingSos(null);
    }

    const intent = recognizeVoiceIntent(text);
    if (intent === 'unknown' && routeContext && (!routeContext.originId || !routeContext.destinationId)) {
      await selectRouteNodes(text, routeContext.mode);
      return;
    }
    if (intent === 'repeat') {
      if (lastResponseRef.current) say(lastResponseRef.current);
      else say(languageText(lang, 'There is no earlier response to repeat.', 'दोहराने के लिए पिछला जवाब नहीं है।', 'पुन्हा सांगण्यासाठी आधीचे उत्तर नाही.'));
      return;
    }
    if (intent === 'cancel') {
      setRouteContext(null);
      say(languageText(lang, 'Okay, cancelled.', 'ठीक है, रद्द किया।', 'ठीक आहे, रद्द केले.'));
      return;
    }
    if (intent === 'confirm') {
      say(languageText(lang, 'There is nothing waiting for confirmation.', 'पुष्टि के लिए कुछ लंबित नहीं है।', 'पुष्टीसाठी काहीही प्रलंबित नाही.'));
      return;
    }
    if (intent === 'emergency') {
      await beginSosConfirmation(text);
      return;
    }
    if (intent === 'route' || intent === 'route-status') {
      if (
        intent === 'route' &&
        /(second|other|alternate|दूसरा|दूसरे|अन्य|दुसरा|पर्यायी)/.test(normalized) &&
        activeRoute?.activeMode === 'safest' &&
        activeRoute.alternatives.length > 1
      ) {
        onSelectRoute('safest', 1);
        const alternative = activeRoute.alternatives[1];
        say(languageText(
          lang,
          `Showing the second available safest route: ${alternative.totalDistanceKm.toFixed(1)} kilometres, about ${Math.round(alternative.travelTimeMins)} minutes.`,
          `दूसरा उपलब्ध कम जोखिम वाला मार्ग दिखा रहा हूँ: ${alternative.totalDistanceKm.toFixed(1)} किलोमीटर, लगभग ${Math.round(alternative.travelTimeMins)} मिनट।`,
          `दुसरा उपलब्ध कमी जोखीम मार्ग दाखवत आहे: ${alternative.totalDistanceKm.toFixed(1)} किलोमीटर, अंदाजे ${Math.round(alternative.travelTimeMins)} मिनिटे.`
        ));
        return;
      }
      const mode = recognizeRouteMode(text);
      if (intent === 'route-status') {
        if (!activeRoute?.selectedRoute?.feasible) {
          say(languageText(lang, 'There is no calculated route to check yet. Tell me the starting place and destination.', 'जाँचने के लिए अभी कोई मार्ग नहीं है। शुरू करने की जगह और गंतव्य बताएं।', 'तपासण्यासाठी मार्ग नाही. सुरुवातीचे ठिकाण आणि गंतव्य सांगा.'));
          return;
        }
        const route = activeRoute.selectedRoute;
        const counts = getRouteRiskCounts(route);
        const closed = route.edges.filter(edge => edge.status === 'CLOSED').length;
        const high = counts.high + counts.severe;
        say(languageText(
          lang,
          `The selected ${activeRoute.activeMode} route is ${route.totalDistanceKm.toFixed(1)} kilometres and about ${Math.round(route.travelTimeMins)} minutes. It has ${closed} closed segments, ${high} high or severe estimated-risk segments, and ${counts.unknown} unknown-risk segments. Risk estimates are not a safety guarantee.`,
          `चुना हुआ ${activeRoute.activeMode} मार्ग ${route.totalDistanceKm.toFixed(1)} किलोमीटर और लगभग ${Math.round(route.travelTimeMins)} मिनट का है। इसमें ${closed} बंद, ${high} उच्च/गंभीर अनुमानित जोखिम वाले और ${counts.unknown} अज्ञात जोखिम वाले खंड हैं। जोखिम अनुमान सुरक्षा की गारंटी नहीं है।`,
          `निवडलेला ${activeRoute.activeMode} मार्ग ${route.totalDistanceKm.toFixed(1)} किलोमीटरचा आणि अंदाजे ${Math.round(route.travelTimeMins)} मिनिटांचा आहे. यात ${closed} बंद, ${high} उच्च/गंभीर अंदाजित जोखीम असलेले आणि ${counts.unknown} अज्ञात जोखीम असलेले भाग आहेत. जोखीम अंदाज सुरक्षिततेची हमी नाही.`
        ));
        return;
      }
      await selectRouteNodes(text, mode);
      return;
    }
    if (intent === 'shelters' || intent === 'hospitals') {
      const wantsPets = /(pet|pets|पालतू|पाळीव)/.test(normalized);
      const wantsWheelchair = /(wheelchair|accessible|व्हीलचेयर|व्हीलचेअर)/.test(normalized);
      const wantsElderly = /(elderly|senior|बुजुर्ग|वृद्ध|ज्येष्ठ)/.test(normalized);
      let location: GeolocationPosition | null = null;
      if (/(near me|nearby|nearest|मेरे पास|मेरे नजदीक|जवळ|माझ्या जवळ)/.test(normalized)) {
        try {
          location = await capturePosition();
        } catch {
          say(languageText(lang, 'I could not access your location. Allow location access or tell me a neighbourhood.', 'आपकी जगह नहीं मिल सकी। स्थान अनुमति दें या इलाका बताएं।', 'तुमचे ठिकाण मिळाले नाही. स्थान परवानगी द्या किंवा परिसर सांगा.'));
          return;
        }
      }
      if (intent === 'shelters') {
        let matches = shelters.filter(shelter =>
          (!wantsPets || shelter.petFriendly) && (!wantsWheelchair || shelter.wheelchairAccessible)
        );
        if (location) {
          matches = matches.sort((a, b) =>
            distanceMeters(location!.coords.latitude, location!.coords.longitude, a.lat, a.lng) -
            distanceMeters(location!.coords.latitude, location!.coords.longitude, b.lat, b.lng)
          );
        }
        onFilterShelters({ petFriendly: wantsPets, wheelchairAccessible: wantsWheelchair });
        onNavigate('dashboard');
        onShowMapLayer(
          'shelters',
          location ? [location.coords.latitude, location.coords.longitude] : undefined
        );
        const nearest = matches.slice(0, 3);
        const details = nearest.map(shelter =>
          `${shelter.name}, ${shelter.address}, ${shelter.currentOccupancy} of ${shelter.capacity} places occupied${shelter.petFriendly ? ', pets accepted' : ''}${shelter.wheelchairAccessible ? ', wheelchair accessible' : ''}`
        ).join('. ');
        const limitation = wantsElderly
          ? languageText(lang, ' The shelter data does not include a separate elderly-support field.', ' आश्रय डेटा में बुजुर्ग सहायता का अलग विवरण नहीं है।', ' निवारा डेटामध्ये ज्येष्ठांसाठी स्वतंत्र सुविधा माहिती नाही.')
          : '';
        say(matches.length
          ? languageText(lang, `Showing ${matches.length} matching shelters. ${details}.${limitation}`, `${matches.length} मेल खाते आश्रय दिखा रहा हूँ। ${details}.${limitation}`, `${matches.length} जुळणारे निवारे दाखवत आहे. ${details}.${limitation}`)
          : languageText(lang, 'No shelters match those available filters.', 'इन उपलब्ध फ़िल्टर से कोई आश्रय नहीं मिला।', 'या उपलब्ध निकषांशी जुळणारे निवारे नाहीत.'));
      } else {
        const matches = location
          ? [...hospitals].sort((a, b) =>
              distanceMeters(location!.coords.latitude, location!.coords.longitude, a.lat, a.lng) -
              distanceMeters(location!.coords.latitude, location!.coords.longitude, b.lat, b.lng)
            )
          : hospitals;
        onNavigate('dashboard');
        onShowMapLayer(
          'hospitals',
          location ? [location.coords.latitude, location.coords.longitude] : undefined
        );
        const list = matches.slice(0, 3).map(hospital =>
          `${hospital.name}, ${hospital.type}, ${hospital.availableIcu} ICU beds available`
        ).join('. ');
        say(matches.length
          ? languageText(lang, `Showing ${matches.length} hospitals. ${list}.`, `${matches.length} अस्पताल दिखा रहा हूँ। ${list}।`, `${matches.length} रुग्णालये दाखवत आहे. ${list}.`)
          : languageText(lang, 'No hospital data is available right now.', 'अभी अस्पताल का डेटा उपलब्ध नहीं है।', 'सध्या रुग्णालयांची माहिती उपलब्ध नाही.'));
      }
      return;
    }
    if (intent === 'community-reports') {
      let activeReports = reports.filter(report => report.verificationStatus !== 'Rejected' && report.verificationStatus !== 'Resolved');
      let reportLocation: GeolocationPosition | null = null;
      if (/(near me|nearby|मेरा पास|मेरे पास|माझ्या जवळ)/.test(normalized)) {
        try {
          const position = await capturePosition();
          reportLocation = position;
          activeReports = [...activeReports].sort((a, b) =>
            distanceMeters(position.coords.latitude, position.coords.longitude, a.lat, a.lng) -
            distanceMeters(position.coords.latitude, position.coords.longitude, b.lat, b.lng)
          );
        } catch {
          say(languageText(lang, 'I could not access your location, so I cannot identify reports near you. The community report section is still available.', 'आपकी जगह नहीं मिल सकी, इसलिए पास की रिपोर्ट नहीं पहचान सकता। समुदाय रिपोर्ट अनुभाग उपलब्ध है।', 'तुमचे ठिकाण मिळाले नाही, त्यामुळे जवळचे अहवाल ओळखता येणार नाहीत. समुदाय अहवाल विभाग उपलब्ध आहे.'));
          onNavigate('community');
          onShowMapLayer('reports');
          return;
        }
      }
      onNavigate('community');
      onShowMapLayer(
        'reports',
        reportLocation ? [reportLocation.coords.latitude, reportLocation.coords.longitude] : undefined
      );
      const details = activeReports.slice(0, 3).map(report =>
        `${report.reportType} at ${report.locationName}, ${report.verificationStatus}`
      ).join('. ');
      say(activeReports.length
        ? languageText(lang, `${activeReports.length} active community reports are shown. Verification status is stated for each report. ${details}.`, `${activeReports.length} सक्रिय समुदाय रिपोर्ट दिख रही हैं। हर रिपोर्ट का सत्यापन दर्ज है। ${details}।`, `${activeReports.length} सक्रिय समुदाय अहवाल दाखवले आहेत. प्रत्येकाचा पडताळणी दर्जा दिला आहे. ${details}.`)
        : languageText(lang, 'There are no active community reports in the current data.', 'वर्तमान डेटा में सक्रिय समुदाय रिपोर्ट नहीं हैं।', 'सध्याच्या डेटामध्ये सक्रिय समुदाय अहवाल नाहीत.'));
      return;
    }
    if (intent === 'submit-report') {
      const draft: ReportDraft = {
        phase: 'location',
        reportType: reportTypeFromText(text)
      };
      setReportDraft(draft);
      onNavigate('community');
      say(languageText(lang, `I can help prepare a ${draft.reportType} report. Say the mapped road or landmark, or say use my current location. Nothing will be submitted without your final confirmation.`, `${draft.reportType} रिपोर्ट तैयार करने में मदद करूँगा। मानचित्र की सड़क/स्थान बताएं या वर्तमान जगह का उपयोग कहें। आपकी पुष्टि के बिना रिपोर्ट जमा नहीं होगी।`, `${draft.reportType} अहवाल तयार करण्यात मदत करतो. नकाशावरील रस्ता/ठिकाण सांगा किंवा सध्याचे स्थान वापरा असे म्हणा. तुमच्या अंतिम पुष्टीशिवाय अहवाल पाठवला जाणार नाही.`));
      return;
    }
    if (intent === 'my-reports') {
      onNavigate('my-reports');
      const details = myReports.slice(0, 3).map(report =>
        `${report.locationName}, ${report.reportType}, status ${report.verificationStatus}`
      ).join('. ');
      say(myReports.length
        ? languageText(lang, `You have ${myReports.length} submitted reports. ${details}.`, `आपकी ${myReports.length} रिपोर्टें हैं। ${details}।`, `तुमचे ${myReports.length} अहवाल आहेत. ${details}.`)
        : languageText(lang, 'You have no reports in your account data.', 'आपके खाते में कोई रिपोर्ट नहीं है।', 'तुमच्या खात्यात अहवाल नाहीत.'));
      return;
    }
    if (intent === 'alerts') {
      onNavigate('alerts');
      const details = notifications.slice(0, 3).map(notification =>
        `${notification.severity} alert: ${notification.title}. ${notification.message}`
      ).join('. ');
      say(notifications.length
        ? languageText(lang, `There are ${notifications.length} alerts or notifications. ${details}.`, `${notifications.length} अलर्ट या सूचनाएँ हैं। ${details}।`, `${notifications.length} सूचना किंवा अलर्ट आहेत. ${details}.`)
        : languageText(lang, 'There are no alerts or notifications in the current data.', 'वर्तमान डेटा में कोई अलर्ट या सूचना नहीं है।', 'सध्याच्या डेटामध्ये सूचना किंवा अलर्ट नाहीत.'));
      return;
    }
    if (intent === 'sources') {
      onNavigate('dashboard');
      say(languageText(
        lang,
        'Citizen data transparency is on the dashboard. Full technical source diagnostics are available only in the Expert portal. Modelled road risk is an estimate, not a street-level sensor reading.',
        'नागरिक डेटा पारदर्शकता डैशबोर्ड पर है। विस्तृत तकनीकी स्रोत जाँच केवल विशेषज्ञ पोर्टल में उपलब्ध है। सड़क जोखिम मॉडल का अनुमान है, सड़क पर लगे सेंसर की रीडिंग नहीं।',
        'नागरिक डेटा पारदर्शकता डॅशबोर्डवर आहे. संपूर्ण तांत्रिक स्रोत तपशील फक्त तज्ज्ञ पोर्टलमध्ये उपलब्ध आहेत. रस्त्याची जोखीम हा मॉडेल अंदाज आहे, रस्त्यावरील सेन्सर मोजमाप नाही.'
      ));
      return;
    }
    setStatus('processing');
    await askGemini(text);
  }

  transcriptHandlerRef.current = handleTranscript;

  useEffect(() => {
    if (!isOpen) {
      startedForOpenRef.current = false;
      stopListening();
      cleanupGeminiLive(false);
      stopSpeaking();
      return;
    }
    if (startedForOpenRef.current) return;
    startedForOpenRef.current = true;
    setStatus('ready');
    void checkMicrophonePermission().then(setPermission);
    startListening();
  }, [isOpen, startListening, stopListening, cleanupGeminiLive]);

  useEffect(() => {
    if (!pendingContactAction) return;
    const remaining = Math.max(0, 60_000 - (Date.now() - pendingContactAction.createdAt));
    const timeoutId = window.setTimeout(() => setPendingContactAction(null), remaining);
    return () => window.clearTimeout(timeoutId);
  }, [pendingContactAction]);

  useEffect(() => {
    if (!pendingSos || !['preparing', 'confirm', 'submitting', 'failed'].includes(pendingSos.phase)) return;
    const requestId = pendingSos.id;
    const remaining = Math.max(0, 60_000 - (Date.now() - pendingSos.createdAt));
    const timeoutId = window.setTimeout(() => {
      if (sosRequestIdRef.current === requestId) sosRequestIdRef.current += 1;
      setPendingSos(current => current?.id === requestId ? null : current);
    }, remaining);
    return () => window.clearTimeout(timeoutId);
  }, [pendingSos]);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    cleanupGeminiLive(false);
    stopSpeaking();
  }, [cleanupGeminiLive]);

  const submitTypedCommand = (event: React.FormEvent) => {
    event.preventDefault();
    const text = textFallback.trim();
    if (!text) return;
    setTextFallback('');
    addMessage('user', text);
    setStatus('processing');
    void handleTranscript(text);
  };

  if (!isOpen) return null;

  const statusColor = status === 'error'
    ? 'text-red-300'
    : status === 'listening'
    ? 'text-cyan-300'
    : status === 'requesting'
    ? 'text-blue-300'
    : status === 'speaking'
    ? 'text-emerald-300'
    : status === 'processing'
    ? 'text-amber-300'
    : 'text-slate-300';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-sm sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-assistant-title"
    >
      <section className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-cyan-700/50 bg-slate-900 text-white shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-slate-700 bg-gradient-to-r from-blue-950 via-slate-900 to-cyan-950 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-cyan-500/15 p-2 text-cyan-300"><Bot className="h-5 w-5" /></span>
            <div>
              <h2 id="voice-assistant-title" className="text-sm font-bold sm:text-base">SanketSetu Voice Assistant</h2>
              <p className="text-[11px] text-slate-300">
                {liveConnected
                  ? 'Gemini Live is connected. Microphone audio is sent to Google for live conversation.'
                  : 'Browser speech recognition is the fallback. Connect Gemini Live for a direct voice conversation.'}
              </p>
            </div>
          </div>
          <button type="button" onClick={closeAssistant} aria-label="Close voice assistant" className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto p-4 sm:p-6">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-700 bg-slate-950/50 p-5 text-center">
            <button
              type="button"
              onClick={status === 'listening' ? stopListening : startListening}
              aria-label={status === 'listening' ? 'Stop browser speech recognition' : 'Start browser speech recognition'}
              aria-pressed={status === 'listening'}
              disabled={liveConnected || liveConnecting}
              className={`relative flex h-24 w-24 items-center justify-center rounded-full border-4 shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-cyan-300/40 ${
                status === 'listening'
                  ? 'border-cyan-200 bg-cyan-600 text-white animate-pulse'
                  : 'border-cyan-500/70 bg-blue-700 text-white'
              }`}
            >
              {status === 'listening' ? <MicOff className="h-9 w-9" /> : <Mic className="h-9 w-9" />}
              {status === 'listening' && <span className="absolute -inset-2 rounded-full border border-cyan-300/60 animate-ping" aria-hidden="true" />}
            </button>
            <p className={`text-sm font-semibold ${statusColor}`} role="status" aria-live="polite">{getUserFacingStatus(status, lang)}</p>
            <button
              type="button"
              onClick={liveConnected ? stopGeminiLive : () => void startGeminiLive()}
              disabled={liveConnecting}
              className="inline-flex items-center gap-2 rounded-lg border border-cyan-600/70 bg-cyan-950/60 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-900 disabled:cursor-wait disabled:opacity-60"
            >
              {liveConnecting && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
              {liveConnecting ? 'Connecting Gemini Live…' : liveConnected ? 'Disconnect Gemini Live' : 'Connect Gemini Live'}
            </button>
            <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1">
                {permission === 'granted' ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <AlertTriangle className="h-3 w-3 text-amber-300" />}
                Microphone: {permission}
              </span>
              {status === 'processing' && <span className="inline-flex items-center gap-1"><LoaderCircle className="h-3 w-3 animate-spin" /> Processing</span>}
              {status === 'speaking' && <span className="inline-flex items-center gap-1"><Volume2 className="h-3 w-3" /> Speaking</span>}
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              Language
              <select
                value={lang}
                onChange={event => {
                  if (recognitionRef.current || isStartingRef.current) stopListening();
                  if (liveConnected || liveConnecting) stopGeminiLive();
                  setLang(event.target.value as Language);
                }}
                aria-label="Speech language"
                className="rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="en">English (India)</option>
                <option value="hi">Hindi (India)</option>
                <option value="mr">Marathi (India)</option>
              </select>
            </label>
          </div>

          {transcript && (
            <div className="rounded-xl border border-cyan-900 bg-cyan-950/35 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-300">Live transcription</p>
              <p className="mt-1 text-sm text-white" aria-live="polite">{transcript}</p>
            </div>
          )}

          {pendingContactAction && (
            <section className="space-y-3 rounded-xl border border-red-700/70 bg-red-950/30 p-4" aria-label="Emergency contact confirmation">
              {pendingContactAction.stage === 'choose-contact' ? (
                <>
                  <h3 className="text-sm font-bold text-white">Choose an emergency contact</h3>
                  <div className="flex flex-wrap gap-2">
                    {pendingContactAction.contacts.map(contact => (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => promptContactConfirmation(contact)}
                        className="min-h-11 rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                      >
                        {contact.name}
                      </button>
                    ))}
                  </div>
                </>
              ) : pendingContactAction.stage === 'choose-number' ? (
                <>
                  <h3 className="text-sm font-bold text-white">{pendingContactAction.contact.name}</h3>
                  <p className="text-xs text-slate-300">Choose one of the numbers listed in the directory.</p>
                  <div className="flex flex-wrap gap-2">
                    {pendingContactAction.numbers.map(number => (
                      <button
                        key={number}
                        type="button"
                        onClick={() => {
                          setPendingContactAction({
                            stage: 'confirm',
                            contact: pendingContactAction.contact,
                            number,
                            createdAt: Date.now()
                          });
                          say(languageText(
                            lang,
                            `You selected ${number} for ${pendingContactAction.contact.name}. Confirm to open the device dialer.`,
                            `${pendingContactAction.contact.name} के लिए ${number} चुना। डायलर खोलने की पुष्टि करें।`,
                            `${pendingContactAction.contact.name} साठी ${number} निवडला. डायलर उघडण्याची पुष्टी करा.`
                          ));
                        }}
                        className="min-h-11 rounded-lg border border-slate-600 px-3 py-2 text-sm font-mono font-semibold text-white hover:bg-slate-800"
                      >
                        {number}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-sm font-bold text-white">Call {pendingContactAction.contact.name}?</h3>
                  <p className="text-sm text-slate-200">Directory number: <strong>{pendingContactAction.number}</strong></p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`tel:${pendingContactAction.number}`}
                      onClick={() => setPendingContactAction(null)}
                      aria-label={`Call ${pendingContactAction.contact.name} at ${pendingContactAction.number}`}
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600"
                    >
                      <PhoneCall className="h-4 w-4" />
                      Call Now
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingContactAction(null);
                        say(languageText(lang, 'Cancelled. I did not open the dialer.', 'रद्द किया। मैंने डायलर नहीं खोला।', 'रद्द केले. डायलर उघडला नाही.'));
                      }}
                      className="min-h-11 rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
              {pendingContactAction.stage !== 'confirm' && (
                <button
                  type="button"
                  onClick={() => {
                    setPendingContactAction(null);
                    say(languageText(lang, 'Cancelled. I did not open the dialer.', 'रद्द किया। मैंने डायलर नहीं खोला।', 'रद्द केले. डायलर उघडला नाही.'));
                  }}
                  className="min-h-11 rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Cancel
                </button>
              )}
            </section>
          )}

          {pendingSos && (
            <section className="space-y-3 rounded-xl border border-red-500 bg-red-950/60 p-4" role="alert" aria-label="Emergency SOS status">
              <h3 className="text-sm font-bold text-red-100">
                {pendingSos.phase === 'preparing'
                  ? 'Emergency request — checking location'
                  : pendingSos.phase === 'confirm'
                  ? 'Confirm SOS request'
                  : pendingSos.phase === 'submitting'
                  ? 'Checking SOS submission result'
                  : pendingSos.phase === 'submitted'
                  ? 'SOS backend response'
                  : pendingSos.phase === 'queued'
                  ? 'SOS saved locally — not transmitted'
                  : pendingSos.phase === 'failed'
                  ? 'SOS submission failed'
                  : 'SOS not transmitted'}
              </h3>
              <p className="text-sm text-red-100">Recognized request: {pendingSos.transcript}</p>
              {pendingSos.phase === 'preparing' && (
                <p className="text-sm text-red-100">Checking for a current device GPS fix. No request has been submitted.</p>
              )}
              {pendingSos.location ? (
                <p className="text-sm text-red-100">
                  Current GPS: {pendingSos.location.latitude.toFixed(5)}, {pendingSos.location.longitude.toFixed(5)}
                  {' '}({Math.round(pendingSos.location.accuracyM)} m accuracy)
                </p>
              ) : pendingSos.phase !== 'preparing' ? (
                <p className="text-sm text-red-100">Current GPS location is unavailable; no coordinates will be included.</p>
              ) : null}
              {pendingSos.result && (
                <p className="text-sm font-semibold text-white">
                  {pendingSos.result.message}
                  {pendingSos.result.status === 'submitted' &&
                    ` Dispatch status reported by backend: ${pendingSos.result.dispatchStatus}.`}
                </p>
              )}
              {pendingSos.phase === 'confirm' && (
                <>
                  <p className="text-xs text-red-100">
                    Confirming will submit this request only if a backend handler is configured. The backend response will be shown; confirmation does not mean rescue services are notified.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => { void submitConfirmedSos(pendingSos); }}
                      className="min-h-11 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-600"
                    >
                      Confirm SOS
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingSos(null);
                        say(languageText(lang, 'Cancelled. No SOS was submitted.', 'रद्द किया। कोई SOS जमा नहीं हुआ।', 'रद्द केले. SOS सबमिट केले नाही.'));
                      }}
                      className="min-h-11 rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
              {pendingSos.phase === 'failed' && (
                <button
                  type="button"
                  onClick={() => { void submitConfirmedSos(pendingSos); }}
                  className="min-h-11 rounded-lg bg-amber-700 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600"
                >
                  Retry SOS submission
                </button>
              )}
              {(pendingSos.phase === 'unavailable' || pendingSos.phase === 'submitted' || pendingSos.phase === 'queued') && (
                <button
                  type="button"
                  onClick={() => setPendingSos(null)}
                  className="min-h-11 rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Done
                </button>
              )}
              <div className="space-y-2 border-t border-red-800 pt-3">
                <h4 className="text-xs font-bold uppercase tracking-wide text-red-100">Emergency contacts from the directory</h4>
                {pendingSos.contacts.map(contact => (
                  <div key={contact.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-950/50 p-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{contact.name}</p>
                      <p className="text-xs text-slate-300">{contact.contact}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => promptContactConfirmation(contact)}
                      className="min-h-11 rounded-lg border border-slate-600 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
                      aria-label={`Choose ${contact.name}; confirmation is required before dialing`}
                    >
                      Choose to call
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="max-h-52 space-y-2 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950/50 p-3" aria-label="Conversation" aria-live="polite">
            {messages.length === 0 && <p className="text-xs text-slate-400">Ask about routes, shelters, hospitals, reports, alerts, or other flood-safety questions. Free-form questions use the backend assistant; speech recognition and spoken replies use browser speech services.</p>}
            {messages.slice(-8).map(message => (
              <div key={message.id} className={`rounded-lg px-3 py-2 text-sm ${message.role === 'user' ? 'ml-6 bg-blue-950/70 text-blue-100' : 'mr-6 bg-slate-800 text-slate-100'}`}>
                <span className="mr-1 text-[10px] font-bold uppercase text-cyan-300">{message.role === 'user' ? 'You' : 'SanketSetu'}</span>
                <p>{message.text}</p>
              </div>
            ))}
          </div>

          {notice && <p className="rounded-lg border border-amber-700/60 bg-amber-950/40 p-3 text-xs text-amber-200" role="alert">{notice}</p>}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={stopListening} disabled={status !== 'listening'} className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40">Stop listening</button>
            <button type="button" onClick={() => lastResponseRef.current && say(lastResponseRef.current)} disabled={!lastResponseRef.current} className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40">Repeat response</button>
            <button type="button" onClick={() => { stopSpeaking(); setStatus('ready'); }} className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800">Stop speaking</button>
          </div>

          {isSpeechRecognitionSupported() && permission !== 'denied' && status !== 'error' && !notice && (
            <button
              type="button"
              onClick={() => {
                stopListening();
                setShowTextFallback(value => !value);
              }}
              aria-expanded={showTextFallback}
              className="text-xs font-semibold text-cyan-300 underline underline-offset-2"
            >
              {showTextFallback ? 'Hide text input' : 'Use text input instead'}
            </button>
          )}

          {(!isSpeechRecognitionSupported() || permission === 'denied' || status === 'error' || Boolean(notice) || showTextFallback) && (
            <form onSubmit={submitTypedCommand} className="flex gap-2">
              <input
                value={textFallback}
                onChange={event => setTextFallback(event.target.value)}
                aria-label="Command fallback"
                placeholder="Voice is unavailable. Type a command instead."
                className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
              />
              <button type="submit" className="rounded-xl bg-cyan-700 px-4 py-2 text-sm font-bold hover:bg-cyan-600">Run</button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
};
