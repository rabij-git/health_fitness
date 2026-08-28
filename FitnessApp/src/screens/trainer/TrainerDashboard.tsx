import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { getXpForNextLevel, getCurrentLevelXp } from '../../data/mockData';
import { getProfile, logBodyWeight, getWeightLogs, getMessages, sendMessage, markMessagesRead, getWorkoutWithExercises, getTraineeHistory } from '../../lib/db';
import { DBUser, DBWeightLog, DBMessage, DBWorkout, DBExercise } from '../../lib/supabase';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

interface Props {
  onLogout: () => void;
  userId: string;
}

export default function TrainerDashboard({ onLogout, userId }: Props) {
  const [profile, setProfile] = useState<DBUser | null>(null);
  const [coachProfile, setCoachProfile] = useState<DBUser | null>(null);
  const [weightLogs, setWeightLogs] = useState<DBWeightLog[]>([]);
  const [dbMessages, setDbMessages] = useState<DBMessage[]>([]);
  const [dbWorkout, setDbWorkout] = useState<{ workout: DBWorkout; exercises: DBExercise[] } | null>(null);
  const [sessionHistory, setSessionHistory] = useState<any[]>([]);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [weight, setWeight] = useState('');
  const [weightSaved, setWeightSaved] = useState(false);
  const [showMsgModal, setShowMsgModal] = useState(false);
  const [msgInput, setMsgInput] = useState('');
  const [dismissedNotifs, setDismissedNotifs] = useState<string[]>([]);

  const loadHome = useCallback(() => {
    Promise.all([
      getProfile(userId),
      getWeightLogs(userId),
      getWorkoutWithExercises(userId),
      getTraineeHistory(userId),
    ]).then(([p, weights, workout, history]) => {
      setProfile(p);
      setCoachId(p?.coach_id ?? null);
      setWeightLogs(weights);
      setDbWorkout(workout);
      setSessionHistory(history);
      setLoadingProfile(false);
    });
  }, [userId]);

  // Refetch every time the Home tab regains focus (not just on first mount) —
  // otherwise finishing a workout on the Workout tab (which updates xp/level/streak)
  // never shows up here since bottom-tab screens stay mounted between tab switches.
  useFocusEffect(useCallback(() => { loadHome(); }, [loadHome]));

  useEffect(() => {
    if (!coachId) return;
    Promise.all([
      getMessages(userId, coachId),
      getProfile(coachId),
    ]).then(([messages, coach]) => {
      setDbMessages(messages);
      setCoachProfile(coach);
    });
  }, [coachId, userId]);

  const user = profile ?? { name: '...', avatar: '?', level: 1, xp: 0, streak: 0 };
  const xpForNext = getXpForNextLevel(user.level);
  const currentLevelXp = getCurrentLevelXp(user.xp ?? 0);
  const xpPercent = currentLevelXp / xpForNext;
  const lastWeight = weightLogs[0];
  const unreadNotifs: any[] = [];
  const hasUnreadMessages = useMemo(
    () => dbMessages.some(m => m.from_id === coachId && !m.read),
    [dbMessages, coachId]
  );

  // Weekly performance derived from session history (last 7 days)
  const { weeklyPerf, weeklyDone, weeklyXp, weeklyAvgCompletion } = useMemo(() => {
    const today = new Date();
    const perf = DAY_LABELS.map((day, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - ((today.getDay() + 6) % 7) + i);
      const dateStr = d.toISOString().split('T')[0];
      const session = sessionHistory.find(s => s.completed_at?.startsWith(dateStr));
      const pct = session ? (session.completion_pct ?? 0) / 100 : 0;
      return { day, pct, done: !!session };
    });
    const done = perf.filter(d => d.done).length;
    const xp = sessionHistory
      .filter(s => {
        const diffDays = (today.getTime() - new Date(s.completed_at).getTime()) / 86400000;
        return diffDays <= 7;
      })
      .reduce((sum, s) => sum + (s.xp_awarded ?? 0), 0);
    const avgCompletion = done > 0
      ? Math.round(perf.filter(d => d.done).reduce((sum, d) => sum + d.pct * 100, 0) / done)
      : 0;
    return { weeklyPerf: perf, weeklyDone: done, weeklyXp: xp, weeklyAvgCompletion: avgCompletion };
  }, [sessionHistory]);

  const handleSaveWeight = useCallback(async () => {
    const parsed = parseFloat(weight);
    if (!weight || isNaN(parsed) || parsed <= 0 || parsed > 250) return;
    try {
      await logBodyWeight(userId, parsed);
      const updated = await getWeightLogs(userId);
      setWeightLogs(updated);
      setWeightSaved(true);
      setWeight('');
      setTimeout(() => setWeightSaved(false), 2000);
    } catch (e) {
      console.warn('Weight log error', e);
    }
  }, [userId, weight]);

  const handleWeightChange = useCallback((v: string) => {
    let cleaned = v.replace(/[^0-9.]/g, '');
    const firstDot = cleaned.indexOf('.');
    if (firstDot !== -1) {
      cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
    }
    if (parseFloat(cleaned) > 250) cleaned = '250';
    setWeight(cleaned);
  }, []);

  const openMsgModal = useCallback(() => {
    setShowMsgModal(true);
    if (coachId && hasUnreadMessages) {
      markMessagesRead(userId, coachId);
      setDbMessages(prev => prev.map(m => m.from_id === coachId ? { ...m, read: true } : m));
    }
  }, [coachId, userId, hasUnreadMessages]);

  const handleSend = useCallback(async () => {
    if (!msgInput.trim() || !coachId) return;
    const text = msgInput.trim();
    setMsgInput('');
    try {
      await sendMessage(userId, coachId, text);
      const updated = await getMessages(userId, coachId);
      setDbMessages(updated);
    } catch (e) {
      console.warn('Send message error', e);
    }
  }, [userId, coachId, msgInput]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hey, {(profile?.name ?? '...').split(' ')[0]}! 👊</Text>
            <Text style={styles.subtitle}>Keep pushing — great things take time.</Text>
          </View>
          <View style={styles.headerRight}>
            {coachId && (
              <TouchableOpacity style={styles.msgBtn} onPress={openMsgModal}>
                <Ionicons name="chatbubble-ellipses" size={20} color={colors.xpBar} />
                {hasUnreadMessages && <View style={styles.msgDot} />}
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onLogout} style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{user.avatar}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Coach notification banners */}
        {unreadNotifs.map(notif => (
          <TouchableOpacity
            key={notif.id}
            style={styles.notifBanner}
            onPress={() => setDismissedNotifs(prev => [...prev, notif.id])}
            activeOpacity={0.85}
          >
            <View style={styles.notifLeft}>
              <Ionicons name="notifications" size={16} color={colors.gold} />
              <Text style={styles.notifText} numberOfLines={2}>{notif.message}</Text>
            </View>
            <Ionicons name="close" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}

        {/* Gamification Hero Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.levelBadge}>
              <Text style={styles.levelLabel}>LEVEL</Text>
              <Text style={styles.levelValue}>{user.level}</Text>
            </View>
            <View style={styles.heroCenter}>
              <Text style={styles.xpText}>{currentLevelXp} / {xpForNext} XP</Text>
              <View style={styles.xpBarBg}>
                <View style={[styles.xpBarFill, { width: `${xpPercent * 100}%` as any }]} />
              </View>
              <Text style={styles.xpNextText}>{xpForNext - currentLevelXp} XP to Level {user.level + 1}</Text>
            </View>
            <View style={styles.streakBadge}>
              <Ionicons name="flame" size={20} color={colors.streak} />
              <Text style={styles.streakValue}>{user.streak}</Text>
              <Text style={styles.streakLabel}>streak</Text>
            </View>
          </View>
          <View style={styles.flameRow}>
            {Array.from({ length: 7 }).map((_, i) => (
              <View key={i} style={styles.flameItem}>
                <Ionicons
                  name="flame"
                  size={20}
                  color={i < (user.streak % 7 || 7) ? colors.streak : colors.border}
                />
                <Text style={styles.flameDay}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Weekly Performance Analysis Bar */}
        <View style={styles.analysisCard}>
          <View style={styles.analysisHeader}>
            <Text style={styles.analysisTitle}>Weekly Performance</Text>
            <View style={styles.analysisBadge}>
              <Text style={styles.analysisBadgeText}>{weeklyDone}/7 days</Text>
            </View>
          </View>
          <View style={styles.barsRow}>
            {weeklyPerf.map((d, i) => (
              <View key={i} style={styles.barItem}>
                <View style={styles.barTrack}>
                  <View style={[
                    styles.barFill,
                    { height: `${d.pct * 100}%` as any },
                    d.done && { backgroundColor: colors.xpBar },
                  ]} />
                </View>
                <Text style={[styles.barDay, d.done && { color: colors.xpBar }]}>{d.day}</Text>
              </View>
            ))}
          </View>
          <View style={styles.analysisStats}>
            <View style={styles.analysisStat}>
              <Text style={styles.analysisVal}>{weeklyDone}</Text>
              <Text style={styles.analysisLabel}>Workouts</Text>
            </View>
            <View style={styles.analysisDivider} />
            <View style={styles.analysisStat}>
              <Text style={[styles.analysisVal, { color: colors.xpBar }]}>+{weeklyXp}</Text>
              <Text style={styles.analysisLabel}>XP Earned</Text>
            </View>
            <View style={styles.analysisDivider} />
            <View style={styles.analysisStat}>
              <Text style={[styles.analysisVal, { color: colors.streak }]}>{weeklyAvgCompletion}%</Text>
              <Text style={styles.analysisLabel}>Completion</Text>
            </View>
          </View>
        </View>

        {/* Calorie Bar */}
        <View style={styles.calorieCard}>
          <View style={styles.calorieRow}>
            <View>
              <Text style={styles.calorieTitle}>Calories Today</Text>
              <Text style={styles.calorieSub}>Synced by your coach</Text>
            </View>
            <View style={styles.calsLeft}>
              <Text style={styles.calsLeftNum}>—</Text>
              <Text style={styles.calsLeftLabel}>not synced</Text>
            </View>
          </View>
          <View style={styles.calBarBg}>
            <View style={[styles.calBarFill, { width: '0%' as any }]} />
          </View>
          <View style={styles.macroRow}>
            {[
              { label: 'Protein', val: '—', color: colors.streak },
              { label: 'Carbs', val: '—', color: '#4A9EFF' },
              { label: 'Fat', val: '—', color: colors.gold },
            ].map(m => (
              <View key={m.label} style={styles.macroItem}>
                <View style={[styles.macroDot, { backgroundColor: m.color }]} />
                <Text style={styles.macroLabel}>{m.label}</Text>
                <Text style={[styles.macroVal, { color: m.color }]}>{m.val}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Today's Workout Card */}
        <View style={styles.workoutCard}>
          {dbWorkout ? (
            <>
              <View style={styles.workoutHeader}>
                <View>
                  <Text style={styles.workoutTitle}>{dbWorkout.workout.name}</Text>
                  <Text style={styles.workoutSub}>
                    {dbWorkout.exercises.length} exercises • {dbWorkout.workout.duration}
                  </Text>
                </View>
                <View style={[styles.difficultyBadge, { backgroundColor: colors.accent + '66' }]}>
                  <Text style={styles.difficultyText}>{dbWorkout.workout.difficulty}</Text>
                </View>
              </View>
              {dbWorkout.exercises.slice(0, 3).map((ex) => (
                <View key={ex.id} style={styles.exerciseRow}>
                  <View style={styles.exerciseDot} />
                  <Text style={styles.exerciseName}>{ex.name}</Text>
                  <Text style={styles.exerciseMeta}>{ex.sets}×{ex.reps}</Text>
                </View>
              ))}
              {dbWorkout.exercises.length > 3 && (
                <Text style={styles.moreText}>+{dbWorkout.exercises.length - 3} more exercises</Text>
              )}
            </>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 20, gap: 8 }}>
              <Ionicons name="barbell-outline" size={32} color={colors.textSecondary} />
              <Text style={styles.workoutTitle}>No Workout Assigned Yet</Text>
              <Text style={styles.workoutSub}>Your coach will assign your program soon.</Text>
            </View>
          )}
        </View>

        {/* Biometrics Logger */}
        <View style={styles.biometricsCard}>
          <Text style={styles.biometricsTitle}>Log Today's Weight</Text>
          <Text style={styles.biometricsSubtitle}>Keep track of your body composition</Text>
          <View style={styles.weightInputRow}>
            <TextInput
              style={styles.weightInput}
              value={weight}
              onChangeText={handleWeightChange}
              placeholder="0.0"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
            />
            <Text style={styles.weightUnit}>kg</Text>
            <TouchableOpacity
              style={[styles.saveButton, weightSaved && styles.saveButtonSuccess]}
              onPress={handleSaveWeight}
              disabled={!weight || parseFloat(weight) <= 0 || parseFloat(weight) > 250}
              activeOpacity={0.8}
            >
              <Ionicons name={weightSaved ? 'checkmark' : 'save'} size={18} color={colors.text} />
              <Text style={styles.saveButtonText}>{weightSaved ? 'Saved!' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
          {lastWeight && (
            <View style={styles.lastWeightRow}>
              <Ionicons name="trending-down" size={14} color={colors.xpBar} />
              <Text style={styles.lastWeightText}>Last recorded: {lastWeight.weight_kg} kg ({lastWeight.logged_at})</Text>
            </View>
          )}
        </View>

        {/* Quick Stats */}
        <View style={styles.quickStats}>
          <View style={styles.quickStatCard}>
            <Ionicons name="barbell" size={24} color={colors.primary} />
            <Text style={styles.quickStatValue}>{sessionHistory.length}</Text>
            <Text style={styles.quickStatLabel}>Workouts</Text>
          </View>
          <View style={styles.quickStatCard}>
            <Ionicons name="flame" size={24} color={colors.streak} />
            <Text style={styles.quickStatValue}>{user.streak}</Text>
            <Text style={styles.quickStatLabel}>Day Streak</Text>
          </View>
          <View style={styles.quickStatCard}>
            <Ionicons name="stats-chart" size={24} color={colors.xpBar} />
            <Text style={styles.quickStatValue}>{user.xp.toLocaleString()}</Text>
            <Text style={styles.quickStatLabel}>Total XP</Text>
          </View>
        </View>
      </ScrollView>

      {/* Message Coach Modal */}
      <Modal visible={showMsgModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={styles.overlay}>
            <View style={[styles.sheet, { maxHeight: '78%' }]}>
              <View style={styles.chatHeader}>
                <View style={styles.coachAvatar}>
                  <Text style={styles.coachAvatarText}>{coachProfile?.avatar ?? '?'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetTitle}>{coachProfile?.name ?? 'Your Coach'}</Text>
                  <Text style={styles.chatOnline}>● Online</Text>
                </View>
                <TouchableOpacity onPress={() => setShowMsgModal(false)}>
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.chatMessages} showsVerticalScrollIndicator={false}>
                {dbMessages.length === 0 && (
                  <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 20 }}>
                    No messages yet. Say hi!
                  </Text>
                )}
                {dbMessages.map(msg => {
                  const isMe = msg.from_id === userId;
                  return (
                    <View key={msg.id} style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleCoach]}>
                      <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{msg.message}</Text>
                      <Text style={styles.bubbleTime}>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                    </View>
                  );
                })}
              </ScrollView>
              <View style={styles.chatInputRow}>
                <TextInput
                  style={styles.chatInput}
                  value={msgInput}
                  onChangeText={setMsgInput}
                  placeholder="Message your coach..."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                />
                <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
                  <Ionicons name="send" size={18} color={colors.text} />
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
  scrollContent: { padding: 20, paddingBottom: 120 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  greeting: { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  msgBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.xpBar + '22',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.xpBar + '44',
  },
  msgDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.background,
  },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.xpBar,
  },
  avatarText: { color: colors.text, fontSize: 15, fontWeight: '700' },

  // Notification banner
  notifBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.gold + '22',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.gold + '44',
    gap: 10,
  },
  notifLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  notifText: { fontSize: 13, color: colors.text, fontWeight: '500', flex: 1 },

  // Hero card
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
  levelBadge: {
    alignItems: 'center',
    backgroundColor: colors.primary + '22',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  levelLabel: { fontSize: 9, fontWeight: '800', color: colors.primary, letterSpacing: 1.5 },
  levelValue: { fontSize: 28, fontWeight: '900', color: colors.primary },
  heroCenter: { flex: 1 },
  xpText: { fontSize: 13, color: colors.xpBar, fontWeight: '600', marginBottom: 8 },
  xpBarBg: { height: 10, backgroundColor: colors.secondary, borderRadius: 5, overflow: 'hidden', marginBottom: 6 },
  xpBarFill: { height: '100%', backgroundColor: colors.xpBar, borderRadius: 5 },
  xpNextText: { fontSize: 11, color: colors.textSecondary },
  streakBadge: {
    alignItems: 'center',
    backgroundColor: colors.streak + '22',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.streak,
  },
  streakValue: { fontSize: 22, fontWeight: '900', color: colors.streak },
  streakLabel: { fontSize: 9, fontWeight: '600', color: colors.streak, letterSpacing: 1 },
  flameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 16,
  },
  flameItem: { alignItems: 'center', gap: 4 },
  flameDay: { fontSize: 10, color: colors.textSecondary, fontWeight: '600' },

  // Analysis card
  analysisCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  analysisHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  analysisTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  analysisBadge: {
    backgroundColor: colors.xpBar + '22',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  analysisBadgeText: { fontSize: 12, fontWeight: '700', color: colors.xpBar },
  barsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 64, marginBottom: 16 },
  barItem: { alignItems: 'center', flex: 1, gap: 4 },
  barTrack: {
    width: 20,
    height: 52,
    backgroundColor: colors.secondary,
    borderRadius: 6,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  barFill: { width: '100%', backgroundColor: colors.border, borderRadius: 6 },
  barDay: { fontSize: 10, color: colors.textSecondary, fontWeight: '600' },
  analysisStats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 14,
  },
  analysisStat: { flex: 1, alignItems: 'center' },
  analysisVal: { fontSize: 18, fontWeight: '800', color: colors.text },
  analysisLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: '500', marginTop: 2 },
  analysisDivider: { width: 1, backgroundColor: colors.border, marginVertical: 4 },

  // Calorie card
  calorieCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  calorieRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  calorieTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  calorieSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  calsLeft: { alignItems: 'flex-end' },
  calsLeftNum: { fontSize: 22, fontWeight: '900', color: colors.success },
  calsLeftLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },
  calBarBg: { height: 10, backgroundColor: colors.secondary, borderRadius: 5, overflow: 'hidden', marginBottom: 14 },
  calBarFill: { height: '100%', backgroundColor: colors.success, borderRadius: 5 },
  macroRow: { flexDirection: 'row', justifyContent: 'space-around' },
  macroItem: { alignItems: 'center', gap: 4 },
  macroDot: { width: 10, height: 10, borderRadius: 5 },
  macroLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },
  macroVal: { fontSize: 13, fontWeight: '700', color: colors.text },

  // Workout card
  workoutCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  workoutHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  workoutTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  workoutSub: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },
  difficultyBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  difficultyText: { fontSize: 11, fontWeight: '700', color: colors.xpBar },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 10,
  },
  exerciseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  exerciseName: { flex: 1, fontSize: 14, color: colors.text, fontWeight: '500' },
  exerciseMeta: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  moreText: { fontSize: 12, color: colors.textSecondary, marginTop: 10, textAlign: 'center' },

  // Biometrics
  biometricsCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  biometricsTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 4 },
  biometricsSubtitle: { fontSize: 12, color: colors.textSecondary, marginBottom: 16 },
  weightInputRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  weightInput: {
    flex: 1,
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 14,
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    textAlign: 'center',
  },
  weightUnit: { fontSize: 18, fontWeight: '600', color: colors.textSecondary },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  saveButtonSuccess: { backgroundColor: colors.success },
  saveButtonText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  lastWeightRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lastWeightText: { fontSize: 12, color: colors.textSecondary },

  // Quick stats
  quickStats: { flexDirection: 'row', gap: 10 },
  quickStatCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickStatValue: { fontSize: 20, fontWeight: '800', color: colors.text },
  quickStatLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },

  // Modals
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 4 },

  // Chat
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  coachAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.xpBar,
  },
  coachAvatarText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  chatOnline: { fontSize: 12, color: colors.success, marginTop: 2, fontWeight: '600' },
  chatMessages: { maxHeight: 280, marginBottom: 16 },
  bubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
  },
  bubbleCoach: {
    backgroundColor: colors.secondary,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  bubbleMe: {
    backgroundColor: colors.xpBar + '33',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  bubbleText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  bubbleTextMe: { color: colors.xpBar },
  bubbleTime: { fontSize: 10, color: colors.textSecondary, marginTop: 4, textAlign: 'right' },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  chatInput: {
    flex: 1,
    backgroundColor: colors.secondary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: 80,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.xpBar,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
