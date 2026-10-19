import React, { useRef } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from './AppText';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useActiveWorkout } from '../contexts/ActiveWorkoutContext';

function formatRestTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Rendered once, above the whole Tab.Navigator (see TrainerTabs.tsx), so the
// rest timer stays visible no matter which tab the trainee is on — reported
// bug: it used to only exist inside WorkoutScreen's own JSX, invisible the
// moment the trainee switched tabs even though the countdown kept running.
// Double-tap skips just this one rest period early (there's only ever one
// active at a time, via ActiveWorkoutContext, so nothing else is affected).
interface Props {
  onPress?: () => void;
}

export default function RestTimerBanner({ onPress }: Props) {
  const { restTimer, restSecondsLeft, skipRestTimer } = useActiveWorkout();
  const lastTapRef = useRef(0);

  if (!restTimer) return null;

  const handlePress = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 350) {
      lastTapRef.current = 0;
      skipRestTimer();
      return;
    }
    lastTapRef.current = now;
    onPress?.();
  };

  return (
    <TouchableOpacity style={styles.banner} onPress={handlePress} activeOpacity={0.85}>
      <Ionicons name="time" size={20} color={colors.text} />
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>Resting — {restTimer.exerciseName}</Text>
        <Text style={styles.time}>{formatRestTime(restSecondsLeft)}</Text>
      </View>
      <Text style={styles.hint}>Double-tap to skip</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.primary, borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  label: { fontSize: 12, fontWeight: '700', color: colors.text, opacity: 0.85 },
  time: { fontSize: 20, fontWeight: '800', color: colors.text },
  hint: { fontSize: 10, fontWeight: '600', color: colors.text, opacity: 0.7, maxWidth: 70, textAlign: 'right' },
});
