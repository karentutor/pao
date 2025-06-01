// src/app/index.js
import React, { useState } from 'react';
import { View, Button, ScrollView, Text } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

// ❌  DO NOT call registerRootComponent here.
// ✅  Just export a component – Expo Router takes care of the rest.
export default function Index() {
  const [recognizing, setRecognizing] = useState(false);
  const [transcript, setTranscript] = useState('');

  useSpeechRecognitionEvent('start', () => setRecognizing(true));
  useSpeechRecognitionEvent('end',   () => setRecognizing(false));
  useSpeechRecognitionEvent('result', e => {
    setTranscript(e.results[0]?.transcript ?? '');
  });
  useSpeechRecognitionEvent('error',  e => {
    console.log('speech-error:', e.error, e.message);
  });

  const handleStart = async () => {
    const res = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!res.granted) return console.warn('Mic permission not granted');
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: false,
    });
  };

  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Button
        title={recognizing ? 'Stop' : 'Start'}
        onPress={() =>
          recognizing
            ? ExpoSpeechRecognitionModule.stop()
            : handleStart()
        }
      />
      <ScrollView><Text>{transcript}</Text></ScrollView>
    </View>
  );
}


// // index.js

// import React from 'react';
// import { Text, View, StyleSheet } from 'react-native';
// import { registerRootComponent } from 'expo';

// function App() {
//   return (
//     <View style={styles.container}>
//       <Text style={styles.text}>Hello, Expo!</Text>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,               // fill the whole screen
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   text: {
//     fontSize: 24,
//   },
// });

// export default App;
// // Registers the App component as the root entry point
// registerRootComponent(App);

