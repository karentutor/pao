import React from 'react';
import { View, Text, Button, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useVoice } from '../context/VoiceContext';

export default function Calendar() {
  const router = useRouter();
  const { recognizing, transcript, start, stop } = useVoice();

  /* Automatically start on focus; stop on blur */
  useFocusEffect(
    React.useCallback(() => {
      start();          // clears transcript & begins listening
      return () => stop();
    }, [start, stop])
  );

  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Button title="Back" onPress={() => router.back()} />

      <Text style={{ fontSize: 24, marginVertical: 12 }}>Calendar Screen</Text>

      <Button
        title={recognizing ? 'Stop Listening' : 'Start Listening'}
        onPress={recognizing ? stop : start}
      />

      <ScrollView style={{ marginTop: 20 }}>
        <Text>{transcript}</Text>
      </ScrollView>
    </View>
  );
}
