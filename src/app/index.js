import React from 'react';
import { View, Button, ScrollView, Text } from 'react-native';
import { useVoice } from '../context/VoiceContext';

export default function Index() {
  const { recognizing, transcript, start, stop } = useVoice();

  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Button title={recognizing ? 'Stop' : 'Start'} onPress={recognizing ? stop : start} />

      <ScrollView>
        <Text>{transcript}</Text>
      </ScrollView>
    </View>
  );
}
