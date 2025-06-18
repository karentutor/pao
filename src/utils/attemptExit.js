import { Platform, BackHandler, Alert } from "react-native";
import * as Speech from "expo-speech";

export default async function attemptExit() {
  // Stop any text‑to‑speech so it doesn’t keep talking
  Speech.stop();

  if (Platform.OS === "android") {
    BackHandler.exitApp(); // closes immediately
  } else {
    // iOS guidelines prohibit closing the app programmatically.
    // Give the user audible confirmation and simply return.
    await new Promise((r) =>
      Speech.speak("Closing the assistant. Goodbye.", {
        language: "en-US",
        onDone: r,
        onStopped: r,
        onError: r,
      })
    );
    // Optionally show an alert as well
    Alert.alert("Assistant closed", "Swipe up or press the Home button to leave.");
  }
}
