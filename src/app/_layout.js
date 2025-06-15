// app/_layout.js (or .tsx)
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* any providers you already have can stay here */}
      <Stack
        screenOptions={{
          headerShown: false,   // or your own defaults
        }}
      />
    </GestureHandlerRootView>
  );
}
