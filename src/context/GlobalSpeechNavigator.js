import { useEffect, useRef } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useSpeech } from '../context/SpeechProvider';

/** Map spoken keyword → route */
const COMMANDS = {
  home: '/',     // “home”  →  /
  test: '/test', // “test”  →  /test
  text: '/text', // “text”  →  /text   (add /text.js if you need it)
};

export default function GlobalSpeechNavigator() {
  const { transcript } = useSpeech();
  const router         = useRouter();
  const segments       = useSegments();            // current route as array
  const lastCmdRef     = useRef('');               // debounces repeats

  useEffect(() => {
    if (!transcript) return;

    const lower = transcript.toLowerCase();

    for (const [word, route] of Object.entries(COMMANDS)) {
      const match = new RegExp(`\\b${word}\\b`).test(lower);
      const onThatPageAlready =
        `/${segments.join('/')}`.replace(/\/$/, '') === route.replace(/\/$/, '');

      if (match && !onThatPageAlready && lastCmdRef.current !== word) {
        lastCmdRef.current = word;                 // lock until reset
        router.push(route);                        // navigate
        // reset the lock after a short delay so the user can say it again
        setTimeout(() => { lastCmdRef.current = ''; }, 1500);
        break;
      }
    }
  }, [transcript, segments, router]);

  return null; /* no UI */
}

