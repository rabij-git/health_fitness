import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Pedometer } from 'expo-sensors';
import { colors } from '../../theme/colors';
import { getXpForNextLevel, getCurrentLevelXp } from '../../data/mockData';
import {
  getProfile,
  logBodyWeight,
  getWeightLogs,
  getMessages,
  sendMessage,
  markMessagesRead,
  getTodayMetrics,
  setTodaySteps,
  addTodayWater,
  setTodayHeartRate,
  getNutritionPlans,
  getFoodLogEntries,
  getMealCompletions,
  getWorkoutsForTrainee,
  getWorkoutIdsCompletedToday,
  TodayVitals,
} from '../../lib/db';
import { DBUser, DBWeightLog, DBMessage, DBNutritionPlan, DBFoodLogEntry, DBMealCompletion, DBWorkout } from '../../lib/supabase';
import { sumTodayAsPlannedNutrition } from '../../lib/nutritionCalc';

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// Mirrors the same helper duplicated in WorkoutScreen.tsx/CoachTrainees.tsx —
// scheduled_days is null/empty = any day, otherwise must include today.
function isScheduledForToday(workout: DBWorkout): boolean {
  if (!workout.scheduled_days || workout.scheduled_days.length === 0) return true;
  return workout.scheduled_days.includes(new Date().getDay());
}

// A progress bar that fills in its own base color up to `target`, then keeps
// going in `colors.primary` (red) for whatever's over — so going over
// budget shows as a red overflow segment on the bar itself, rather than
// just recoloring the whole thing. `bgStyle` controls the bar's own height/
// radius/background (calorie vs. macro bars use different sizes).
function DualBar({ consumed, target, baseColor, bgStyle }: { consumed: number; target: number; baseColor: string; bgStyle: any }) {
  const barMax = Math.max(consumed, target, 1);
  const baseWidthPct = (Math.min(consumed, target) / barMax) * 100;
  const overWidthPct = consumed > target ? ((consumed - target) / barMax) * 100 : 0;
  return (
    <View style={bgStyle}>
      <View style={{ flexDirection: 'row', height: '100%' }}>
        <View style={{ width: `${baseWidthPct}%` as any, height: '100%', backgroundColor: baseColor }} />
        {overWidthPct > 0 && (
          <View style={{ width: `${overWidthPct}%` as any, height: '100%', backgroundColor: colors.primary }} />
        )}
      </View>
    </View>
  );
}

interface Props {
  onLogout: () => void;
  userId: string;
  navigation?: any;
}

export default function TrainerDashboard({ onLogout, userId, navigation }: Props) {
  const [profile, setProfile] = useState<DBUser | null>(null);
  const [coachProfile, setCoachProfile] = useState<DBUser | null>(null);
  const [weightLogs, setWeightLogs] = useState<DBWeightLog[]>([]);
  const [dbMessages, setDbMessages] = useState<DBMessage[]>([]);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [weight, setWeight] = useState('');
  const [weightSaved, setWeightSaved] = useState(false);
  const [showMsgModal, setShowMsgModal] = useState(false);
  const [msgInput, setMsgInput] = useState('');
  const [dismissedNotifs, setDismissedNotifs] = useState<string[]>([]);

  const [dailyMetrics, setDailyMetrics] = useState<TodayVitals>({ steps: 0, water_ml: 0, heart_rate: null });
  const [nutritionPlans, setNutritionPlans] = useState<DBNutritionPlan[]>([]);
  const [foodEntries, setFoodEntries] = useState<DBFoodLogEntry[]>([]);
  const [mealCompletionsByPlan, setMealCompletionsByPlan] = useState<Record<string, DBMealCompletion[]>>({});
  const [pedometerAvailable, setPedometerAvailable] = useState(false);
  const [hrInput, setHrInput] = useState('');
  const [savingHr, setSavingHr] = useState(false);
  const [loggingWaterAmount, setLoggingWaterAmount] = useState<number | null>(null);
  const [workouts, setWorkouts] = useState<DBWorkout[]>([]);
  const [completedTodayIds, setCompletedTodayIds] = useState<Set<string>>(new Set());

  const loadHome = useCallback(async () => {
    const [p, weights, metrics, plans, entries, workoutList, completedIds] = await Promise.all([
      getProfile(userId),
      getWeightLogs(userId),
      getTodayMetrics(userId),
      getNutritionPlans(userId),
      getFoodLogEntries(userId),
      getWorkoutsForTrainee(userId),
      getWorkoutIdsCompletedToday(userId),
    ]);
    setProfile(p);
    setCoachId(p?.coach_id ?? null);
    setWeightLogs(weights);
    setDailyMetrics(metrics);
    setNutritionPlans(plans);
    setFoodEntries(entries);
    setWorkouts(workoutList);
    setCompletedTodayIds(completedIds);
    setLoadingProfile(false);

    const plansWithMeals = plans.filter(p => p.active && p.meals && p.meals.length > 0);
    const completionsList = await Promise.all(plansWithMeals.map(p => getMealCompletions(userId, p.id)));
    const completionsMap: Record<string, DBMealCompletion[]> = {};
    plansWithMeals.forEach((p, i) => { completionsMap[p.id] = completionsList[i]; });
    setMealCompletionsByPlan(completionsMap);
  }, [userId]);

  // Steps come straight from the phone's own motion sensor — read today's
  // running total on mount, then again whenever it changes during the
  // session (watchStepCount only signals a change, not a day total, so we
  // just re-fetch the historical count each time rather than track deltas).
  useEffect(() => {
    let subscription: { remove: () => void } | undefined;
    Pedometer.isAvailableAsync().then(available => {
      setPedometerAvailable(available);
      if (!available || Platform.OS !== 'ios') return;
      const syncSteps = () => {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        Pedometer.getStepCountAsync(start, new Date())
          .then(result => {
            setTodaySteps(userId, result.steps).catch(() => {});
            setDailyMetrics(prev => ({ ...prev, steps: result.steps }));
          })
          .catch(() => {});
      };
      syncSteps();
      subscription = Pedometer.watchStepCount(syncSteps);
    });
    return () => subscription?.remove();
  }, [userId]);

  const handleAddWater = useCallback(async (ml: number) => {
    if (loggingWaterAmount !== null) return;
    setLoggingWaterAmount(ml);
    try {
      const updated = await addTodayWater(userId, ml);
      setDailyMetrics(prev => ({ ...prev, water_ml: updated.water_ml }));
    } catch (e) {
      console.warn('addTodayWater error', e);
    } finally {
      setLoggingWaterAmount(null);
    }
  }, [userId, loggingWaterAmount]);

  const handleSaveHeartRate = useCallback(async () => {
    const bpm = parseInt(hrInput, 10);
    if (!bpm || savingHr) return;
    setSavingHr(true);
    try {
      await setTodayHeartRate(userId, bpm);
      setDailyMetrics(prev => ({ ...prev, heart_rate: bpm }));
      setHrInput('');
    } catch (e) {
      console.warn('setTodayHeartRate error', e);
    } finally {
      setSavingHr(false);
    }
  }, [userId, hrInput, savingHr]);

  // Refetch every time the Home tab regains focus (not just on first mount) —
  // otherwise finishing a workout on the Workout tab (which updates xp/level/streak)
  // never shows up here since bottom-tab screens stay mounted between tab switches.
  useFocusEffect(useCallback(() => { loadHome(); }, [loadHome]));

  // Also refetch coach messages on every focus, not just when coachId first
  // becomes known — otherwise the unread-message badge goes stale the moment
  // you leave and return to Home, since it never re-checks for new messages.
  useFocusEffect(useCallback(() => {
    if (!coachId) return;
    Promise.all([
      getMessages(userId, coachId),
      getProfile(coachId),
    ]).then(([messages, coach]) => {
      setDbMessages(messages);
      setCoachProfile(coach);
    });
  }, [coachId, userId]));

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

  // Calories card: today's logged intake against the active nutrition plan's
  // target (same source FoodLogScreen's Nutrition tab uses) — manual food log
  // entries plus any generated meals marked "As Planned" today (via
  // sumTodayAsPlannedNutrition, shared with FoodLogScreen so the two screens
  // never disagree). food_log_entries only tracks total calories, not a macro
  // breakdown, so today's protein/carbs/fat only reflect planned-meal tracking.
  const { nutritionTargetPlan, todayCalories, todayProtein, todayCarbs, todayFat } = useMemo(() => {
    const targetPlan = nutritionPlans.find(p => p.active && p.target_calories != null) ?? null;
    const manualCalories = foodEntries
      .filter(e => e.logged_at === todayStr())
      .reduce((sum, e) => sum + (e.calories ?? 0), 0);
    const meals = sumTodayAsPlannedNutrition(nutritionPlans, mealCompletionsByPlan, todayStr());
    return {
      nutritionTargetPlan: targetPlan,
      todayCalories: manualCalories + meals.calories,
      todayProtein: meals.protein,
      todayCarbs: meals.carbs,
      todayFat: meals.fat,
    };
  }, [nutritionPlans, foodEntries, mealCompletionsByPlan]);

  // Same "doable right now" rule as the Workout tab's own picker: active,
  // scheduled for today (or unrestricted), and not already completed today.
  const todoWorkouts = useMemo(
    () => workouts.filter(w => w.active && !completedTodayIds.has(w.id) && isScheduledForToday(w)),
    [workouts, completedTodayIds]
  );

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
              <Ionicons name="log-out-outline" size={20} color={colors.text} />
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

        {/* Today's Activity — steps auto-sync from the phone; weight, water,
            and heart rate are logged manually right here. */}
        <View style={styles.biometricsCard}>
          <Text style={styles.biometricsTitle}>Today's Activity</Text>
          <Text style={styles.biometricsSubtitle}>Steps, weight, water & heart rate</Text>

          <View style={styles.activityStatsRow}>
            <View style={styles.activityStat}>
              <Ionicons name="walk-outline" size={20} color={colors.xpBar} />
              <Text style={styles.activityStatValue}>{dailyMetrics.steps.toLocaleString()}</Text>
              <Text style={styles.activityStatLabel}>Steps</Text>
            </View>
            <View style={styles.activityStat}>
              <Ionicons name="scale-outline" size={20} color={colors.primary} />
              <Text style={styles.activityStatValue}>{lastWeight ? `${lastWeight.weight_kg}kg` : '—'}</Text>
              <Text style={styles.activityStatLabel}>Weight</Text>
            </View>
            <View style={styles.activityStat}>
              <Ionicons name="water-outline" size={20} color={colors.accent} />
              <Text style={styles.activityStatValue}>{dailyMetrics.water_ml}ml</Text>
              <Text style={styles.activityStatLabel}>Water</Text>
            </View>
            <View style={styles.activityStat}>
              <Ionicons name="heart-outline" size={20} color={colors.streak} />
              <Text style={styles.activityStatValue}>{dailyMetrics.heart_rate ?? '—'}</Text>
              <Text style={styles.activityStatLabel}>BPM</Text>
            </View>
          </View>
          {!pedometerAvailable && (
            <Text style={styles.activityHint}>Step counting isn't available on this device.</Text>
          )}

          <View style={[styles.weightInputRow, styles.logRow]}>
            <Text style={styles.logRowLabel} numberOfLines={1}>LOG WEIGHT</Text>
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
              <Ionicons name="checkmark" size={15} color={colors.text} />
            </TouchableOpacity>
          </View>
          {lastWeight && (
            <View style={styles.lastWeightRow}>
              <Ionicons name="trending-down" size={14} color={colors.xpBar} />
              <Text style={styles.lastWeightText}>Last recorded: {lastWeight.weight_kg} kg ({lastWeight.logged_at})</Text>
            </View>
          )}

          <View style={[styles.waterBtnRow, styles.logRow, { marginTop: 16 }]}>
            <Text style={styles.logRowLabel} numberOfLines={1}>LOG WATER</Text>
            {[250, 500].map(ml => (
              <TouchableOpacity
                key={ml}
                style={styles.waterBtn}
                onPress={() => handleAddWater(ml)}
                disabled={loggingWaterAmount !== null}
              >
                {loggingWaterAmount === ml ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.waterBtnText}>+{ml}ml</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.hrRow, styles.logRow, { marginTop: 16 }]}>
            <Text style={styles.logRowLabel} numberOfLines={1}>LOG HEART RATE</Text>
            <TextInput
              style={styles.hrInput}
              value={hrInput}
              onChangeText={v => setHrInput(v.replace(/[^0-9]/g, ''))}
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
            />
            <Text style={styles.weightUnit}>bpm</Text>
            <TouchableOpacity
              style={[styles.hrSaveBtn, (!hrInput || savingHr) && { opacity: 0.5 }]}
              onPress={handleSaveHeartRate}
              disabled={!hrInput || savingHr}
            >
              {savingHr ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <Ionicons name="checkmark" size={15} color={colors.text} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Workout Today — workouts actually doable right now (active,
            scheduled for today, not already completed today). Tapping one
            jumps to the Workout tab with that workout pre-selected and ready
            to start, via the same openXId route-param pattern CoachDashboard
            uses to deep-link into CoachTrainees. */}
        {todoWorkouts.length > 0 && (
          <View style={styles.workoutTodayCard}>
            <Text style={styles.workoutTodayTitle}>Workout Today</Text>
            {todoWorkouts.map((w, i) => (
              <TouchableOpacity
                key={w.id}
                style={[styles.workoutTodayRow, i < todoWorkouts.length - 1 && styles.workoutTodayRowDivider]}
                onPress={() => navigation?.navigate('Workout', { openWorkoutId: w.id })}
                activeOpacity={0.8}
              >
                <View style={styles.workoutTodayIcon}>
                  <Ionicons name="barbell" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.workoutTodayName}>{w.name}</Text>
                  <Text style={styles.workoutTodayMeta}>{w.duration} • {w.difficulty}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Calorie Bar — real data from the active nutrition plan + today's
            food log (see FoodLogScreen's Nutrition tab for the same numbers).
            Macros shown are the plan's targets, not what was actually eaten —
            food_log_entries only tracks total calories, no macro breakdown. */}
        {(() => {
          return (
        <View style={styles.calorieCard}>
          <View style={styles.calorieRow}>
            <View>
              <Text style={styles.calorieTitle}>Calories Today</Text>
              <Text style={styles.calorieSub} numberOfLines={1}>
                {nutritionTargetPlan ? nutritionTargetPlan.title : 'No active nutrition plan'}
              </Text>
            </View>
            <View style={styles.calsLeft}>
              <Text style={styles.calsLeftNum}>
                {nutritionTargetPlan ? `${todayCalories} / ${nutritionTargetPlan.target_calories}` : '—'}
              </Text>
              <Text style={styles.calsLeftLabel}>
                {nutritionTargetPlan ? 'kcal today' : 'no target set'}
              </Text>
            </View>
          </View>
          {nutritionTargetPlan ? (
            <DualBar
              consumed={todayCalories}
              target={nutritionTargetPlan.target_calories!}
              baseColor={colors.success}
              bgStyle={styles.calBarBg}
            />
          ) : (
            <View style={styles.calBarBg} />
          )}
          {nutritionTargetPlan && (nutritionTargetPlan.target_protein != null || nutritionTargetPlan.target_carbs != null || nutritionTargetPlan.target_fat != null) && (
            <>
              <Text style={styles.macroCaption}>MACROS TODAY</Text>
              {[
                { label: 'Protein', consumed: todayProtein, target: nutritionTargetPlan.target_protein, color: colors.primary },
                { label: 'Carbs', consumed: todayCarbs, target: nutritionTargetPlan.target_carbs, color: '#4A9EFF' },
                { label: 'Fat', consumed: todayFat, target: nutritionTargetPlan.target_fat, color: colors.gold },
              ].filter(m => m.target != null).map(m => (
                <View key={m.label} style={styles.macroBarRow}>
                  <View style={styles.macroBarLabelRow}>
                    <Text style={[styles.macroBarLabel, { color: m.color }]}>{m.label}</Text>
                    <Text style={styles.macroBarVal}>{m.consumed}g / {m.target}g</Text>
                  </View>
                  <DualBar consumed={m.consumed} target={m.target!} baseColor={colors.success} bgStyle={styles.macroBarBg} />
                </View>
              ))}
            </>
          )}
        </View>
          );
        })()}

      </ScrollView>

      {/* Message Coach Modal */}
      <Modal visible={showMsgModal} transparent animationType="slide" onRequestClose={() => setShowMsgModal(false)}>
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

  // Workout Today card
  workoutTodayCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  workoutTodayTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 },
  workoutTodayRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10,
  },
  workoutTodayRowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  workoutTodayIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center',
  },
  workoutTodayName: { fontSize: 15, fontWeight: '700', color: colors.text },
  workoutTodayMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

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
  calsLeftNum: { fontSize: 22, fontWeight: '900', color: colors.textSecondary },
  calsLeftLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },
  calBarBg: { height: 10, backgroundColor: colors.secondary, borderRadius: 5, overflow: 'hidden', marginBottom: 14 },
  macroCaption: { fontSize: 10, color: colors.textSecondary, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  macroBarRow: { marginBottom: 10 },
  macroBarLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  macroBarLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  macroBarVal: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  macroBarBg: { height: 6, backgroundColor: colors.secondary, borderRadius: 3, overflow: 'hidden' },

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
  activityStatsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 },
  activityStat: { alignItems: 'center', gap: 4 },
  activityStatValue: { fontSize: 15, fontWeight: '800', color: colors.text },
  activityStatLabel: { fontSize: 10, color: colors.textSecondary },
  activityHint: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginBottom: 8 },
  activitySectionLabel: {
    fontSize: 10, fontWeight: '700', color: colors.textSecondary,
    letterSpacing: 1.2, marginBottom: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14,
  },
  logRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 },
  logRowLabel: { fontSize: 10, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1 },
  waterBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  waterBtn: {
    height: 34, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.secondary, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  waterBtnText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  hrRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hrInput: {
    width: 72, height: 44, backgroundColor: colors.secondary, borderRadius: 12, padding: 10,
    color: colors.text, fontSize: 14, borderWidth: 1, borderColor: colors.border,
  },
  hrSaveBtn: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  weightInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  weightInput: {
    width: 72,
    height: 44,
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 10,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  weightUnit: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  saveButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonSuccess: { backgroundColor: colors.success },
  lastWeightRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lastWeightText: { fontSize: 12, color: colors.textSecondary },

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
