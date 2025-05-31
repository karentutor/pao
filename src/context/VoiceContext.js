import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { AppState } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

const VoiceContext = createContext({
  transcript: '',
  recognizing: false,
});

export const VoiceProvider = ({ children }) => {
  const [transcript, setTranscript] = useState('');
  const [recognizing, setRecognizing] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);

  /** Ask for permission (only once) and start listening */
  const startRecognition = useCallback(async () => {
    if (recognizing) return;

    // Ask at first launch or after the user previously denied.
    if (!permissionGranted) {
      const { granted } =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) return;
      setPermissionGranted(true);
    }

    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: true, // keep listening for new segments
    });
  }, [recognizing, permissionGranted]);

  /* ---------- Native event hooks ---------- */
  useSpeechRecognitionEvent('start', () => setRecognizing(true));

  useSpeechRecognitionEvent('end', () => {
    setRecognizing(false);
    // Immediately restart so the app is “always on”
    startRecognition();
  });

  useSpeechRecognitionEvent('result', (event) => {
    // Combine all alternatives into one user-friendly string
    const text = event.results.map((r) => r.transcript).join(' ');
    setTranscript((prev) => `${prev} ${text}`.trim());
  });

  useSpeechRecognitionEvent('error', (event) => {
    console.warn('Speech-error:', event.error, event.message);
    setRecognizing(false);
    // Most errors are transient – try again after a short delay
    setTimeout(() => startRecognition(), 1_000);
  });

  /* ---------- App life-cycle handling ---------- */
  useEffect(() => {
    startRecognition(); // first launch

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') startRecognition();
      else if (recognizing) ExpoSpeechRecognitionModule.stop();
    });

    return () => {
      sub.remove();
      ExpoSpeechRecognitionModule.abort(); // tidy up
    };
  }, [startRecognition, recognizing]);

  return (
    <VoiceContext.Provider value={{ transcript, recognizing }}>
      {children}
    </VoiceContext.Provider>
  );
};

export const useVoice = () => useContext(VoiceContext);

