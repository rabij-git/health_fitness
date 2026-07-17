import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { ExerciseWeightLog } from '../../data/mockData';
import { getExerciseWeightLogs, logExerciseWeight } from '../../lib/db';
import { DBExerciseWeightLog } from '../../lib/supabase';

// Group DB rows into ExerciseWeightLog shape
function groupLogs(rows: DBExerciseWeightLog[]): ExerciseWeightLog[] {
  const map: Record<string, ExerciseWeightLog> = {};
  for (const row of rows) {
    if (!map[row.exercise_name]) {
      map[row.exercise_name] = {
        exerciseId: row.exercise_name,
        exerciseName: row.exercise_name,
        entries: [],
      };
    }
    map[row.exercise_name].entries.push({
      date: row.logged_at,
      weight: row.weight,
      reps: row.reps ?? '—',
      sets: row.sets ?? 3,
    });
  }
  return Object.values(map);
}

export default function ExerciseLogScreen({ userId }: { userId: string }) {
  const [logs, setLogs] = useState<ExerciseWeightLog[]>([]);
  const [selected, setSelected] = useState<ExerciseWeightLog | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newWeight, setNewWeight] = useState('');
  const [newReps, setNewReps] = useState('');
  const [saved, setSaved] = useState(false);

  const loadLogs = useCallback(async () => {
    const rows = await getExerciseWeightLogs(userId);
    setLogs(groupLogs(rows));
  }, [userId]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const handleAddEntry = async () => {
    if (!selected || !newWeight) return;
    try {
      const exerciseName = selected.exerciseName;
      await logExerciseWeight(userId, exerciseName, newWeight + 'kg', newReps || '8', 3);
      // Single fetch: load all logs, then derive selected from the result
      const rows = await getExerciseWeightLogs(userId);
      const grouped = groupLogs(rows);
      setLogs(grouped);
      setSelected(grouped.find(l => l.exerciseName === exerciseName) ?? null);
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setShowAdd(false);
        setNewWeight('');
        setNewReps('');
      }, 1200);
    } catch (e) {
      console.warn('Exercise log error', e);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Exercise Log</Text>
        <Text style={styles.subtitle}>Track your weight progression per exercise</Text>

        {logs.map(log => {
          const entries = log.entries;
          const latest = entries[entries.length - 1];
          const prev = entries[entries.length - 2];
          const latestW = parseFloat(latest?.weight ?? '0');
          const prevW = parseFloat(prev?.weight ?? '0');
          const isProgress = prev && latestW > prevW;
          const isEqual = prev && latestW === prevW;

          return (
            <TouchableOpacity
              key={log.exerciseId}
              style={styles.exerciseCard}
              onPress={() => setSelected(log)}
              activeOpacity={0.8}
            >
              <View style={styles.cardHeader}>
                <View style={styles.exIcon}>
                  <Ionicons name="barbell" size={18} color={colors.xpBar} />
                </View>
                <View style={styles.exInfo}>
                  <Text style={styles.exName}>{log.exerciseName}</Text>
                  <Text style={styles.exMeta}>{entries.length} sessions logged</Text>
                </View>
                <View style={styles.latestBlock}>
                  <Text style={styles.latestWeight}>{latest?.weight ?? '—'}</Text>
                  {prev && (
                    <View style={[
                      styles.trendBadge,
                      isProgress && { backgroundColor: colors.success + '22' },
                      !isProgress && !isEqual && { backgroundColor: colors.primary + '22' },
                    ]}>
                      <Ionicons
                        name={isProgress ? 'trending-up' : isEqual ? 'remove' : 'trending-down'}
                        size={13}
                        color={isProgress ? colors.success : isEqual ? colors.textSecondary : colors.primary}
                      />
                    </View>
                  )}
                </View>
              </View>

              {/* Mini bar chart — last 5 sessions */}
              {entries.length > 0 && (
                <View style={styles.miniChart}>
                  {entries.slice(-5).map((entry, i) => {
                    const vals = entries.slice(-5).map(e => parseFloat(e.weight) || 0);
                    const maxVal = Math.max(...vals, 1);
                    const h = (parseFloat(entry.weight) || 0) / maxVal;
                    const isLast = i === Math.min(entries.length, 5) - 1;
                    return (
                      <View key={i} style={styles.miniBarItem}>
                        <View style={styles.miniBarTrack}>
                          <View
                            style={[
                              styles.miniBarFill,
                              { height: `${h * 100}%` as any },
                              isLast && { backgroundColor: colors.xpBar },
                            ]}
                          />
                        </View>
                        <Text style={styles.miniBarLabel}>{entry.date.split(' ')[1]}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Exercise Detail Modal */}
      <Modal visible={!!selected} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeaderRow}>
              <View style={styles.sheetIconCircle}>
                <Ionicons name="barbell" size={20} color={colors.xpBar} />
              </View>
              <Text style={styles.sheetTitle}>{selected?.exerciseName}</Text>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.historyHeader}>
              <Text style={styles.historyCol}>Date</Text>
              <Text style={styles.historyCol}>Weight</Text>
              <Text style={styles.historyCol}>Sets × Reps</Text>
            </View>

            <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
              {selected?.entries.slice().reverse().map((entry, i) => (
                <View key={i} style={[styles.historyRow, i === 0 && styles.historyRowLatest]}>
                  <Text style={[styles.historyDate, i === 0 && { color: colors.xpBar }]}>
                    {entry.date}
                  </Text>
                  <Text style={[styles.historyWeight, i === 0 && { color: colors.xpBar }]}>
                    {entry.weight}
                  </Text>
                  <Text style={styles.historyMeta}>{entry.sets}×{entry.reps}</Text>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.addEntryBtn}
              onPress={() => setShowAdd(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="add-circle" size={18} color={colors.text} />
              <Text style={styles.addEntryText}>Add Today's Weight</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add Entry Modal */}
      <Modal visible={showAdd} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Log Today's Weight</Text>
              <Text style={styles.sheetSub}>{selected?.exerciseName}</Text>

              <Text style={styles.inputLabel}>Weight (kg)</Text>
              <TextInput
                style={styles.input}
                value={newWeight}
                onChangeText={setNewWeight}
                placeholder="e.g. 82.5"
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
                autoFocus
              />

              <Text style={styles.inputLabel}>Reps</Text>
              <TextInput
                style={styles.input}
                value={newReps}
                onChangeText={setNewReps}
                placeholder="e.g. 8"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
              />

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => { setShowAdd(false); setNewWeight(''); setNewReps(''); }}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, saved && styles.saveBtnSuccess]}
                  onPress={handleAddEntry}
                  activeOpacity={0.85}
                >
                  <Ionicons name={saved ? 'checkmark' : 'save'} size={18} color={colors.text} />
                  <Text style={styles.saveText}>{saved ? 'Saved!' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 6, marginTop: 8 },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 20 },

  exerciseCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 12 },
  exIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.xpBar + '22',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.xpBar + '44',
  },
  exInfo: { flex: 1 },
  exName: { fontSize: 15, fontWeight: '700', color: colors.text },
  exMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  latestBlock: { alignItems: 'flex-end', gap: 4 },
  latestWeight: { fontSize: 16, fontWeight: '800', color: colors.text },
  trendBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Mini chart
  miniChart: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-end',
    height: 48,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  miniBarItem: { flex: 1, alignItems: 'center', gap: 3 },
  miniBarTrack: {
    width: '100%',
    height: 32,
    backgroundColor: colors.secondary,
    borderRadius: 4,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  miniBarFill: { width: '100%', backgroundColor: colors.accent, borderRadius: 4 },
  miniBarLabel: { fontSize: 9, color: colors.textSecondary, fontWeight: '600' },

  // Modals
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
  },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  sheetIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.xpBar + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.text },
  sheetSub: { fontSize: 13, color: colors.xpBar, fontWeight: '600', marginBottom: 20 },

  historyHeader: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 4,
  },
  historyCol: { flex: 1, fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1 },
  historyRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '66',
  },
  historyRowLatest: { backgroundColor: colors.xpBar + '0f' },
  historyDate: { flex: 1, fontSize: 13, color: colors.textSecondary },
  historyWeight: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  historyMeta: { flex: 1, fontSize: 13, color: colors.textSecondary },

  addEntryBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addEntryText: { color: colors.text, fontSize: 15, fontWeight: '700' },

  inputLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1, marginBottom: 8 },
  input: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  modalFooter: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    padding: 15,
    borderRadius: 12,
    backgroundColor: colors.secondary,
    alignItems: 'center',
  },
  cancelText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  saveBtn: {
    flex: 1,
    padding: 15,
    borderRadius: 12,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  saveBtnSuccess: { backgroundColor: colors.success },
  saveText: { color: colors.text, fontSize: 15, fontWeight: '700' },
});
