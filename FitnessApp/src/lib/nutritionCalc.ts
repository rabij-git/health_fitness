import type { MacroSplit, DBNutritionPlan, DBMealCompletion } from './supabase';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Sex = 'male' | 'female';

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary (little or no exercise)',
  light: 'Light (1-3 days/week)',
  moderate: 'Moderate (3-5 days/week)',
  active: 'Active (6-7 days/week)',
  very_active: 'Very Active (physical job or 2x/day)',
};

export function ageFromBirthYear(birthYear: number): number {
  return new Date().getFullYear() - birthYear;
}

// Mifflin-St Jeor equation.
export function calculateBMR(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(sex === 'male' ? base + 5 : base - 161);
}

export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel]);
}

export function macroSplitTotal(split: MacroSplit): number {
  return split.protein_pct + split.carbs_pct + split.fat_pct;
}

export function isMacroSplitValid(split: MacroSplit): boolean {
  return macroSplitTotal(split) === 100;
}

export interface MacroGrams {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

// Protein/carbs = 4 kcal/g, fat = 9 kcal/g. Protein/carbs grams round
// independently; fat is derived from what's left of totalCalories rather
// than rounded from its own percentage, so it absorbs most of the rounding
// drift — final total typically lands within a few kcal of totalCalories,
// not necessarily exact (fat's own rounding to a whole gram still applies).
export function macroGramsFromSplit(totalCalories: number, split: MacroSplit): MacroGrams {
  const protein_g = Math.round((totalCalories * split.protein_pct) / 100 / 4);
  const carbs_g = Math.round((totalCalories * split.carbs_pct) / 100 / 4);
  const proteinCarbsCalories = protein_g * 4 + carbs_g * 4;
  const fat_g = Math.max(0, Math.round((totalCalories - proteinCarbsCalories) / 9));
  return { protein_g, carbs_g, fat_g };
}

// Splits an integer total across `count` slots as evenly as possible —
// the first `total % count` slots get one extra unit so no two slots ever
// diverge by more than 1, and the slots always sum back to `total` exactly.
export function splitInteger(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

export interface MealTarget {
  slot: number;
  target_calories: number;
  target_protein: number;
  target_carbs: number;
  target_fat: number;
}

export function splitIntoMealTargets(
  totalCalories: number,
  grams: MacroGrams,
  mealCount: 3 | 4 | 5
): MealTarget[] {
  const calorieSlots = splitInteger(totalCalories, mealCount);
  const proteinSlots = splitInteger(grams.protein_g, mealCount);
  const carbSlots = splitInteger(grams.carbs_g, mealCount);
  const fatSlots = splitInteger(grams.fat_g, mealCount);
  return Array.from({ length: mealCount }, (_, i) => ({
    slot: i + 1,
    target_calories: calorieSlots[i],
    target_protein: proteinSlots[i],
    target_carbs: carbSlots[i],
    target_fat: fatSlots[i],
  }));
}

export const MEAL_SLOT_LABELS: Record<3 | 4 | 5, string[]> = {
  3: ['Breakfast', 'Lunch', 'Dinner'],
  4: ['Breakfast', 'Lunch', 'Snack', 'Dinner'],
  5: ['Breakfast', 'Snack', 'Lunch', 'Snack', 'Dinner'],
};

export interface TodayNutritionTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

// Nutrition logged from generated-meal tracking: only 'as_planned' counts,
// since that's the one status with known calorie/macro values (the meal's
// own actual_* fields) — 'substituted' has no figures attached to its
// free-text note, and 'skipped' means nothing was eaten. Only active plans
// count, mirroring the trackable gate meal tracking itself uses (inactive/
// past plans are display-only history, never loggable). Shared between
// FoodLogScreen (per-plan completions, for its own UI) and TrainerDashboard
// (just the totals) so the "today's nutrition" figures agree everywhere.
// Manual food_log_entries only ever contribute to calories — they carry no
// macro breakdown — so protein/carbs/fat here reflect planned-meal tracking only.
export function sumTodayAsPlannedNutrition(
  plans: Pick<DBNutritionPlan, 'id' | 'active' | 'meals'>[],
  completionsByPlan: Record<string, DBMealCompletion[]>,
  today: string
): TodayNutritionTotals {
  const totals: TodayNutritionTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const plan of plans) {
    if (!plan.active || !plan.meals) continue;
    const completions = completionsByPlan[plan.id];
    if (!completions) continue;
    for (const c of completions) {
      if (c.log_date !== today || c.status !== 'as_planned') continue;
      const meal = plan.meals.find(m => m.slot === c.meal_slot);
      if (!meal) continue;
      totals.calories += meal.actual_calories;
      totals.protein += meal.actual_protein;
      totals.carbs += meal.actual_carbs;
      totals.fat += meal.actual_fat;
    }
  }
  return totals;
}

export function sumTodayAsPlannedCalories(
  plans: Pick<DBNutritionPlan, 'id' | 'active' | 'meals'>[],
  completionsByPlan: Record<string, DBMealCompletion[]>,
  today: string
): number {
  return sumTodayAsPlannedNutrition(plans, completionsByPlan, today).calories;
}
