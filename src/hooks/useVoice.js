import { useEffect, useRef, useState } from "react";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";

/**
 * Keeps the OS recogniser alive, restarts after every "end",
 * and fires `onTrigger()` the first time `triggerWord`
 * appears in the live transcript.
 */
export function useVoice({ triggerWord, onTrigger }) {
  const [transcript, setTranscript] = useState("");
  const [recognizing, setRecognizing] = useState(false);

  const aliveRef   = useRef(true);   // false once component unmounts
  const firedRef   = useRef(false);  // avoids double navigation

  useEffect(() => {
    aliveRef.current = true;

    /* ---------- handlers ---------- */
    const handleStart = () => {
      setRecognizing(true);
      setTranscript("");
      firedRef.current = false;
    };

    const handleEnd = () => {
      setRecognizing(false);
      setTimeout(() => {
        if (!aliveRef.current) return;
        try {
          ExpoSpeechRecognitionModule.start({
            lang: "en-US",
            interimResults: true,
            continuous: true,
          });
          console.log("▶️ recogniser RE-started");
        } catch (err) {
          console.warn("❗️ restart failed", err);
        }
      }, 300);
    };

    const handleResult = (event) => {
      const latest = event.results[0]?.transcript ?? "";
      setTranscript(latest);

      if (
        !firedRef.current &&
        latest.toLowerCase().includes(triggerWord.toLowerCase())
      ) {
        firedRef.current = true;
        ExpoSpeechRecognitionModule.stop();  // finish this phrase
        setTranscript("");
        onTrigger();
      }
    };

    const handleError = (e) =>
      console.warn("[Speech] error:", e.error, e.message);

    /* ---------- subscribe once ---------- */
    const subs = [
      ExpoSpeechRecognitionModule.addListener("start", handleStart),
      ExpoSpeechRecognitionModule.addListener("end", handleEnd),
      ExpoSpeechRecognitionModule.addListener("result", handleResult),
      ExpoSpeechRecognitionModule.addListener("error", handleError),
    ];

    /* ---------- kick off first session ---------- */
    (async () => {
      const permission =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (permission.granted && aliveRef.current) handleStart();
      if (permission.granted && aliveRef.current)
        ExpoSpeechRecognitionModule.start({
          lang: "en-US",
          interimResults: true,
          continuous: true,
        });
    })();

    /* ---------- cleanup ---------- */
    return () => {
      aliveRef.current = false;
      ExpoSpeechRecognitionModule.stop();
      subs.forEach((s) => s.remove());
    };
  }, [triggerWord, onTrigger]);

  return { recognizing, transcript };
}
