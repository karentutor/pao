import { Slot } from 'expo-router';
import { SpeechProvider } from '../context/SpeechProvider';
import GlobalSpeechNavigator from '../components/GlobalSpeechNavigator'; // ← NEW

export default function RootLayout() {
  return (
    <SpeechProvider>
      <GlobalSpeechNavigator /> {/* listens 24/7 */}
      <Slot />                  {/* your normal pages */}
    </SpeechProvider>
  );
}

