import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

// Keeps a screen's data from going stale while the trainee/coach just sits
// on it — `useFocusEffect` alone (the pattern most screens in this app
// already used) only reruns on an actual focus TRANSITION, which never
// fires just from staying on an already-focused screen while the other
// side of a coach<->trainee relationship changes something. Reported
// concretely: a coach assigned a workout, the phone notification came
// through, but the trainee's Home card stayed stale since it only
// refetched on focus; separately, a completed workout not showing up in
// either side's History.
//
// Three triggers, same shape every time this is used:
//   1. On focus (unchanged behavior — still correct for an actual nav
//      transition, e.g. switching tabs away and back).
//   2. A periodic poll while mounted, regardless of focus.
//   3. Immediately on app foreground-resume — RN fully suspends JS timers
//      while backgrounded (see WorkoutScreen.tsx's rest-timer note), so
//      the poll above doesn't fire a backlog on resume, it just silently
//      stops ticking and picks back up later. Without this, returning to
//      the app would otherwise wait up to `intervalMs` for the first
//      correct refresh.
//
// A real Supabase Realtime `postgres_changes` subscription would update
// instantly instead of within `intervalMs`, but needs the relevant tables
// added to Supabase's realtime publication (a DB-side change this
// environment has no credentials to make) and its RLS-over-Realtime
// behavior confirmed actually working — neither could be verified here.
// Polling is the option that could be shipped and reasoned about with
// confidence; revisit with Realtime if the delay ever becomes a real
// complaint on a specific screen.
export function useLiveRefresh(callback: () => void, intervalMs: number = 15000) {
  useFocusEffect(useCallback(() => { callback(); }, [callback]));

  useEffect(() => {
    const interval = setInterval(callback, intervalMs);
    return () => clearInterval(interval);
  }, [callback, intervalMs]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') callback();
    });
    return () => sub.remove();
  }, [callback]);
}
