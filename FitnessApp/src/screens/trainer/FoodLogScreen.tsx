import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { getNutritionPlans, getFoodLogEntries, deleteFoodLogEntry, getMealCompletions, upsertMealCompletion, getTodayMetrics } from '../../lib/db';
import { DBNutritionPlan, DBFoodLogEntry, DBMealCompletion, MealSlot } from '../../lib/supabase';
import { sumTodayAsPlannedNutrition } from '../../lib/nutritionCalc';

const STATUS_META: Record<DBMealCompletion['status'], { icon: string; label: string; color: string }> = {
  as_planned: { icon: 'checkmark-circle', label: 'As Planned', color: colors.success },
  substituted: { icon: 'swap-horizontal', label: 'Substituted', color: colors.warning },
  skipped: { icon: 'close-circle', label: 'Skipped', color: colors.textSecondary },
};

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function formatPlanDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDay(dateStr: string) {
  if (dateStr === todayStr()) return 'Today';
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (dateStr === yesterday) return 'Yesterday';
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function groupByDay(entries: DBFoodLogEntry[]): { date: string; entries: DBFoodLogEntry[] }[] {
  const map = new Map<string, DBFoodLogEntry[]>();
  for (const e of entries) {
    if (!map.has(e.logged_at)) map.set(e.logged_at, []);
    map.get(e.logged_at)!.push(e);
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, entries]) => ({ date, entries }));
}

function MealRow({
  userId,
  plan,
  meal,
  trackable,
  todayCompletion,
  onCompletionSaved,
}: {
  userId: string;
  plan: DBNutritionPlan;
  meal: MealSlot;
  trackable: boolean;
  todayCompletion: DBMealCompletion | undefined;
  onCompletionSaved: (c: DBMealCompletion) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [substituting, setSubstituting] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  // "Change" reveals the As Planned/Substituted/Skipped choices again for a
  // meal that already has today's status set, so the trainee can pick a
  // different one — it used to just re-save 'as_planned' unconditionally,
  // which was a no-op when that was already the status and silently
  // overwrote 'substituted'/'skipped' with no way back to the choices.
  const [changing, setChanging] = useState(false);

  const handleSetStatus = useCallback(async (status: DBMealCompletion['status'], substituteNote: string | null) => {
    setSaving(true);
    try {
      const saved = await upsertMealCompletion(userId, plan.id, meal.slot, todayStr(), status, substituteNote);
      onCompletionSaved(saved);
      setSubstituting(false);
      setNote('');
      setChanging(false);
    } catch (e) {
      console.warn('upsertMealCompletion error', e);
    } finally {
      setSaving(false);
    }
  }, [userId, plan.id, meal.slot, onCompletionSaved]);

  // A prior inline-row version of this input got covered by the keyboard on
  // Android with no reliable way to scroll it into view (measureLayout and
  // measureInWindow-based approaches both proved unreliable in practice) —
  // moved to a modal instead: a modal naturally stays above the keyboard by
  // construction (KeyboardAvoidingView + flex-end sheet), no scroll-position
  // math needed.
  const openSubstitute = useCallback(() => {
    setNote(todayCompletion?.status === 'substituted' ? (todayCompletion.substitute_note ?? '') : '');
    setSubstituting(true);
  }, [todayCompletion]);

  const handleCancelSubstitute = useCallback(() => {
    setSubstituting(false);
    setNote('');
  }, []);

  return (
    <View>
      <TouchableOpacity style={styles.mealSummaryRow} onPress={() => setExpanded(v => !v)} activeOpacity={0.7}>
        <Text style={styles.mealSummaryLabel}>{meal.label}</Text>
        <Text style={styles.mealSummaryName} numberOfLines={1}>{meal.name}</Text>
        <Text style={styles.mealSummaryCal}>{meal.actual_calories} kcal</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textSecondary} />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.mealItemsBlock}>
          {meal.items.map((item, idx) => (
            <Text key={idx} style={styles.mealItemDetailText}>• {item.food} — {item.qty}</Text>
          ))}
        </View>
      )}

      {trackable && (
        <View style={styles.trackRow}>
          {saving ? (
            <ActivityIndicator size="small" color={colors.xpBar} />
          ) : todayCompletion && !changing ? (
            <TouchableOpacity
              style={styles.statusBadge}
              onPress={() => (todayCompletion.status === 'substituted' ? openSubstitute() : undefined)}
            >
              <Ionicons
                name={STATUS_META[todayCompletion.status].icon as any}
                size={14}
                color={STATUS_META[todayCompletion.status].color}
              />
              <Text style={[styles.statusBadgeText, { color: STATUS_META[todayCompletion.status].color }]}>
                {STATUS_META[todayCompletion.status].label}
                {todayCompletion.substitute_note ? `: ${todayCompletion.substitute_note}` : ''}
              </Text>
              <TouchableOpacity onPress={() => setChanging(true)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Text style={styles.changeLink}>Change</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ) : (
            <View style={styles.trackButtons}>
              <TouchableOpacity style={styles.trackBtn} onPress={() => handleSetStatus('as_planned', null)}>
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
                <Text style={[styles.trackBtnText, { color: colors.success }]}>As Planned</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.trackBtn} onPress={openSubstitute}>
                <Ionicons name="swap-horizontal-outline" size={16} color={colors.warning} />
                <Text style={[styles.trackBtnText, { color: colors.warning }]}>Substituted</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.trackBtn} onPress={() => handleSetStatus('skipped', null)}>
                <Ionicons name="close-circle-outline" size={16} color={colors.textSecondary} />
                <Text style={[styles.trackBtnText, { color: colors.textSecondary }]}>Skipped</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      <Modal visible={substituting} transparent animationType="fade" onRequestClose={handleCancelSubstitute}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>What did you have instead?</Text>
              <TextInput
                style={styles.input}
                value={note}
                onChangeText={setNote}
                placeholder="e.g. Grilled chicken instead of salmon"
                placeholderTextColor={colors.textSecondary}
                autoFocus
              />
              <View style={styles.modalFooter}>
                <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelSubstitute}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={() => (note.trim() ? handleSetStatus('substituted', note.trim()) : handleCancelSubstitute())}
                  activeOpacity={0.85}
                >
                  <Ionicons name="checkmark" size={18} color={colors.text} />
                  <Text style={styles.saveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function MealHistory({ plan, completions }: { plan: DBNutritionPlan; completions: DBMealCompletion[] }) {
  const byDate = useMemo(() => {
    const map = new Map<string, DBMealCompletion[]>();
    for (const c of completions) {
      if (c.log_date === todayStr()) continue; // today shown live above, not in history
      if (!map.has(c.log_date)) map.set(c.log_date, []);
      map.get(c.log_date)!.push(c);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 14);
  }, [completions]);

  if (byDate.length === 0) {
    return <Text style={styles.historyEmptyText}>No past days logged yet.</Text>;
  }

  const labelForSlot = (slot: number) => plan.meals?.find(m => m.slot === slot)?.label ?? `Meal ${slot}`;

  return (
    <View>
      {byDate.map(([date, dayCompletions]) => (
        <View key={date} style={styles.historyDayRow}>
          <Text style={styles.historyDate}>{formatDay(date)}</Text>
          <View style={styles.historyBadges}>
            {dayCompletions.map(c => (
              <View key={c.id} style={styles.historyBadge}>
                <Ionicons name={STATUS_META[c.status].icon as any} size={12} color={STATUS_META[c.status].color} />
                <Text style={styles.historyBadgeText}>{labelForSlot(c.meal_slot)}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function NutritionPlanCard({ userId, plan, inactive, completions, onCompletionsChange }: {
  userId: string;
  plan: DBNutritionPlan;
  inactive?: boolean;
  completions: DBMealCompletion[];
  onCompletionsChange: (planId: string, completions: DBMealCompletion[]) => void;
}) {
  const hasTargets = plan.target_calories || plan.target_protein || plan.target_carbs || plan.target_fat || plan.target_water_ml;
  const trackable = !inactive && !!plan.meals && plan.meals.length > 0;

  const [showHistory, setShowHistory] = useState(false);

  const completionsBySlot = useMemo(() => {
    const map = new Map<number, DBMealCompletion>();
    completions.filter(c => c.log_date === todayStr()).forEach(c => map.set(c.meal_slot, c));
    return map;
  }, [completions]);

  const handleCompletionSaved = useCallback((c: DBMealCompletion) => {
    onCompletionsChange(plan.id, [c, ...completions.filter(p => !(p.meal_slot === c.meal_slot && p.log_date === c.log_date))]);
  }, [plan.id, completions, onCompletionsChange]);

  return (
    <View style={[styles.planCard, inactive && styles.planCardInactive]}>
      <View style={styles.planHeader}>
        <Ionicons name="restaurant" size={18} color={inactive ? colors.textSecondary : colors.xpBar} />
        <Text style={styles.planTitle}>{plan.title}</Text>
        {plan.locked && (
          <View style={styles.lockedTag}>
            <Ionicons name="lock-closed" size={10} color={colors.gold} />
            <Text style={styles.lockedTagText}>Locked</Text>
          </View>
        )}
      </View>
      <Text style={styles.planDate}>Created {formatPlanDate(plan.created_at)}</Text>
      {hasTargets ? (
        <View style={styles.targetsRow}>
          {plan.target_calories != null && (
            <View style={styles.targetChip}>
              <Text style={styles.targetChipVal}>{plan.target_calories}</Text>
              <Text style={styles.targetChipLabel}>kcal</Text>
            </View>
          )}
          {plan.target_protein != null && (
            <View style={styles.targetChip}>
              <Text style={styles.targetChipVal}>{plan.target_protein}g</Text>
              <Text style={styles.targetChipLabel}>protein</Text>
            </View>
          )}
          {plan.target_carbs != null && (
            <View style={styles.targetChip}>
              <Text style={styles.targetChipVal}>{plan.target_carbs}g</Text>
              <Text style={styles.targetChipLabel}>carbs</Text>
            </View>
          )}
          {plan.target_fat != null && (
            <View style={styles.targetChip}>
              <Text style={styles.targetChipVal}>{plan.target_fat}g</Text>
              <Text style={styles.targetChipLabel}>fat</Text>
            </View>
          )}
          {plan.target_water_ml != null && (
            <View style={styles.targetChip}>
              <Text style={styles.targetChipVal}>{plan.target_water_ml}ml</Text>
              <Text style={styles.targetChipLabel}>water</Text>
            </View>
          )}
        </View>
      ) : null}
      {plan.notes && <Text style={styles.planNotes}>{plan.notes}</Text>}
      {plan.meals && plan.meals.length > 0 && (
        <View style={{ marginTop: 8, marginBottom: 4 }}>
          {plan.meals.map(m => (
            <MealRow
              key={m.slot}
              userId={userId}
              plan={plan}
              meal={m}
              trackable={trackable}
              todayCompletion={completionsBySlot.get(m.slot)}
              onCompletionSaved={handleCompletionSaved}
            />
          ))}
        </View>
      )}
      {trackable && (
        <TouchableOpacity style={styles.historyToggle} onPress={() => setShowHistory(v => !v)}>
          <Ionicons name="time-outline" size={14} color={colors.xpBar} />
          <Text style={styles.historyToggleText}>{showHistory ? 'Hide History' : 'View History'}</Text>
        </TouchableOpacity>
      )}
      {trackable && showHistory && <MealHistory plan={plan} completions={completions} />}
      {plan.file_url && (
        <TouchableOpacity style={styles.planDocRow} onPress={() => Linking.openURL(plan.file_url!)}>
          <Ionicons name="document-text" size={16} color={colors.xpBar} />
          <Text style={styles.planDocText} numberOfLines={1}>
            {plan.locked ? 'View Full Plan (PDF)' : plan.file_name}
          </Text>
          <Ionicons name="open-outline" size={14} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// A progress bar that fills in its own base color up to `target`, then keeps
// going in `colors.primary` (red) for whatever's over — going over budget
// shows as a red overflow segment on the bar itself rather than just
// recoloring the whole thing. `bgStyle` controls the bar's own height/radius.
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

export default function FoodLogScreen({ userId }: { userId: string }) {
  const [segment, setSegment] = useState<'nutrition' | 'history'>('nutrition');
  const [plans, setPlans] = useState<DBNutritionPlan[]>([]);
  const [entries, setEntries] = useState<DBFoodLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayWaterMl, setTodayWaterMl] = useState(0);
  // Keyed by nutrition_plans.id — lifted up from NutritionPlanCard (rather
  // than each card fetching/owning its own) so today's "As Planned" meal
  // calories can be rolled into the calorie total below, live as they're
  // marked, not just the manual food log.
  const [completionsByPlan, setCompletionsByPlan] = useState<Record<string, DBMealCompletion[]>>({});

  const load = useCallback(async () => {
    const [nutritionPlans, foodEntries, todayMetrics] = await Promise.all([
      getNutritionPlans(userId),
      getFoodLogEntries(userId),
      getTodayMetrics(userId),
    ]);
    setPlans(nutritionPlans);
    setEntries(foodEntries);
    setTodayWaterMl(todayMetrics.water_ml);

    const plansWithMeals = nutritionPlans.filter(p => p.active && p.meals && p.meals.length > 0);
    const completionsList = await Promise.all(plansWithMeals.map(p => getMealCompletions(userId, p.id)));
    const map: Record<string, DBMealCompletion[]> = {};
    plansWithMeals.forEach((p, i) => { map[p.id] = completionsList[i]; });
    setCompletionsByPlan(map);

    setLoading(false);
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleCompletionsChange = useCallback((planId: string, completions: DBMealCompletion[]) => {
    setCompletionsByPlan(prev => ({ ...prev, [planId]: completions }));
  }, []);

  const activePlans = plans.filter(p => p.active);
  const pastPlans = plans.filter(p => !p.active);
  const targetPlan = activePlans.find(p => p.target_calories != null);
  const waterTargetPlan = activePlans.find(p => p.target_water_ml != null);
  const days = groupByDay(entries);

  // Real trainee activity mostly lives here, not in food_log_entries — since
  // the manual "Add Food" entry point was removed, meal tracking (As Planned/
  // Substituted/Skipped) is how a trainee actually logs most days now. Pooled
  // across every plan (not just one) and keyed by date so History reads as a
  // single combined timeline instead of requiring a trainee to open each
  // plan's own history toggle to see anything.
  const plansWithMealHistory = plans.filter(p => (completionsByPlan[p.id]?.length ?? 0) > 0);
  const mealHistoryByDate = useMemo(() => {
    const map = new Map<string, { planTitle: string; slotLabel: string; status: DBMealCompletion['status'] }[]>();
    for (const plan of plans) {
      for (const c of completionsByPlan[plan.id] ?? []) {
        if (c.log_date === todayStr()) continue; // today is shown live on the Nutrition segment
        const slotLabel = plan.meals?.find(m => m.slot === c.meal_slot)?.label ?? `Meal ${c.meal_slot}`;
        if (!map.has(c.log_date)) map.set(c.log_date, []);
        map.get(c.log_date)!.push({ planTitle: plan.title, slotLabel, status: c.status });
      }
    }
    return map;
  }, [plans, completionsByPlan]);
  const historyDates = useMemo(() => {
    const set = new Set<string>([...days.map(d => d.date), ...mealHistoryByDate.keys()]);
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [days, mealHistoryByDate]);
  const todayMealNutrition = sumTodayAsPlannedNutrition(plans, completionsByPlan, todayStr());
  const todayCalories = entries
    .filter(e => e.logged_at === todayStr())
    .reduce((sum, e) => sum + (e.calories ?? 0), 0)
    + todayMealNutrition.calories;

  const handleDelete = useCallback(async (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
    try {
      await deleteFoodLogEntry(id);
    } catch (e) {
      console.warn('deleteFoodLogEntry error', e);
    }
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.segmentRow}>
        <TouchableOpacity
          style={[styles.segment, segment === 'nutrition' && styles.segmentActive]}
          onPress={() => setSegment('nutrition')}
        >
          <Text style={[styles.segmentText, segment === 'nutrition' && styles.segmentTextActive]}>Nutrition</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segment, segment === 'history' && styles.segmentActive]}
          onPress={() => setSegment('history')}
        >
          <Text style={[styles.segmentText, segment === 'history' && styles.segmentTextActive]}>History</Text>
        </TouchableOpacity>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {segment === 'nutrition' ? (
        <>
        <Text style={styles.title}>Nutrition</Text>
        <Text style={styles.subtitle}>Your nutrition plans and daily targets</Text>

        {targetPlan?.target_calories != null && (
          <View style={styles.todayProgressCard}>
            <Text style={[styles.todayProgressText, styles.todayProgressTextCalories]}>
              {todayCalories} / {targetPlan.target_calories} kcal today
            </Text>
            <DualBar
              consumed={todayCalories}
              target={targetPlan.target_calories!}
              baseColor={colors.success}
              bgStyle={styles.progressBg}
            />
            {(targetPlan.target_protein != null || targetPlan.target_carbs != null || targetPlan.target_fat != null) && (
              <View style={styles.macroTargetRow}>
                {[
                  { label: 'Protein', consumed: todayMealNutrition.protein, target: targetPlan.target_protein, color: colors.primary },
                  { label: 'Carbs', consumed: todayMealNutrition.carbs, target: targetPlan.target_carbs, color: '#4A9EFF' },
                  { label: 'Fat', consumed: todayMealNutrition.fat, target: targetPlan.target_fat, color: colors.gold },
                ].filter(m => m.target != null).map(m => (
                  <View key={m.label} style={styles.macroBarRow}>
                    <View style={styles.macroBarLabelRow}>
                      <Text style={[styles.macroBarLabel, { color: m.color }]}>{m.label}</Text>
                      <Text style={styles.macroBarVal}>{m.consumed}g / {m.target}g</Text>
                    </View>
                    <DualBar consumed={m.consumed} target={m.target!} baseColor={colors.success} bgStyle={styles.macroBarBg} />
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {waterTargetPlan?.target_water_ml != null && (
          <View style={styles.todayProgressCard}>
            <Text style={styles.todayProgressText}>
              {todayWaterMl} / {waterTargetPlan.target_water_ml}ml water today
            </Text>
            <View style={styles.progressBg}>
              <View style={[
                styles.progressFill,
                styles.progressFillWater,
                { width: `${Math.min(100, (todayWaterMl / waterTargetPlan.target_water_ml) * 100)}%` as any },
              ]} />
            </View>
          </View>
        )}

        {plans.length === 0 && !loading ? (
          <View style={styles.emptyPlan}>
            <Ionicons name="restaurant-outline" size={32} color={colors.textSecondary} />
            <Text style={styles.emptyPlanText}>Your coach hasn't set up a nutrition plan yet</Text>
          </View>
        ) : (
          <>
            {activePlans.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>ACTIVE PLANS</Text>
                {activePlans.map(plan => (
                  <NutritionPlanCard
                    key={plan.id}
                    userId={userId}
                    plan={plan}
                    completions={completionsByPlan[plan.id] ?? []}
                    onCompletionsChange={handleCompletionsChange}
                  />
                ))}
              </>
            )}
            {pastPlans.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: activePlans.length > 0 ? 8 : 0 }]}>PAST PLANS</Text>
                {pastPlans.map(plan => (
                  <NutritionPlanCard
                    key={plan.id}
                    userId={userId}
                    plan={plan}
                    inactive
                    completions={completionsByPlan[plan.id] ?? []}
                    onCompletionsChange={handleCompletionsChange}
                  />
                ))}
              </>
            )}
          </>
        )}
        </>
        ) : (
        <>
        <Text style={styles.title}>History</Text>
        <Text style={styles.subtitle}>Everything you've logged, by day</Text>

        {historyDates.length === 0 ? (
          <View style={styles.emptyPlan}>
            <Ionicons name="time-outline" size={32} color={colors.textSecondary} />
            <Text style={styles.emptyPlanText}>Nothing logged yet</Text>
          </View>
        ) : (
          historyDates.map(date => {
            const dayEntries = days.find(d => d.date === date)?.entries ?? [];
            const dayMeals = mealHistoryByDate.get(date) ?? [];
            return (
              <View key={date} style={styles.dayGroup}>
                <Text style={styles.dayLabel}>{formatDay(date)}</Text>
                {dayMeals.length > 0 && (
                  <View style={[styles.historyBadges, dayEntries.length > 0 && { marginBottom: 8 }]}>
                    {dayMeals.map((m, i) => (
                      <View key={i} style={styles.historyBadge}>
                        <Ionicons name={STATUS_META[m.status].icon as any} size={12} color={STATUS_META[m.status].color} />
                        <Text style={styles.historyBadgeText}>
                          {plansWithMealHistory.length > 1 ? `${m.planTitle} • ${m.slotLabel}` : m.slotLabel}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
                {dayEntries.map(entry => (
                  <View key={entry.id} style={styles.foodRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.foodName}>{entry.food_name}</Text>
                      {entry.calories != null && <Text style={styles.foodCalories}>{entry.calories} kcal</Text>}
                    </View>
                    <TouchableOpacity onPress={() => handleDelete(entry.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="trash-outline" size={16} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            );
          })
        )}
        </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 6, marginTop: 8 },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 20 },

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

  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1.5, marginBottom: 10 },
  planCard: {
    backgroundColor: colors.card, borderRadius: 16, padding: 18, marginBottom: 12,
    borderWidth: 1, borderColor: colors.xpBar + '44',
  },
  planCardInactive: { borderColor: colors.border, opacity: 0.7 },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planTitle: { fontSize: 17, fontWeight: '700', color: colors.text, flex: 1 },
  lockedTag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.gold + '22', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
  },
  lockedTagText: { fontSize: 10, fontWeight: '700', color: colors.gold },
  planDate: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  mealSummaryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  mealSummaryLabel: { fontSize: 11, fontWeight: '700', color: colors.xpBar, width: 56 },
  mealSummaryName: { fontSize: 13, color: colors.text, flex: 1 },
  mealSummaryCal: { fontSize: 12, color: colors.textSecondary },
  mealItemsBlock: { paddingVertical: 8, paddingLeft: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  mealItemDetailText: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  trackRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  trackButtons: { flexDirection: 'row', gap: 8 },
  trackBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1,
    justifyContent: 'center', paddingVertical: 8, borderRadius: 8,
    backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border,
  },
  trackBtnText: { fontSize: 11, fontWeight: '700' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusBadgeText: { fontSize: 12, fontWeight: '600', flex: 1 },
  changeLink: { fontSize: 11, color: colors.xpBar, fontWeight: '700' },
  historyToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    marginTop: 10,
  },
  historyToggleText: { fontSize: 12, fontWeight: '700', color: colors.xpBar },
  historyEmptyText: { fontSize: 12, color: colors.textSecondary, marginTop: 8 },
  historyDayRow: { marginTop: 10 },
  historyDate: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginBottom: 4 },
  historyBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  historyBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.secondary, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  historyBadgeText: { fontSize: 10, color: colors.textSecondary, fontWeight: '600' },
  targetsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  targetChip: {
    backgroundColor: colors.secondary, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border, minWidth: 70,
  },
  targetChipVal: { fontSize: 15, fontWeight: '800', color: colors.xpBar },
  targetChipLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: '600', marginTop: 2 },
  planNotes: { fontSize: 13, color: colors.textSecondary, marginTop: 14, lineHeight: 19 },
  planDocRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14,
    paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border,
  },
  planDocText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text },
  todayProgressCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  todayProgressText: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 8 },
  todayProgressTextCalories: { color: colors.textSecondary },
  progressBg: { height: 8, backgroundColor: colors.secondary, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.xpBar, borderRadius: 4 },
  progressFillWater: { backgroundColor: colors.primary },
  macroTargetRow: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
  macroBarRow: { marginBottom: 10 },
  macroBarLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  macroBarLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  macroBarVal: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  macroBarBg: { height: 6, backgroundColor: colors.secondary, borderRadius: 3, overflow: 'hidden' },

  emptyPlan: { alignItems: 'center', paddingVertical: 24, gap: 10, marginBottom: 8 },
  emptyPlanText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 24 },

  dayGroup: { marginBottom: 18 },
  dayLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1.5, marginBottom: 10 },
  foodRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  foodName: { fontSize: 14, fontWeight: '600', color: colors.text },
  foodCalories: { fontSize: 12, color: colors.xpBar, marginTop: 2, fontWeight: '600' },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 20 },
  input: {
    backgroundColor: colors.secondary, borderRadius: 12, padding: 14, fontSize: 16, color: colors.text,
    borderWidth: 1, borderColor: colors.border, marginBottom: 16,
  },
  modalFooter: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: { flex: 1, padding: 15, borderRadius: 12, backgroundColor: colors.secondary, alignItems: 'center' },
  cancelText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  saveBtn: {
    flex: 1, padding: 15, borderRadius: 12, backgroundColor: colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  saveText: { color: colors.text, fontSize: 15, fontWeight: '700' },
});
