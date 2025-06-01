import React, { createContext, useContext, useState, useCallback } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

/**
 * Context shape:
 * {
 *   recognizing: boolean,
 *   transcript:  string,
 *   start: () => Promise<void>,
 *   stop:  () => void
 * }
 */
const VoiceContext = createContext(null);

export function VoiceProvider({ children }) {
  const [recognizing, setRecognizing] = useState(false);
  const [transcript, setTranscript] = useState('');

  // ─── Event listeners ──────────────────────────────────────────────────────────
  useSpeechRecognitionEvent('start', () => setRecognizing(true));
  useSpeechRecognitionEvent('end',   () => setRecognizing(false));

  useSpeechRecognitionEvent('result', e =>
    setTranscript(e.results[0]?.transcript ?? '')
  );

  useSpeechRecognitionEvent('error', e =>
    console.warn('speech-error:', e.error, e.message)
  );

  // ─── Public API ───────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    const { granted } =
      await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      console.warn('Microphone permission not granted');
      return;
    }
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: false,
    });
  }, []);

  const stop = useCallback(() => ExpoSpeechRecognitionModule.stop(), []);

  const value = { recognizing, transcript, start, stop };

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export const useVoice = () => {
  const ctx = useContext(VoiceContext);
  if (!ctx) {
    throw new Error('useVoice must be used inside <VoiceProvider>');
  }
  return ctx;
};
