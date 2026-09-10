import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { getTraineeHistory } from '../../lib/db';
import { DBWorkoutSession } from '../../lib/supabase';

type TraineeSession = DBWorkoutSession & { workout_name: string };
type ChartMode = 'week' | 'month';

function isoDay(d: Date): string {
  return d.toISOString().split('T')[0];
}

// Sunday-start week, matching scheduled_days' 0=Sun..6=Sat convention used elsewhere in the app.
function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

interface ChartBucket {
  label: string;
  count: number;
}

function buildWeekBuckets(sessions: TraineeSession[], weeksBack: number): ChartBucket[] {
  const thisWeekStart = startOfWeek(new Date());
  const buckets = Array.from({ length: weeksBack }, (_, i) => {
    const start = new Date(thisWeekStart);
    start.setDate(start.getDate() - (weeksBack - 1 - i) * 7);
    return { start, days: new Set<string>() };
  });
  for (const s of sessions) {
    const d = new Date(s.completed_at);
    const wStart = startOfWeek(d).getTime();
    const bucket = buckets.find(b => b.start.getTime() === wStart);
    if (bucket) bucket.days.add(isoDay(d));
  }
  return buckets.map(b => ({
    label: `${b.start.getMonth() + 1}/${b.start.getDate()}`,
    count: b.days.size,
  }));
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function buildMonthBuckets(sessions: TraineeSession[], monthsBack: number): ChartBucket[] {
  const now = new Date();
  const buckets = Array.from({ length: monthsBack }, (_, i) => {
    const ref = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - i), 1);
    return { year: ref.getFullYear(), month: ref.getMonth(), days: new Set<string>() };
  });
  for (const s of sessions) {
    const d = new Date(s.completed_at);
    const bucket = buckets.find(b => b.year === d.getFullYear() && b.month === d.getMonth());
    if (bucket) bucket.days.add(isoDay(d));
  }
  return buckets.map(b => ({ label: MONTH_ABBR[b.month], count: b.days.size }));
}

export default function ExerciseLogScreen({ userId }: { userId: string }) {
  const [sessions, setSessions] = useState<TraineeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartMode, setChartMode] = useState<ChartMode>('week');

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getTraineeHistory(userId, 200);
      setSessions(rows);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const buckets = useMemo(
    () => (chartMode === 'week' ? buildWeekBuckets(sessions, 8) : buildMonthBuckets(sessions, 6)),
    [sessions, chartMode]
  );
  const maxCount = Math.max(...buckets.map(b => b.count), 1);

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Workout Activity</Text>
        <Text style={styles.subtitle}>Your workout completion history, logged automatically when you finish a workout</Text>

        {sessions.length === 0 && !loading && (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={40} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>No workouts completed yet</Text>
            <Text style={styles.emptySub}>Finish a workout on the Workout tab to start building your activity log.</Text>
          </View>
        )}

        {sessions.length > 0 && (
          <>
            {/* Days exercised chart */}
            <View style={styles.card}>
              <View style={styles.chartHeaderRow}>
                <Text style={styles.cardTitle}>Days Exercised</Text>
                <View style={styles.segmentRow}>
                  <TouchableOpacity
                    style={[styles.segment, chartMode === 'week' && styles.segmentActive]}
                    onPress={() => setChartMode('week')}
                  >
                    <Text style={[styles.segmentText, chartMode === 'week' && styles.segmentTextActive]}>Week</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.segment, chartMode === 'month' && styles.segmentActive]}
                    onPress={() => setChartMode('month')}
                  >
                    <Text style={[styles.segmentText, chartMode === 'month' && styles.segmentTextActive]}>Month</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.chart}>
                {buckets.map((b, i) => (
                  <View key={i} style={styles.chartBarItem}>
                    <Text style={styles.chartBarCount}>{b.count > 0 ? b.count : ''}</Text>
                    <View style={styles.chartBarTrack}>
                      <View
                        style={[
                          styles.chartBarFill,
                          { height: `${Math.max(4, (b.count / maxCount) * 100)}%` as any },
                          i === buckets.length - 1 && { backgroundColor: colors.xpBar },
                        ]}
                      />
                    </View>
                    <Text style={styles.chartBarLabel}>{b.label}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.chartFootnote}>
                Days per {chartMode === 'week' ? 'week' : 'month'}, last {buckets.length} {chartMode === 'week' ? 'weeks' : 'months'}
              </Text>
            </View>

            {/* Completed workouts table */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Completed Workouts</Text>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableCol, styles.colDate]}>Date</Text>
                <Text style={[styles.tableCol, styles.colTime]}>Time</Text>
                <Text style={[styles.tableCol, styles.colWorkout]}>Workout</Text>
              </View>
              {sessions.map(s => {
                const d = new Date(s.completed_at);
                return (
                  <View key={s.id} style={styles.tableRow}>
                    <Text style={[styles.tableCell, styles.colDate]}>
                      {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Text>
                    <Text style={[styles.tableCell, styles.colTime]}>
                      {d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </Text>
                    <Text style={[styles.tableCell, styles.colWorkout]} numberOfLines={1}>
                      {s.workout_name || 'Workout'}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 6, marginTop: 8 },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 20 },

  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },

  chartHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  segmentRow: {
    flexDirection: 'row', backgroundColor: colors.secondary, borderRadius: 10, padding: 3,
    borderWidth: 1, borderColor: colors.border,
  },
  segment: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 7 },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  segmentTextActive: { color: colors.text },

  chart: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', height: 110 },
  chartBarItem: { flex: 1, alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' },
  chartBarCount: { fontSize: 10, fontWeight: '700', color: colors.textSecondary, minHeight: 13 },
  chartBarTrack: {
    width: '100%', flex: 1, backgroundColor: colors.secondary, borderRadius: 4,
    overflow: 'hidden', justifyContent: 'flex-end',
  },
  chartBarFill: { width: '100%', backgroundColor: colors.accent, borderRadius: 4 },
  chartBarLabel: { fontSize: 9, color: colors.textSecondary, fontWeight: '600' },
  chartFootnote: { fontSize: 11, color: colors.textSecondary, marginTop: 12, textAlign: 'center' },

  tableHeader: {
    flexDirection: 'row', paddingBottom: 8, marginTop: 4,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tableCol: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1 },
  tableRow: {
    flexDirection: 'row', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border + '66',
  },
  tableCell: { fontSize: 13, color: colors.text, fontWeight: '600' },
  colDate: { flex: 1 },
  colTime: { flex: 1 },
  colWorkout: { flex: 2 },

  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  emptySub: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 24 },
});
