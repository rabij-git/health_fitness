import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://bdyfqhykhpsgkgrklkdg.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_8AcNwNrXlQxI9M_c5AyYJQ_J_kwInQh';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// ── Types matching our DB schema ──────────────────────────────────────────────

export interface DBUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'coach' | 'trainee';
  avatar: string;
  coach_id?: string;
  gym_id?: string;
  level: number;
  xp: number;
  streak: number;
  status: 'pending' | 'assigned';
  created_at: string;
  // Biometric profile, used for calorie/macro calculations. Year of birth
  // only (not full date of birth) is stored deliberately, for privacy.
  birth_year: number | null;
  sex: 'male' | 'female' | null;
  height_cm: number | null;
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active' | null;
}

export interface DBGym {
  id: string;
  name: string;
  coach_id: string;
  created_at: string;
}

export interface DBFriendship {
  id: string;
  user_id: string;
  friend_id: string;
  status: 'pending' | 'accepted';
  created_at: string;
}

export interface DBProgram {
  id: string;
  name: string;
  description: string;
  duration: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  coach_id: string;
  created_at: string;
}

export interface DBWorkout {
  id: string;
  trainee_id: string;
  program_id: string;
  name: string;
  description: string;
  duration: string;
  difficulty: string;
  active: boolean;
  end_date: string | null;
  // Weekday numbers (0=Sunday..6=Saturday, matching JS Date.getDay()) this
  // workout can be done on. Null/empty = no restriction, any day.
  scheduled_days: number[] | null;
  created_at: string;
}

export interface DBExercise {
  id: string;
  workout_id: string;
  name: string;
  sets: number;
  reps: string;
  weight?: string;
  time: string; // duration like "30s" or "5m"; plain number or "0" = not timed
  rest_seconds?: number | null; // rest period between sets; null/0 = no rest timer
  sort_order: number;
}

export interface DBProgramExercise {
  exercise_id: string;
  program_id: string;
  name: string;
  sets: number;
  reps: string;
  weight?: string;
  time: string; // duration like "30s" or "5m"; plain number or "0" = not timed
  rest_seconds?: number | null; // rest period between sets; null/0 = no rest timer
  sort_order: number;
}

export interface DBWeightLog {
  id: string;
  trainee_id: string;
  weight_kg: number;
  logged_at: string;
}

export interface DBExerciseWeightLog {
  id: string;
  trainee_id: string;
  exercise_name: string;
  weight: string;
  reps: string;
  sets: number;
  logged_at: string;
}

// A trainee's actual logged set — reps/weight as entered (may differ from
// the coach-assigned target) plus effort (0-4, "reps in reserve" scale;
// null = this set wasn't attempted/logged).
export interface SessionSetDetail {
  reps: string;
  weight: string;
  effort: number | null;
}

export interface SessionExerciseDetail {
  name: string;
  sets: SessionSetDetail[];
}

export interface DBWorkoutSession {
  id: string;
  trainee_id: string;
  workout_id: string;
  completion_pct: number;
  xp_awarded: number;
  completed_at: string;
  // Full per-exercise, per-set breakdown of what was actually done —
  // null for sessions saved before this field existed.
  details: SessionExerciseDetail[] | null;
}

export interface DBMessage {
  id: string;
  from_id: string;
  to_id: string;
  message: string;
  read: boolean;
  created_at: string;
}

export interface MacroSplit {
  protein_pct: number;
  carbs_pct: number;
  fat_pct: number;
}

export interface MealItem {
  food: string;
  qty: string;
}

export interface MealSlot {
  slot: number;
  label: string;
  target_calories: number;
  target_protein: number;
  target_carbs: number;
  target_fat: number;
  name: string;
  items: MealItem[];
  actual_calories: number;
  actual_protein: number;
  actual_carbs: number;
  actual_fat: number;
}

// Snapshot of the biometric inputs + formula used to derive a plan's
// targets, kept for audit/reproducibility (a trainee's profile can change
// after the plan was calculated).
export interface CalcInputs {
  age: number;
  sex: 'male' | 'female';
  height_cm: number;
  weight_kg: number;
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  formula: 'mifflin_st_jeor';
  calculated_tdee: number;
  override_applied: boolean;
  diet: 'vegan' | 'vegetarian' | 'pescatarian' | 'omnivore';
}

// A trainee can have several nutrition plans (a coach retires one by setting
// it inactive rather than deleting it, same pattern as workouts.active).
// Each plan can carry structured targets, an uploaded PDF, or both.
export interface DBNutritionPlan {
  id: string;
  trainee_id: string;
  coach_id: string;
  template_id: string | null;
  title: string;
  notes: string | null;
  target_calories: number | null;
  target_protein: number | null;
  target_carbs: number | null;
  target_fat: number | null;
  // How much water/day the coach wants the trainee to drink — a goal set on
  // the plan, distinct from vitals.water (what the trainee actually logged).
  target_water_ml: number | null;
  active: boolean;
  // Only one plan is ever active per trainee — deactivating one (whether by
  // toggle or by another plan taking over) stamps today's date here so it
  // reads as real history; reactivating clears it. Mirrors workouts.end_date.
  end_date: string | null;
  file_name: string | null;
  file_url: string | null;
  storage_path: string | null;
  created_at: string;
  // Calculated-plan fields — null for plans built the old way (upload-only
  // or manual targets with no meal breakdown).
  meal_count: 3 | 4 | 5 | null;
  macro_split: MacroSplit | null;
  meals: MealSlot[] | null;
  calc_inputs: CalcInputs | null;
  // A plan is read-only for the trainee once locked; the coach must
  // explicitly unlock it to edit further.
  locked: boolean;
}

// Reusable, coach-owned nutrition plan template — mirrors DBProgram's
// relationship to DBWorkout. Assigning one to a trainee copies its current
// values into a new DBNutritionPlan row (template_id kept for provenance).
export interface DBNutritionPlanTemplate {
  id: string;
  coach_id: string;
  title: string;
  notes: string | null;
  target_calories: number | null;
  target_protein: number | null;
  target_carbs: number | null;
  target_fat: number | null;
  target_water_ml: number | null;
  created_at: string;
  meal_count: 3 | 4 | 5 | null;
  macro_split: MacroSplit | null;
  meals: MealSlot[] | null;
}

// One row per (trainee, plan, meal slot, day) — whether the trainee ate the
// plan's prescribed meal, swapped it for something else, or skipped it.
export interface DBMealCompletion {
  id: string;
  trainee_id: string;
  nutrition_plan_id: string;
  meal_slot: number;
  log_date: string; // YYYY-MM-DD
  status: 'as_planned' | 'substituted' | 'skipped';
  substitute_note: string | null;
  created_at: string;
}

export interface DBFoodLogEntry {
  id: string;
  trainee_id: string;
  food_name: string;
  calories: number | null;
  logged_at: string;
  created_at: string;
}

export interface DBLibraryExercise {
  id: string;
  name: string;
  category: string;
  default_sets: number;
  default_reps: string;
  default_weight?: string;
  default_time: string; // duration like "30s" or "5m"; plain number or "0" = not timed
  created_by?: string;
  created_at: string;
}

export interface DBUserMedal {
  id: string;
  user_id: string;
  medal_id: string;
  earned_at: string;
}

export interface DBCoachRequest {
  id: string;
  coach_id: string;
  trainee_id: string;
  initiated_by: 'coach' | 'trainee';
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
}

// Generic metric row — one per (trainee, metric_name, day). Covers weight,
// steps, water intake, heart rate, and any future metric without a schema
// change. metric_name examples: 'weight', 'steps', 'water', 'heart_rate'.
export interface DBVital {
  id: string;
  trainee_id: string;
  metric_name: string;
  metric_value: number;
  metric_uom: string | null;
  created_date: string; // YYYY-MM-DD
  created_at: string;
}

// Admin-generated code required to sign up as a coach — prevents a trainee
// from accidentally (or deliberately) self-assigning the coach role.
export interface DBCoachInvite {
  id: string;
  code: string;
  created_by: string;
  used_by: string | null;
  used_at: string | null;
  created_at: string;
}
