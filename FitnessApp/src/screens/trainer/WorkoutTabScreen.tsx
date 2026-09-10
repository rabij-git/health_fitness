import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import WorkoutScreen from './WorkoutScreen';
import ExerciseLogScreen from './ExerciseLogScreen';

// Owns the single SafeAreaView for the tab (WorkoutScreen/ExerciseLogScreen
// both use a plain View so insets aren't applied twice), same pattern
// LogScreen used for the old Exercises/Nutrition segment toggle.
export default function WorkoutTabScreen({ userId }: { userId: string }) {
  const [segment, setSegment] = useState<'workout' | 'history'>('workout');
  const route = useRoute<any>();

  // Deep-linking into a specific workout (from Home's "Workout Today" card)
  // always means "show me the Workout segment" — force it back even if the
  // trainee was sitting on History when the link fires. WorkoutScreen itself
  // still owns reading/clearing the openWorkoutId param.
  useEffect(() => {
    if (route.params?.openWorkoutId) setSegment('workout');
  }, [route.params?.openWorkoutId]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.segmentRow}>
        <TouchableOpacity
          style={[styles.segment, segment === 'workout' && styles.segmentActive]}
          onPress={() => setSegment('workout')}
        >
          <Text style={[styles.segmentText, segment === 'workout' && styles.segmentTextActive]}>Workout</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segment, segment === 'history' && styles.segmentActive]}
          onPress={() => setSegment('history')}
        >
          <Text style={[styles.segmentText, segment === 'history' && styles.segmentTextActive]}>History</Text>
        </TouchableOpacity>
      </View>
      {segment === 'workout' ? <WorkoutScreen userId={userId} /> : <ExerciseLogScreen userId={userId} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 1,
  },
  segment: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  segmentTextActive: { color: colors.text },
});
