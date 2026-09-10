import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { getVitalsHistory, getProfile, updateProfile, createCalculatedNutritionPlan, updateNutritionPlan } from '../../lib/db';
import { DBUser, DBNutritionPlan, MacroSplit, MealSlot } from '../../lib/supabase';
import {
  ActivityLevel,
  Sex,
  ACTIVITY_MULTIPLIERS,
  ACTIVITY_LABELS,
  ageFromBirthYear,
  calculateBMR,
  calculateTDEE,
  macroSplitTotal,
  isMacroSplitValid,
  macroGramsFromSplit,
  splitIntoMealTargets,
  MEAL_SLOT_LABELS,
} from '../../lib/nutritionCalc';
import { generateMealForSlot, scaleTemplateToTarget, templatesForMealType, MealTemplate, MealType, Diet } from '../../data/mealLibrary';

interface Props {
  visible: boolean;
  trainee: DBUser;
  coachId: string;
  onClose: () => void;
  onPlanCreated: (plan: DBNutritionPlan) => void;
}

type Step = 'biometrics' | 'calories' | 'macros' | 'meals' | 'review';
const STEPS: Step[] = ['biometrics', 'calories', 'macros', 'meals', 'review'];
const STEP_LABELS: Record<Step, string> = {
  biometrics: 'Biometrics',
  calories: 'Calories',
  macros: 'Macros',
  meals: 'Meals',
  review: 'Review',
};

const ACTIVITY_LEVELS: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
const DIET_OPTIONS: { value: Diet; label: string }[] = [
  { value: 'omnivore', label: 'Omnivore' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'pescatarian', label: 'Pescatarian' },
];

const MIN_BIRTH_YEAR = 1940;
const CURRENT_YEAR = new Date().getFullYear();
const MIN_AGE = 10;
const MAX_BIRTH_YEAR = CURRENT_YEAR - MIN_AGE;
const MIN_HEIGHT_CM = 100;
const MAX_HEIGHT_CM = 250;

function sanitizeYear(v: string) {
  return v.replace(/[^0-9]/g, '').slice(0, 4);
}
function sanitizeHeight(v: string) {
  const cleaned = v.replace(/[^0-9.]/g, '');
  return parseFloat(cleaned) > MAX_HEIGHT_CM ? String(MAX_HEIGHT_CM) : cleaned;
}
function sanitizePct(v: string) {
  return v.replace(/[^0-9]/g, '').slice(0, 3);
}
function isValidBirthYear(v: string) {
  const year = parseInt(v, 10);
  return v.length === 4 && year >= MIN_BIRTH_YEAR && year <= MAX_BIRTH_YEAR;
}
function isValidHeight(v: string) {
  const h = parseFloat(v);
  return !isNaN(h) && h >= MIN_HEIGHT_CM && h <= MAX_HEIGHT_CM;
}

export default function CalorieCalculatorModal({ visible, trainee, coachId, onClose, onPlanCreated }: Props) {
  const [step, setStep] = useState<Step>('biometrics');

  const [birthYear, setBirthYear] = useState('');
  const [sex, setSex] = useState<Sex | null>(null);
  const [heightCm, setHeightCm] = useState('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | null>(null);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [loadingWeight, setLoadingWeight] = useState(true);
  const [savingBiometrics, setSavingBiometrics] = useState(false);
  // Year of birth / sex / height are the trainee's own biometric facts, not
  // coach-assigned data — once either side has set one, the coach can only
  // view it here (it stays editable from the trainee's own Profile screen).
  // A field the trainee never filled in can still be entered by the coach
  // once; it locks the same way on the next time this modal is opened.
  const [lockedFields, setLockedFields] = useState({ birthYear: false, sex: false, height: false });

  const [totalCalories, setTotalCalories] = useState('');
  const [overrideApplied, setOverrideApplied] = useState(false);
  const [waterMl, setWaterMl] = useState('');

  const [proteinPct, setProteinPct] = useState('30');
  const [carbsPct, setCarbsPct] = useState('40');
  const [fatPct, setFatPct] = useState('30');

  const [mealCount, setMealCount] = useState<3 | 4 | 5>(3);
  const [diet, setDiet] = useState<Diet>('omnivore');
  const [mealSlots, setMealSlots] = useState<MealSlot[]>([]);
  // Index of the meal slot currently choosing a meal from the dropdown list,
  // or null when the picker is closed.
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setStep('biometrics');
    // Seed from the trainee prop immediately (avoids a blank flash), then
    // overwrite with a fresh profile fetch below — the prop can be stale if
    // this same modal instance already saved biometrics once this session
    // (the parent's trainee object isn't refetched after that save), which
    // previously caused a second "Build Calorie Plan" to reset already-saved
    // fields back to blank and silently break the calorie auto-fill.
    setBirthYear(trainee.birth_year ? String(trainee.birth_year) : '');
    setSex(trainee.sex ?? null);
    setHeightCm(trainee.height_cm ? String(trainee.height_cm) : '');
    setActivityLevel(trainee.activity_level ?? null);
    setLockedFields({
      birthYear: trainee.birth_year != null,
      sex: trainee.sex != null,
      height: trainee.height_cm != null,
    });
    setTotalCalories('');
    setOverrideApplied(false);
    setWaterMl('');
    setProteinPct('30');
    setCarbsPct('40');
    setFatPct('30');
    setMealCount(3);
    setDiet('omnivore');
    setMealSlots([]);
    setTitle(`${trainee.name.split(' ')[0]}'s Nutrition Plan`);
    setNotes('');

    setLoadingWeight(true);
    Promise.all([getProfile(trainee.id), getVitalsHistory(trainee.id, 'weight', 1)])
      .then(([profile, rows]) => {
        const freshSex = profile?.sex ?? trainee.sex ?? null;
        const freshHeightCm = profile?.height_cm ?? trainee.height_cm ?? null;
        const freshActivityLevel = profile?.activity_level ?? trainee.activity_level ?? null;
        const freshBirthYear = profile?.birth_year ?? trainee.birth_year ?? null;
        const freshWeightKg = rows[0]?.metric_value ?? null;

        if (profile) {
          setBirthYear(freshBirthYear ? String(freshBirthYear) : '');
          setSex(freshSex);
          setHeightCm(freshHeightCm ? String(freshHeightCm) : '');
          setActivityLevel(freshActivityLevel);
          setLockedFields({
            birthYear: freshBirthYear != null,
            sex: freshSex != null,
            height: freshHeightCm != null,
          });
        }
        setWeightKg(freshWeightKg);

        // Compute the suggested total directly here, rather than relying on
        // the sync effect below — if this trainee's biometrics are unchanged
        // since the last time the wizard was open, the computed value comes
        // out identical, so that effect's dependencies never change and it
        // never re-fires, leaving totalCalories stuck at the '' this same
        // reset just set above. Setting it directly here has no such gap.
        const freshAge = freshBirthYear ? ageFromBirthYear(freshBirthYear) : null;
        if (freshSex && freshHeightCm && freshWeightKg && freshAge != null && freshAge > 0 && freshActivityLevel) {
          const freshBmr = calculateBMR(freshSex, freshWeightKg, freshHeightCm, freshAge);
          setTotalCalories(String(calculateTDEE(freshBmr, freshActivityLevel)));
        }
      })
      .finally(() => setLoadingWeight(false));
  }, [visible, trainee]);

  const age = birthYear.length === 4 ? ageFromBirthYear(parseInt(birthYear, 10)) : null;

  const bmr = useMemo(() => {
    if (!sex || !heightCm || !weightKg || age == null || age <= 0) return null;
    const h = parseFloat(heightCm);
    if (!h || h <= 0) return null;
    return calculateBMR(sex, weightKg, h, age);
  }, [sex, heightCm, weightKg, age]);

  const suggestedTdee = useMemo(() => {
    if (bmr == null || !activityLevel) return null;
    return calculateTDEE(bmr, activityLevel);
  }, [bmr, activityLevel]);

  useEffect(() => {
    if (suggestedTdee != null && !overrideApplied) {
      setTotalCalories(String(suggestedTdee));
    }
  }, [suggestedTdee, overrideApplied]);

  const macroSplit: MacroSplit = {
    protein_pct: parseInt(proteinPct || '0', 10),
    carbs_pct: parseInt(carbsPct || '0', 10),
    fat_pct: parseInt(fatPct || '0', 10),
  };
  const macroTotal = macroSplitTotal(macroSplit);
  const macroValid = isMacroSplitValid(macroSplit);

  const totalCaloriesNum = parseInt(totalCalories || '0', 10);
  const grams = useMemo(() => macroGramsFromSplit(totalCaloriesNum, macroSplit), [totalCaloriesNum, macroSplit]);

  const biometricsComplete = !!(
    sex && activityLevel && weightKg &&
    isValidBirthYear(birthYear) &&
    isValidHeight(heightCm)
  );

  const handleAutoBalance = useCallback((edited: 'protein' | 'carbs' | 'fat') => {
    const p = parseInt(proteinPct || '0', 10);
    const c = parseInt(carbsPct || '0', 10);
    const f = parseInt(fatPct || '0', 10);
    if (edited === 'protein') setFatPct(String(Math.max(0, 100 - p - c)));
    else if (edited === 'carbs') setFatPct(String(Math.max(0, 100 - p - c)));
    else setCarbsPct(String(Math.max(0, 100 - p - f)));
  }, [proteinPct, carbsPct, fatPct]);

  const saveBiometricsAndNext = useCallback(async () => {
    setSavingBiometrics(true);
    try {
      await updateProfile(trainee.id, {
        birth_year: parseInt(birthYear, 10),
        sex: sex!,
        height_cm: parseFloat(heightCm),
        activity_level: activityLevel!,
      });
      setLockedFields({ birthYear: true, sex: true, height: true });
      setStep('calories');
    } catch (e) {
      Alert.alert('Error', 'Could not save biometrics. Please try again.');
      console.warn('saveBiometrics error', e);
    } finally {
      setSavingBiometrics(false);
    }
  }, [trainee.id, birthYear, sex, heightCm, activityLevel]);

  const mealTypesForCount = MEAL_SLOT_LABELS[mealCount] as MealType[];

  const handleGenerateMeals = useCallback(() => {
    const targets = splitIntoMealTargets(totalCaloriesNum, grams, mealCount);
    const generated = targets.map((t, i) => generateMealForSlot(t, mealTypesForCount[i], diet));
    setMealSlots(generated);
    setStep('meals');
  }, [totalCaloriesNum, grams, mealCount, mealTypesForCount, diet]);

  // Every template eligible for the slot currently open in the picker —
  // templatesForMealType already applies the diet nesting (a pescatarian
  // trainee's list includes pescatarian/vegetarian/vegan templates, etc.).
  const pickerOptions = useMemo(() => {
    if (pickerIndex == null) return [];
    return templatesForMealType(mealTypesForCount[pickerIndex], diet);
  }, [pickerIndex, mealTypesForCount, diet]);

  const handleSelectFromPicker = useCallback((template: MealTemplate) => {
    setMealSlots(prev => {
      if (pickerIndex == null) return prev;
      const current = prev[pickerIndex];
      const target = {
        slot: current.slot,
        target_calories: current.target_calories,
        target_protein: current.target_protein,
        target_carbs: current.target_carbs,
        target_fat: current.target_fat,
      };
      const copy = [...prev];
      copy[pickerIndex] = scaleTemplateToTarget(template, target);
      return copy;
    });
    setPickerIndex(null);
  }, [pickerIndex]);

  const handleFinalize = useCallback(async () => {
    if (!sex || !activityLevel || bmr == null || suggestedTdee == null || !weightKg) return;
    setFinalizing(true);
    try {
      const plan = await createCalculatedNutritionPlan(trainee.id, coachId, {
        title,
        notes: notes || null,
        target_calories: totalCaloriesNum,
        target_protein: grams.protein_g,
        target_carbs: grams.carbs_g,
        target_fat: grams.fat_g,
        target_water_ml: waterMl ? parseInt(waterMl, 10) : null,
        meal_count: mealCount,
        macro_split: macroSplit,
        meals: mealSlots,
        calc_inputs: {
          age: age!,
          sex,
          height_cm: parseFloat(heightCm),
          weight_kg: weightKg,
          activity_level: activityLevel,
          formula: 'mifflin_st_jeor',
          calculated_tdee: suggestedTdee,
          override_applied: overrideApplied,
          diet,
        },
      });

      const locked = await updateNutritionPlan(plan.id, { locked: true });

      onPlanCreated(locked);
      onClose();
    } catch (e) {
      Alert.alert('Error', 'Could not finalize the plan. Please try again.');
      console.warn('finalize calorie plan error', e);
    } finally {
      setFinalizing(false);
    }
  }, [
    sex, activityLevel, bmr, suggestedTdee, weightKg, trainee, coachId, title, notes,
    totalCaloriesNum, grams, mealCount, macroSplit, mealSlots, age, heightCm, overrideApplied,
    diet, waterMl, onPlanCreated, onClose,
  ]);

  const stepIndex = STEPS.indexOf(step);
  const goBack = () => {
    if (stepIndex === 0) onClose();
    else setStep(STEPS[stepIndex - 1]);
  };

  return (
    <>
    {/* visible is gated on pickerIndex too — the meal picker below is a second
        Modal, and iOS won't reliably show/register touches on a Modal stacked
        over another already-visible one, so only one of the two is ever
        visible={true} at a time (same pattern as CoachPrograms.tsx's
        Manage Library / exercise-name-picker modals). */}
    <Modal visible={visible && pickerIndex === null} transparent animationType="slide" onRequestClose={goBack}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>Calorie & Macro Plan</Text>
              <Text style={styles.stepIndicator}>
                Step {stepIndex + 1} of {STEPS.length} — {STEP_LABELS[step]}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={goBack}>
              <Ionicons name={stepIndex === 0 ? 'close' : 'arrow-back'} size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {step === 'biometrics' && (
              <View>
                <View style={styles.fieldLabelRow}>
                  <Text style={styles.fieldLabel}>YEAR OF BIRTH</Text>
                  {lockedFields.birthYear && <Ionicons name="lock-closed" size={12} color={colors.textSecondary} />}
                </View>
                <TextInput
                  style={[styles.textInput, lockedFields.birthYear && styles.textInputLocked]}
                  value={birthYear}
                  onChangeText={v => setBirthYear(sanitizeYear(v))}
                  editable={!lockedFields.birthYear}
                  keyboardType="number-pad"
                  placeholder="e.g. 1982"
                  placeholderTextColor={colors.textSecondary}
                />
                {lockedFields.birthYear ? (
                  <Text style={styles.lockedFieldNote}>Set by the trainee — only they can change it, in their Profile.</Text>
                ) : (
                  birthYear.length === 4 && !isValidBirthYear(birthYear) && (
                    <Text style={styles.fieldError}>Enter a year between {MIN_BIRTH_YEAR} and {MAX_BIRTH_YEAR}.</Text>
                  )
                )}

                <View style={[styles.fieldLabelRow, { marginTop: 16 }]}>
                  <Text style={styles.fieldLabel}>SEX</Text>
                  {lockedFields.sex && <Ionicons name="lock-closed" size={12} color={colors.textSecondary} />}
                </View>
                <View style={styles.rowChips}>
                  {(['female', 'male'] as Sex[]).map(s => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.chip, sex === s && styles.chipActive, lockedFields.sex && styles.chipLocked]}
                      onPress={() => !lockedFields.sex && setSex(s)}
                      disabled={lockedFields.sex}
                    >
                      <Text style={[styles.chipText, sex === s && styles.chipTextActive]}>
                        {s === 'female' ? 'Female' : 'Male'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {lockedFields.sex && (
                  <Text style={styles.lockedFieldNote}>Set by the trainee — only they can change it, in their Profile.</Text>
                )}

                <View style={[styles.fieldLabelRow, { marginTop: 16 }]}>
                  <Text style={styles.fieldLabel}>HEIGHT (CM)</Text>
                  {lockedFields.height && <Ionicons name="lock-closed" size={12} color={colors.textSecondary} />}
                </View>
                <TextInput
                  style={[styles.textInput, lockedFields.height && styles.textInputLocked]}
                  value={heightCm}
                  onChangeText={v => setHeightCm(sanitizeHeight(v))}
                  editable={!lockedFields.height}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 168"
                  placeholderTextColor={colors.textSecondary}
                />
                {lockedFields.height ? (
                  <Text style={styles.lockedFieldNote}>Set by the trainee — only they can change it, in their Profile.</Text>
                ) : (
                  heightCm.length > 0 && !isValidHeight(heightCm) && (
                    <Text style={styles.fieldError}>Enter a height between {MIN_HEIGHT_CM}–{MAX_HEIGHT_CM} cm.</Text>
                  )
                )}

                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>ACTIVITY LEVEL</Text>
                {ACTIVITY_LEVELS.map(level => (
                  <TouchableOpacity
                    key={level}
                    style={[styles.activityRow, activityLevel === level && styles.activityRowActive]}
                    onPress={() => setActivityLevel(level)}
                  >
                    <Ionicons
                      name={activityLevel === level ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={activityLevel === level ? colors.xpBar : colors.textSecondary}
                    />
                    <Text style={styles.activityRowText}>{ACTIVITY_LABELS[level]}</Text>
                  </TouchableOpacity>
                ))}

                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>CURRENT WEIGHT</Text>
                {loadingWeight ? (
                  <ActivityIndicator size="small" color={colors.xpBar} />
                ) : weightKg ? (
                  <Text style={styles.weightReadout}>{weightKg} kg (from latest weight log)</Text>
                ) : (
                  <Text style={styles.weightMissing}>No weight logged yet — ask the trainee to log their weight first.</Text>
                )}

                <View style={styles.bottomRow}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryBtn, { flex: 1 }, (!biometricsComplete || savingBiometrics) && styles.disabledBtn]}
                    onPress={saveBiometricsAndNext}
                    disabled={!biometricsComplete || savingBiometrics}
                  >
                    {savingBiometrics ? (
                      <ActivityIndicator size="small" color={colors.text} />
                    ) : (
                      <Text style={styles.primaryBtnText}>Next: Calculate Calories</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {step === 'calories' && (
              <View>
                <View style={styles.calcSummaryBox}>
                  <Text style={styles.calcSummaryLabel}>BMR (Mifflin-St Jeor)</Text>
                  <Text style={styles.calcSummaryValue}>{bmr ?? '—'} kcal</Text>
                  <Text style={[styles.calcSummaryLabel, { marginTop: 12 }]}>Suggested (BMR × activity)</Text>
                  <Text style={styles.calcSummaryValue}>{suggestedTdee ?? '—'} kcal</Text>
                </View>

                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>TOTAL DAILY CALORIES</Text>
                <TextInput
                  style={styles.textInput}
                  value={totalCalories}
                  onChangeText={v => {
                    setOverrideApplied(true);
                    setTotalCalories(v.replace(/[^0-9]/g, ''));
                  }}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textSecondary}
                />
                {overrideApplied && suggestedTdee != null && (
                  <TouchableOpacity onPress={() => { setOverrideApplied(false); setTotalCalories(String(suggestedTdee)); }}>
                    <Text style={styles.resetLink}>Reset to suggested ({suggestedTdee} kcal)</Text>
                  </TouchableOpacity>
                )}

                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>DAILY WATER TARGET (ML, OPTIONAL)</Text>
                <TextInput
                  style={styles.textInput}
                  value={waterMl}
                  onChangeText={v => setWaterMl(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="e.g. 2500"
                  placeholderTextColor={colors.textSecondary}
                />

                <View style={styles.bottomRow}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryBtn, { flex: 1 }, totalCaloriesNum <= 0 && styles.disabledBtn]}
                    onPress={() => setStep('macros')}
                    disabled={totalCaloriesNum <= 0}
                  >
                    <Text style={styles.primaryBtnText}>Next: Macro Split</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {step === 'macros' && (
              <View>
                <View style={[styles.macroTotalBadge, macroValid ? styles.macroTotalOk : styles.macroTotalBad]}>
                  <Text style={styles.macroTotalText}>
                    Total: {macroTotal}%{!macroValid ? `  (${macroTotal < 100 ? `add ${100 - macroTotal}` : `remove ${macroTotal - 100}`}%)` : ''}
                  </Text>
                </View>

                <MacroField
                  label="PROTEIN %"
                  value={proteinPct}
                  onChangeText={v => setProteinPct(sanitizePct(v))}
                  onBalance={() => handleAutoBalance('protein')}
                  grams={grams.protein_g}
                />
                <MacroField
                  label="CARBS %"
                  value={carbsPct}
                  onChangeText={v => setCarbsPct(sanitizePct(v))}
                  onBalance={() => handleAutoBalance('carbs')}
                  grams={grams.carbs_g}
                />
                <MacroField
                  label="FAT %"
                  value={fatPct}
                  onChangeText={v => setFatPct(sanitizePct(v))}
                  onBalance={() => handleAutoBalance('fat')}
                  grams={grams.fat_g}
                />

                <View style={styles.bottomRow}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryBtn, { flex: 1 }, !macroValid && styles.disabledBtn]}
                    onPress={() => setStep('meals')}
                    disabled={!macroValid}
                  >
                    <Text style={styles.primaryBtnText}>Next: Meal Split</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {step === 'meals' && (
              <View>
                <Text style={styles.fieldLabel}>DIET PREFERENCE</Text>
                <View style={[styles.rowChips, { flexWrap: 'wrap' }]}>
                  {DIET_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.chip, diet === opt.value && styles.chipActive]}
                      onPress={() => { setDiet(opt.value); setMealSlots([]); }}
                    >
                      <Text style={[styles.chipText, diet === opt.value && styles.chipTextActive]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>MEALS PER DAY</Text>
                <View style={styles.rowChips}>
                  {[3, 4, 5].map(n => (
                    <TouchableOpacity
                      key={n}
                      style={[styles.chip, mealCount === n && styles.chipActive]}
                      onPress={() => { setMealCount(n as 3 | 4 | 5); setMealSlots([]); }}
                    >
                      <Text style={[styles.chipText, mealCount === n && styles.chipTextActive]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {mealSlots.length === 0 ? (
                  <View style={styles.bottomRow}>
                    <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={handleGenerateMeals}>
                      <Ionicons name="sparkles" size={16} color={colors.text} />
                      <Text style={styles.primaryBtnText}>  Generate Meals</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    {mealSlots.map((m, i) => (
                      <View key={m.slot} style={styles.mealCard}>
                        <View style={styles.mealCardHeader}>
                          <Text style={styles.mealCardLabel}>{m.label}</Text>
                          <TouchableOpacity onPress={() => setPickerIndex(i)} style={styles.regenBtn}>
                            <Ionicons name="list" size={14} color={colors.xpBar} />
                            <Text style={styles.regenBtnText}>Choose</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.mealCardName}>{m.name}</Text>
                        <Text style={styles.mealCardMacros}>
                          {m.actual_calories} kcal · P {m.actual_protein}g · C {m.actual_carbs}g · F {m.actual_fat}g
                        </Text>
                        {m.items.map((item, idx) => (
                          <Text key={idx} style={styles.mealItemText}>• {item.food} — {item.qty}</Text>
                        ))}
                      </View>
                    ))}
                    <View style={styles.bottomRow}>
                      <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={() => setStep('review')}>
                        <Text style={styles.primaryBtnText}>Next: Review & Finalize</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            )}

            {step === 'review' && (
              <View>
                <Text style={styles.fieldLabel}>PLAN TITLE</Text>
                <TextInput
                  style={styles.textInput}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g. Cutting Phase"
                  placeholderTextColor={colors.textSecondary}
                />

                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>NOTES (OPTIONAL)</Text>
                <TextInput
                  style={[styles.textInput, { minHeight: 70, textAlignVertical: 'top' }]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="e.g. Prioritize protein at every meal..."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                />

                <View style={styles.calcSummaryBox}>
                  <Text style={styles.calcSummaryValue}>{totalCaloriesNum} kcal/day</Text>
                  <Text style={styles.calcSummaryLabel}>
                    P {grams.protein_g}g · C {grams.carbs_g}g · F {grams.fat_g}g · {mealCount} meals/day
                  </Text>
                  {waterMl && (
                    <Text style={[styles.calcSummaryLabel, { marginTop: 4 }]}>Water: {waterMl}ml/day</Text>
                  )}
                </View>

                <Text style={styles.lockNotice}>
                  Finalizing locks this plan — the trainee will be able to view it in the app but not edit it. You can unlock it later to make changes.
                </Text>

                <View style={styles.bottomRow}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={finalizing}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryBtn, { flex: 1 }, (!title.trim() || finalizing) && styles.disabledBtn]}
                    onPress={handleFinalize}
                    disabled={!title.trim() || finalizing}
                  >
                    {finalizing ? (
                      <ActivityIndicator size="small" color={colors.text} />
                    ) : (
                      <>
                        <Ionicons name="lock-closed" size={16} color={colors.text} />
                        <Text style={styles.primaryBtnText}>  Finalize Plan</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    {/* Meal picker — every template eligible for this slot's meal type and
        the trainee's diet (diet nesting handled by templatesForMealType),
        so a coach can hand-pick a specific meal instead of only shuffling
        through the auto-generator's closest-macro-match suggestions. */}
    <Modal visible={pickerIndex !== null} transparent animationType="slide" onRequestClose={() => setPickerIndex(null)}>
      <View style={styles.pickerOverlay}>
        <View style={styles.pickerSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              Choose {pickerIndex != null ? mealTypesForCount[pickerIndex] : ''}
            </Text>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setPickerIndex(null)}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {pickerOptions.map(t => (
              <TouchableOpacity key={t.id} style={styles.pickerRow} onPress={() => handleSelectFromPicker(t)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickerRowName}>{t.name}</Text>
                  <Text style={styles.pickerRowMacros}>
                    {t.baseCalories} kcal · P {t.baseProtein}g · C {t.baseCarbs}g · F {t.baseFat}g
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
    </>
  );
}

function MacroField({ label, value, onChangeText, onBalance, grams }: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  onBalance: () => void;
  grams: number;
}) {
  return (
    <View style={styles.macroFieldRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.exMetaLabel}>{label}</Text>
        <TextInput
          style={styles.exMetaInput}
          value={value}
          onChangeText={onChangeText}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={colors.textSecondary}
        />
      </View>
      <Text style={styles.macroGramsText}>{grams}g</Text>
      <TouchableOpacity onPress={onBalance} style={styles.balanceBtn}>
        <Ionicons name="git-compare-outline" size={16} color={colors.xpBar} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 28,
    borderTopRightRadius: 28, padding: 24, maxHeight: '92%', minHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  stepIndicator: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center',
  },
  bottomRow: { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelBtn: {
    paddingHorizontal: 18, paddingVertical: 14, borderRadius: 12,
    backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1, marginBottom: 8 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  textInput: {
    backgroundColor: colors.secondary, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border,
  },
  textInputLocked: { opacity: 0.5 },
  lockedFieldNote: { color: colors.textSecondary, fontSize: 12, marginTop: 6, fontStyle: 'italic' },
  rowChips: { flexDirection: 'row', gap: 10 },
  chip: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10,
    backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.xpBar + '22', borderColor: colors.xpBar },
  chipLocked: { opacity: 0.5 },
  chipText: { color: colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: colors.xpBar },
  activityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, marginBottom: 6,
    backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border,
  },
  activityRowActive: { borderColor: colors.xpBar },
  activityRowText: { color: colors.text, fontSize: 13, flexShrink: 1 },
  weightReadout: { color: colors.text, fontSize: 15, fontWeight: '600' },
  weightMissing: { color: colors.warning, fontSize: 13 },
  fieldError: { color: colors.warning, fontSize: 12, marginTop: 6 },
  primaryBtn: {
    flexDirection: 'row', backgroundColor: colors.primary, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  disabledBtn: { opacity: 0.5 },
  calcSummaryBox: {
    backgroundColor: colors.secondary, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  calcSummaryLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  calcSummaryValue: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 2 },
  resetLink: { color: colors.xpBar, fontSize: 13, marginTop: 8, fontWeight: '600' },
  macroTotalBadge: { borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginBottom: 16 },
  macroTotalOk: { backgroundColor: colors.success + '22', borderWidth: 1, borderColor: colors.success },
  macroTotalBad: { backgroundColor: colors.primary + '22', borderWidth: 1, borderColor: colors.primary },
  macroTotalText: { color: colors.text, fontWeight: '700' },
  macroFieldRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 12 },
  exMetaLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 },
  exMetaInput: {
    backgroundColor: colors.secondary, borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 10, color: colors.text, fontSize: 14, borderWidth: 1, borderColor: colors.border,
  },
  macroGramsText: { color: colors.textSecondary, fontSize: 13, width: 44, textAlign: 'right' },
  balanceBtn: {
    width: 36, height: 36, borderRadius: 8, backgroundColor: colors.secondary,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border,
  },
  mealCard: {
    backgroundColor: colors.secondary, borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: colors.border,
  },
  mealCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mealCardLabel: { color: colors.xpBar, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  regenBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  regenBtnText: { color: colors.xpBar, fontSize: 12, fontWeight: '600' },
  mealCardName: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 6 },
  mealCardMacros: { color: colors.textSecondary, fontSize: 12, marginTop: 2, marginBottom: 8 },
  mealItemText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  lockNotice: { color: colors.textSecondary, fontSize: 12, marginTop: 16, lineHeight: 18 },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, maxHeight: '80%',
  },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  pickerRowName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  pickerRowMacros: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
});
