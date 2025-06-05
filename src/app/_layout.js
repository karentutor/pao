// src/app/_layout.js   (or app/_layout.tsx if you prefer TS)
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
      <Stack screenOptions={{ headerShown: false }} />
  );
}
