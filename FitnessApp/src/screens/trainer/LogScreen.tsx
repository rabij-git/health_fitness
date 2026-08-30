import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import ExerciseLogScreen from './ExerciseLogScreen';
import FoodLogScreen from './FoodLogScreen';

export default function LogScreen({ userId }: { userId: string }) {
  const [segment, setSegment] = useState<'exercises' | 'food'>('exercises');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.segmentRow}>
        <TouchableOpacity
          style={[styles.segment, segment === 'exercises' && styles.segmentActive]}
          onPress={() => setSegment('exercises')}
        >
          <Text style={[styles.segmentText, segment === 'exercises' && styles.segmentTextActive]}>Exercises</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segment, segment === 'food' && styles.segmentActive]}
          onPress={() => setSegment('food')}
        >
          <Text style={[styles.segmentText, segment === 'food' && styles.segmentTextActive]}>Nutrition</Text>
        </TouchableOpacity>
      </View>
      {segment === 'exercises' ? <ExerciseLogScreen userId={userId} /> : <FoodLogScreen userId={userId} />}
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
