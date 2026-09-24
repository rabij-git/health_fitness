import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

// Real online presence via Supabase Realtime's Presence feature — ephemeral,
// socket-based state, not a DB table, so no migration needed. Replaces a
// previously-hardcoded "● Online" that showed regardless of whether the
// coach was actually using the app.
const ONLINE_CHANNEL = 'online-users';

// Module-level singleton. Supabase's realtime client reuses the same
// channel object per topic name — a second, independent
// supabase.channel(ONLINE_CHANNEL) call from a different hook instance
// returns that same (already-subscribed) channel, and calling .on() on it
// throws ("cannot add presence callbacks ... after subscribe()"). So only
// useTrackOwnPresence (below) is ever allowed to create/subscribe it — it's
// the one with a real userId to use as the presence key, and it's called
// exactly once, in RootNavigator. useIsUserOnline only ever reads from
// whatever this produces, via the listeners set for reactivity.
let sharedChannel: RealtimeChannel | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(fn => fn());
}

// Call once per logged-in session (RootNavigator) so this user shows up as
// online to anyone checking useIsUserOnline(userId) for them. Tracks only
// while the app is foregrounded — backgrounding untracks immediately rather
// than waiting on a socket-drop timeout, so "online" stays honest.
export function useTrackOwnPresence(userId: string | null) {
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(ONLINE_CHANNEL, { config: { presence: { key: userId } } });
    channel
      .on('presence', { event: 'sync' }, notify)
      .on('presence', { event: 'join' }, notify)
      .on('presence', { event: 'leave' }, notify);

    const syncTracking = () => {
      if (AppState.currentState === 'active') {
        channel.track({ online_at: new Date().toISOString() });
      } else {
        channel.untrack();
      }
    };
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') syncTracking();
    });
    sharedChannel = channel;
    notify();

    const sub = AppState.addEventListener('change', syncTracking);
    return () => {
      sub.remove();
      channel.untrack();
      supabase.removeChannel(channel);
      if (sharedChannel === channel) sharedChannel = null;
      notify();
    };
  }, [userId]);
}

// Whether a specific user currently has an active, foregrounded session —
// per useTrackOwnPresence above. false (not "unknown") if presence hasn't
// synced yet, the shared channel isn't up yet, or the target isn't
// tracking — the honest default in all three cases.
export function useIsUserOnline(targetUserId: string | null | undefined): boolean {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const listener = () => forceRender(n => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (!targetUserId || !sharedChannel) return false;
  const state = sharedChannel.presenceState();
  return Object.prototype.hasOwnProperty.call(state, targetUserId);
}
