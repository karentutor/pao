import React, { useEffect, useRef } from 'react';
import { View, Button, ScrollView, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSpeech } from '../context/SpeechProvider';

/* ────────────────────────────────────────────────────────────── */
export default function HomeScreen() {
  const router = useRouter();
  const heardTestRef = useRef(false);

  /* speech-provider values */
  const {
    recognizing,
    transcript,
    startRecognition,
    stopRecognition,
  } = useSpeech();

  /* navigate the first time we hear “test” */
  useEffect(() => {
    if (!heardTestRef.current && /\btest\b/i.test(transcript)) {
      heardTestRef.current = true;
      stopRecognition();
      router.push('/test');
    }
  }, [transcript, stopRecognition, router]);

  /* ---------- UI ---------- */
  return (
    <View style={styles.container}>
      <Button
        title={recognizing ? 'Stop' : 'Start'}
        onPress={recognizing ? stopRecognition : startRecognition}
      />

      <ScrollView style={styles.scroll}>
        <Text style={styles.text}>
          {transcript || 'Say something… (say “test” to navigate)'}
        </Text>
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

