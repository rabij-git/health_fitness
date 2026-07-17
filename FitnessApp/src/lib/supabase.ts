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
  created_at: string;
}

export interface DBExercise {
  id: string;
  workout_id: string;
  name: string;
  sets: number;
  reps: string;
  weight?: string;
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

export interface DBWorkoutSession {
  id: string;
  trainee_id: string;
  workout_id: string;
  completion_pct: number;
  xp_awarded: number;
  completed_at: string;
}

export interface DBMessage {
  id: string;
  from_id: string;
  to_id: string;
  message: string;
  read: boolean;
  created_at: string;
}
