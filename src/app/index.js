// src/app/index.js
import React, { useCallback, useState } from 'react';
import { View, Button, ScrollView, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

/* ────────────────────────────────────────────────────────────── */
export default function HomeScreen() {
  const router                        = useRouter();
  const [recognizing, setRecognizing] = useState(false);
  const [transcript, setTranscript]   = useState('');

  /* ---------- native event hooks ---------- */
  useSpeechRecognitionEvent('start',  () => setRecognizing(true));
  useSpeechRecognitionEvent('end',    () => setRecognizing(false));

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript ?? '';
    setTranscript(text);

    // OPTIONAL: navigate to /test when the standalone word “test” is spoken.
    if (/\btest\b/i.test(text)) {
      ExpoSpeechRecognitionModule.stop();   // tidy up
      router.push('/test');
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    console.warn('Speech-error:', event.error, event.message);
    // For demo purposes show a quick popup
    Alert.alert('Speech-recognition error', `${event.error}: ${event.message}`);
  });

  /* ---------- helpers ---------- */
  const handleStart = useCallback(async () => {
    // Ask once per launch; skip if already granted
    const { granted } =
      await ExpoSpeechRecognitionModule.requestPermissionsAsync();

    if (!granted) {
      Alert.alert('Permission needed', 'Please enable microphone & speech-recognition permissions in Settings.');
      return;
    }

    // A very small guard: if a session is already running, stop it first
    if (recognizing) {
      ExpoSpeechRecognitionModule.stop();
    }

    // Launch recognition
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: true,          // keep listening until the user taps “Stop”
    });
  }, [recognizing]);

  const handleStop = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  /* ---------- UI ---------- */
  return (
    <View style={styles.container}>
      <Button
        title={recognizing ? 'Stop' : 'Start'}
        onPress={recognizing ? handleStop : handleStart}
      />

      <ScrollView style={styles.scroll}>
        <Text style={styles.text}>{transcript || 'Say something…'}</Text>
      </ScrollView>
    </View>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'flex-start' },
  scroll:    { marginTop: 24, backgroundColor: '#f4f4f4', borderRadius: 8 },
  text:      { padding: 12, fontSize: 16, lineHeight: 22 },
});
