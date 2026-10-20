import React, { useRef, useEffect } from 'react';
import { Animated, PanResponder, StyleSheet, View, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from './AppText';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useActiveWorkout } from '../contexts/ActiveWorkoutContext';

function formatRestTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const BANNER_WIDTH = 168;
const BANNER_HEIGHT = 64;
const EDGE_MARGIN = 12;
const TAP_MAX_MOVEMENT = 6;
const DOUBLE_TAP_MS = 350;
// Device-level preference, not per-trainee — it's a UI layout choice, not
// personal data, so one shared key is fine even if a device is ever used by
// more than one account.
const POSITION_STORAGE_KEY = 'athera_rest_timer_banner_pos';

// Rendered once, above the whole Tab.Navigator (see TrainerTabs.tsx), so the
// rest timer stays visible no matter which tab the trainee is on — reported
// bug: it used to only exist inside WorkoutScreen's own JSX, invisible the
// moment the trainee switched tabs even though the countdown kept running.
//
// Draggable — per feedback, a full-width bar pinned to the top blocked
// other things on screen (reported: couldn't get to chat). Shrunk to a
// small fixed-size pill instead of a full-width bar specifically so there's
// room to actually move it out of the way, and its last dropped position is
// saved (AsyncStorage) so it stays put next time rather than resetting to
// the default spot on every app open.
//
// A tap (released with under TAP_MAX_MOVEMENT of drag) still does what it
// always did — double-tap skips just this one rest period (there's only
// ever one active at a time, via ActiveWorkoutContext), single tap jumps
// back to the Workout tab via the optional onPress. A real drag gesture
// (movement past that threshold) is treated purely as a reposition, never
// also a tap, so dragging the banner can never accidentally skip the timer.
interface Props {
  onPress?: () => void;
  topInset: number;
  bottomInset: number;
}

export default function RestTimerBanner({ onPress, topInset, bottomInset }: Props) {
  const { restTimer, restSecondsLeft, skipRestTimer } = useActiveWorkout();
  const lastTapRef = useRef(0);
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const positionLoadedRef = useRef(false);

  // Restore a saved drop position once. Defaults to (0,0) — i.e. the
  // original top-of-screen spot, via the base `top`/`right` in the style
  // below — until/unless the trainee has actually dragged it somewhere
  // before.
  useEffect(() => {
    AsyncStorage.getItem(POSITION_STORAGE_KEY).then(raw => {
      positionLoadedRef.current = true;
      if (!raw) return;
      try {
        const { x, y } = JSON.parse(raw);
        if (typeof x === 'number' && typeof y === 'number') pan.setValue({ x, y });
      } catch {
        // Corrupted value — just keep the default position.
      }
    });
  }, [pan]);

  const clampAndMaybeSnapBack = (gestureState: { dx: number; dy: number }) => {
    const { width: screenW, height: screenH } = Dimensions.get('window');
    // Base resting spot (pre-drag) is `top: topInset + 8, right: EDGE_MARGIN`
    // — convert that to an absolute left/top to clamp against actual screen
    // bounds, since the drag offset is relative to that base spot, not the
    // screen origin.
    const baseLeft = screenW - EDGE_MARGIN - BANNER_WIDTH;
    const baseTop = topInset + 8;
    const minX = -baseLeft + EDGE_MARGIN;
    const maxX = screenW - EDGE_MARGIN - BANNER_WIDTH - baseLeft;
    const minY = -baseTop + topInset;
    // Keep it clear of the bottom tab bar (54 is TrainerTabs' own base
    // height before safe-area padding — see its tabBarStyle).
    const maxY = screenH - bottomInset - 54 - EDGE_MARGIN - BANNER_HEIGHT - baseTop;

    const current = { x: (pan.x as any).__getValue() as number, y: (pan.y as any).__getValue() as number };
    const clampedX = Math.min(Math.max(current.x, minX), Math.max(minX, maxX));
    const clampedY = Math.min(Math.max(current.y, minY), Math.max(minY, maxY));
    if (clampedX !== current.x || clampedY !== current.y) {
      Animated.spring(pan, { toValue: { x: clampedX, y: clampedY }, useNativeDriver: false }).start();
    }
    const final = { x: clampedX, y: clampedY };
    AsyncStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(final)).catch(() => {});
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset({ x: (pan.x as any).__getValue(), y: (pan.y as any).__getValue() });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_e, gestureState) => {
        pan.flattenOffset();
        const moved = Math.abs(gestureState.dx) > TAP_MAX_MOVEMENT || Math.abs(gestureState.dy) > TAP_MAX_MOVEMENT;
        if (!moved) {
          const now = Date.now();
          if (now - lastTapRef.current < DOUBLE_TAP_MS) {
            lastTapRef.current = 0;
            skipRestTimer();
          } else {
            lastTapRef.current = now;
            onPress?.();
          }
          return;
        }
        clampAndMaybeSnapBack(gestureState);
      },
    })
  ).current;

  if (!restTimer) return null;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.banner,
        { top: topInset + 8, right: EDGE_MARGIN, transform: pan.getTranslateTransform() },
      ]}
    >
      <Ionicons name="time" size={18} color={colors.text} />
      <View style={{ flex: 1 }}>
        <Text style={styles.time}>{formatRestTime(restSecondsLeft)}</Text>
        <Text style={styles.label} numberOfLines={1}>{restTimer.exerciseName}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    width: BANNER_WIDTH,
    height: BANNER_HEIGHT,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 12,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  label: { fontSize: 11, fontWeight: '600', color: colors.text, opacity: 0.85 },
  time: { fontSize: 18, fontWeight: '800', color: colors.text },
});
