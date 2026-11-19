import { Language } from '../types';

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
  );
}

export function speakText(
  text: string,
  lang: Language = 'en',
  onError?: (msg: string) => void
): boolean {
  if (!isSpeechSynthesisSupported()) {
    onError?.('Text-to-speech is not supported in this browser.');
    return false;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const langCode = lang === 'hi' ? 'hi-IN' : lang === 'mr' ? 'mr-IN' : 'en-IN';
    utterance.lang = langCode;
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    // Pick matching voice if available
    const voices = window.speechSynthesis.getVoices?.() || [];
    const matched = voices.find(v => v.lang.toLowerCase().startsWith(langCode.toLowerCase().slice(0, 2)));
    if (matched) utterance.voice = matched;

    utterance.onerror = () => {
      onError?.('Audio playback failed on this device.');
    };

    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    onError?.('Unable to initiate voice playback.');
    return false;
  }
}

export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported()) {
    window.speechSynthesis.cancel();
  }
}

export interface SpeechRecognitionListener {
  onResult: (transcript: string) => void;
  onError: (error: string) => void;
  onEnd: () => void;
}

export async function checkMicrophonePermission(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return 'unknown';
  }
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return status.state;
  } catch {
    return 'unknown';
  }
}

export function startSpeechRecognition(
  lang: Language,
  listener: SpeechRecognitionListener
): { stop: () => void } | null {
  if (typeof window === 'undefined') return null;

  const SpeechRecognition =
    (window as unknown as { SpeechRecognition?: any }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    listener.onError('Speech recognition is unavailable in this browser. Use the text command bar instead.');
    return null;
  }

  try {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.lang = lang === 'hi' ? 'hi-IN' : lang === 'mr' ? 'mr-IN' : 'en-IN';

    let received = false;

    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (!transcript) {
        listener.onError('No speech detected. Please try speaking again or type your command.');
        return;
      }
      received = true;
      listener.onResult(transcript);
    };

    recognition.onerror = (event: any) => {
      const code = event?.error;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        listener.onError('Microphone permission denied. Please enable microphone access or use the text command bar.');
      } else if (code === 'no-speech') {
        listener.onError('No speech detected. Please speak clearly near your microphone.');
      } else if (code === 'network') {
        listener.onError('Speech recognition network error. Use the text command input instead.');
      } else {
        listener.onError(`Voice recognition error (${code || 'unknown'}). Use text input.`);
      }
    };

    recognition.onend = () => {
      if (!received) {
        // Ensure UI exits listening state cleanly even on empty capture
      }
      listener.onEnd();
    };

    recognition.start();

    return {
      stop: () => {
        try {
          recognition.stop();
        } catch {
          // ignore
        }
      }
    };
  } catch (err: any) {
    listener.onError(err?.message || 'Could not initiate speech recognition.');
    return null;
  }
}
