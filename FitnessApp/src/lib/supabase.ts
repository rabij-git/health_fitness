import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bdyfqhykhpsgkgrklkdg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_8AcNwNrXlQxI9M_c5AyYJQ_J_kwInQh';

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
  active: boolean;
  file_name: string | null;
  file_url: string | null;
  storage_path: string | null;
  created_at: string;
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
