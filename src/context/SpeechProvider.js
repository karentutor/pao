import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { Alert } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

/* ---------- context ---------- */
const SpeechContext = createContext({
  recognizing: false,
  transcript: '',
  startRecognition: () => {},
  stopRecognition: () => {},
});

export const SpeechProvider = ({ children }) => {
  const [recognizing, setRecognizing] = useState(false);
  const [transcript,  setTranscript]  = useState('');
  const sessionActiveRef = useRef(false); // protect against double-start

  /* ----- helpers ----- */
  const startRecognition = useCallback(async () => {
    if (sessionActiveRef.current) return;

    const { granted } =
      await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      Alert.alert(
        'Permission needed',
        'Enable microphone & speech-recognition permissions in Settings.'
      );
      return;
    }

    sessionActiveRef.current = true;
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
    });
  }, []);

  const stopRecognition = useCallback(() => {
    if (!sessionActiveRef.current) return;
    ExpoSpeechRecognitionModule.stop();
    // “end” event will reset state, see below
  }, []);

  /* ----- native events ----- */
  useSpeechRecognitionEvent('start', () => setRecognizing(true));

  useSpeechRecognitionEvent('end',   () => {
    sessionActiveRef.current = false;
    setRecognizing(false);
  });

  useSpeechRecognitionEvent('result', (ev) => {
    setTranscript(ev.results[0]?.transcript ?? '');
  });

  useSpeechRecognitionEvent('error', (ev) => {
    console.warn('Speech-error:', ev.error, ev.message);
    sessionActiveRef.current = false;
    setRecognizing(false);
    Alert.alert('Speech-recognition error', `${ev.error}: ${ev.message}`);
  });

  /* ----- context value ----- */
  const value = {
    recognizing,
    transcript,
    startRecognition,
    stopRecognition,
  };

  return <SpeechContext.Provider value={value}>{children}</SpeechContext.Provider>;
};

export const useSpeech = () => useContext(SpeechContext);

