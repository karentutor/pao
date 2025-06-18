/**
 * Cross‑platform text‑to‑speech helpers using expo‑speech only
 * (react‑native‑tts has been removed).
 *
 * API is intentionally identical to the previous version so no
 * other source files need to change:
 *   • speak(text, opts?)   → Promise<void>
 *   • stopSpeaking()       → void
 */
import * as ExpoSpeech from "expo-speech";

/* ------------------------------------------------------------------ */
/*  Default options                                                    */
/* ------------------------------------------------------------------ */
const DEFAULT_LANGUAGE = "en-US";
const DEFAULT_RATE     = 0.75;

/* ------------------------------------------------------------------ */
/*  speak() – speak text once and resolve when playback ends           */
/* ------------------------------------------------------------------ */
export function speak(text, opts = {}) {
  if (!text?.trim()) return Promise.resolve();

  return new Promise((resolve, reject) => {
    // Merge caller‑supplied options with sensible defaults.
    // (caller can still override language / rate / pitch, etc.)
    const options = {
      language: DEFAULT_LANGUAGE,
      rate:     DEFAULT_RATE,
      ...opts,
      onDone:   resolve,
      onStopped: resolve,
      onError:  reject,
    };

    try {
      ExpoSpeech.speak(text, options);
    } catch (err) {
      reject(err);
    }
  });
}

/* ------------------------------------------------------------------ */
/*  stopSpeaking() – immediately halt all queued or current speech     */
/* ------------------------------------------------------------------ */
export function stopSpeaking() {
  try {
    ExpoSpeech.stop();   // no args
  } catch {
    /* ignore – safe on all platforms */
  }
}
