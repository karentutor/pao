import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
} from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

const VoiceContext = createContext(null);

export function VoiceProvider({ children }) {
  /* ─── State & refs ──────────────────────────────────────────────── */
  const [recognizing, setRecognizing] = useState(false);
  const [transcript,  setTranscript]  = useState('');
  const listeningRef                 = useRef(false);  // true while mic active

  /* ─── Low-level starter — keeps settings in one place ───────────── */
  const _startRecognizer = async () => {
    await ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: true,          // keep mic open
    });
  };

  /* ─── Native events ─────────────────────────────────────────────── */
  useSpeechRecognitionEvent('start', () => setRecognizing(true));

  // Some devices fire "end" even in continuous mode → auto-restart
  useSpeechRecognitionEvent('end', async () => {
    if (listeningRef.current) {
      try { await _startRecognizer(); }
      catch { listeningRef.current = false; setRecognizing(false); }
    }
  });

  /*  The expo-speech-recognition "result" object can look like either:
      • event.value → ["hello world"]
      • event.results → [{ transcript: "hello world", … }, …]
      We normalise both cases and always APPEND within one screen.  */
  useSpeechRecognitionEvent('result', (e) => {
    const latest =
      (Array.isArray(e.value) && e.value[0]) ||
      (Array.isArray(e.results) && e.results.slice(-1)[0]?.transcript) ||
      '';
    if (latest) {
      setTranscript(prev => (prev ? `${prev} ${latest}` : latest));
    }
  });

  useSpeechRecognitionEvent('error', (e) =>
    console.warn('speech-error:', e.error, e.message)
  );

  /* ─── Public API for screens ────────────────────────────────────── */
  const start = useCallback(async () => {
    if (listeningRef.current) return;          // already running
    setTranscript('');                         // reset buffer on focus
    setRecognizing(true);
    listeningRef.current = true;

    const { granted } =
      await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      listeningRef.current = false;
      setRecognizing(false);
      console.warn('Microphone permission not granted');
      return;
    }
    try { await _startRecognizer(); }
    catch (err) {
      listeningRef.current = false;
      setRecognizing(false);
      console.warn('Could not start recogniser:', err);
    }
  }, []);

  const stop = useCallback(async () => {
    if (!listeningRef.current) return;
    listeningRef.current = false;
    setRecognizing(false);
    try { await ExpoSpeechRecognitionModule.stop(); } catch {}
  }, []);

  return (
    <VoiceContext.Provider value={{ recognizing, transcript, start, stop }}>
      {children}
    </VoiceContext.Provider>
  );
}

/* Hook for consumers */
export const useVoice = () => {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice must be used inside <VoiceProvider>');
  return ctx;
};
