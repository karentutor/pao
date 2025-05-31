import { Slot } from 'expo-router';
import { SpeechProvider } from '../context/SpeechProvider'; // ← NEW

export default function RootLayout() {
  return (
    <SpeechProvider>
      <Slot />
    </SpeechProvider>
  );
}

