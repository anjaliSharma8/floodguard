import { Language } from '../types';

export function speakText(text: string, lang: Language = 'en'): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    console.warn('Speech synthesis not supported in this browser.');
    return;
  }

  window.speechSynthesis.cancel(); // Stop any ongoing speech

  const utterance = new SpeechSynthesisUtterance(text);
  const langCode = lang === 'hi' ? 'hi-IN' : (lang === 'mr' ? 'mr-IN' : 'en-IN');
  utterance.lang = langCode;
  utterance.rate = 0.95;
  utterance.pitch = 1.0;

  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export interface SpeechRecognitionListener {
  onResult: (transcript: string) => void;
  onError: (error: string) => void;
  onEnd: () => void;
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
    listener.onError('Speech recognition not supported in this browser. Please use text input.');
    return null;
  }

  try {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = lang === 'hi' ? 'hi-IN' : (lang === 'mr' ? 'mr-IN' : 'en-IN');

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      listener.onResult(transcript);
    };

    recognition.onerror = (event: any) => {
      listener.onError(event.error || 'Speech recognition failed');
    };

    recognition.onend = () => {
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
    listener.onError(err.message || 'Could not initiate speech recognition');
    return null;
  }
}
