import React from 'react';
import { View, Button, ScrollView, Text } from 'react-native';
import { useVoice } from '../context/VoiceContext';
import { useRouter } from 'expo-router';


export default function Index() {
  const router = useRouter();
  const { recognizing, transcript, start, stop } = useVoice();

  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Button title={recognizing ? 'Stop' : 'Start'} onPress={recognizing ? stop : start} />
       <View style={{ marginTop: 16 }}>
        <Button
          title="Calendar"
          onPress={() => router.push('/calendar')}
        />
      </View>

      <ScrollView>
        <Text>{transcript}</Text>
      </ScrollView>
    </View>
  );
}