import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useVoice } from '../context/VoiceContext';

export default function Test() {
  const { transcript, recognizing } = useVoice();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>
        {recognizing ? '🎤 Listening…' : '⏸️  Not listening'}
      </Text>

      <Text style={styles.transcript}>{transcript || 'Say something!'}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  header: { fontSize: 18, fontWeight: '600', marginBottom: 16 },
  transcript: { fontSize: 16, lineHeight: 22 },
});

