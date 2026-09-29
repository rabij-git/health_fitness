import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY, DBUser, DBProgram, DBWorkout, DBExercise, DBWeightLog, DBExerciseWeightLog, DBMessage, DBWorkoutSession, DBGym, DBFriendship, DBNutritionPlan, DBNutritionPlanTemplate, DBCoachRequest, DBCoachInvite, DBTraineeInvite, DBVital, DBProgramExercise, DBLibraryExercise, DBUserMedal, DBFoodLogEntry, DBMealCompletion, SessionExerciseDetail } from './supabase';
// Reading a just-created expo-print file into JS (as a Blob via fetch(), as
// an ArrayBuffer via the new File class, or as base64 via the legacy
// readAsStringAsync) has all three failed with permission/readability
// errors on some Android + Expo Go combos. uploadAsync uploads straight
// from disk to the URL natively — it never pulls the bytes into JS at all,
// which sidesteps that whole class of failure.
import * as LegacyFileSystem from 'expo-file-system/legacy';

// `uploadAsync` builds its own bare HTTP request (see the comment above the
// import), so it doesn't go through the supabase-js client and doesn't pick
// up the caller's session automatically the way every other call in this
// file does — it has to be fetched and attached explicitly. Using the anon
// key here (the original bug) sends the request as an unauthenticated
// request for storage.objects RLS purposes, regardless of who's actually
// signed in: it wouldn't identify the uploader as themselves, and it would
// outright fail against any bucket policy that isn't wide open to anon.
async function uploadFileToStorage(localFileUri: string, bucket: string, storagePath: string, contentType: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${bucket}/${storagePath}`;
  const result = await LegacyFileSystem.uploadAsync(uploadUrl, localFileUri, {
    httpMethod: 'POST',
    uploadType: LegacyFileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': contentType,
    },
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Storage upload failed (${result.status}): ${result.body}`);
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

// `role` is never accepted from the caller — the users table's own INSERT
// policy forces role='trainee' server-side regardless of what's sent here,
// since a client-supplied role was the app's original privilege-escalation
// hole (any account could self-elevate to admin/coach). Coach accounts can
// only be created via signUpCoach below.
export async function signUp(email: string, password: string, name: string) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, role: 'trainee', avatar: initials },
    },
  });
  if (error) throw error;

  if (data.user) {
    const { error: profileError } = await supabase.from('users').insert({
      id: data.user.id,
      name,
      email,
      role: 'trainee',
      avatar: initials,
      level: 1,
      xp: 0,
      streak: 0,
      status: 'pending',
    });
    if (profileError) throw profileError;
  }
  return data;
}

// Coach signup requires a valid, unused invite code from an admin. Validation
// and redemption happen atomically server-side (redeem_coach_invite, a
// SECURITY DEFINER RPC) rather than via a client-side read+update of
// coach_invites, which any signed-in user could otherwise race or forge.
// This necessarily runs auth.signUp() *before* validating the code (the RPC
// needs an authenticated caller to record who redeemed it) — an invalid code
// still leaves behind an auth user with no profile row, same as any other
// mid-signUp failure already can.
export async function signUpCoach(email: string, password: string, name: string, inviteCode: string) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, role: 'coach', avatar: initials },
    },
  });
  if (error) throw error;

  const { error: redeemError } = await supabase.rpc('redeem_coach_invite', {
    p_code: inviteCode.trim().toUpperCase(),
    p_name: name,
    p_email: email,
    p_avatar: initials,
  });
  if (redeemError) throw redeemError;

  return data;
}

// Trainee signup with a coach's invite code — mirrors signUpCoach exactly,
// one level down. Plain trainee signup (signUp(), no code) stays open/
// ungated as before; this is only used when the trainee has a code, and
// auto-connects them to that coach (coach_id set inside the RPC) instead of
// leaving them to search/request/wait for acceptance.
export async function signUpTraineeWithInvite(email: string, password: string, name: string, inviteCode: string) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, role: 'trainee', avatar: initials },
    },
  });
  if (error) throw error;

  const { error: redeemError } = await supabase.rpc('redeem_trainee_invite', {
    p_code: inviteCode.trim().toUpperCase(),
    p_name: name,
    p_email: email,
    p_avatar: initials,
  });
  if (redeemError) throw redeemError;

  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Permanently deletes the signed-in user's own account and data (trainee or
// coach) via the delete_own_account() SECURITY DEFINER RPC (see
// scripts/self_delete_account.sql for exactly what's removed/detached) —
// required by both app stores for any app with in-app account creation.
// Always attempts a local sign-out afterward regardless of whether it
// succeeds (the server-side session for a just-deleted user may already be
// invalid), so the caller reliably ends up logged out either way.
export async function deleteOwnAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_own_account');
  try {
    await supabase.auth.signOut();
  } catch {
    // Ignore — the account (and thus its session) is already gone either
    // way if the RPC above succeeded.
  }
  if (error) throw error;
}

// ── User profile ──────────────────────────────────────────────────────────────

export async function getProfile(userId: string): Promise<DBUser | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data;
}

export async function updateProfile(userId: string, updates: Partial<DBUser>) {
  const { error } = await supabase.from('users').update(updates).eq('id', userId);
  if (error) throw error;
}

// ── Trainees (coach perspective) ──────────────────────────────────────────────

export async function getMyTrainees(coachId: string): Promise<DBUser[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('coach_id', coachId)
    .eq('role', 'trainee')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getPendingTrainees(): Promise<DBUser[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('role', 'trainee')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ── Programs ──────────────────────────────────────────────────────────────────

export interface ExercisePayloadEntry {
  id?: string; // present only when this entry already exists in the DB — drives update-in-place
  name: string;
  sets: number;
  reps: string;
  weight?: string;
  time?: string; // duration like "30s"/"5m" — program_exercises only; omitted entirely for workout exercises
  rest_seconds?: number | null; // rest period between sets, in seconds; null/0 = no rest timer
}

// Diffs an edited exercise list against what's currently in the DB for a given
// parent (workout or program), matching by row id. Existing rows are UPDATEd in
// place (so renaming an exercise never deletes/recreates it — sets/reps/weight
// and the row's identity survive), rows no longer present are deleted, and
// entries without an id are inserted as new rows. sort_order always reflects
// the final array order (so drag/reorder is preserved too).
async function syncExerciseRows(
  table: 'exercises' | 'program_exercises',
  pkColumn: 'id' | 'exercise_id',
  parentColumn: 'workout_id' | 'program_id',
  parentId: string,
  entries: ExercisePayloadEntry[]
) {
  const ordered = entries.map((e, i) => ({ ...e, sort_order: i }));

  const { data: existing, error: selectError } = await supabase.from(table).select(pkColumn).eq(parentColumn, parentId);
  if (selectError) throw selectError;
  const existingIds = new Set((existing ?? []).map((row: any) => row[pkColumn] as string));

  const toUpdate = ordered.filter(e => e.id && existingIds.has(e.id));
  const keepIds = new Set(toUpdate.map(e => e.id));
  const toDelete = [...existingIds].filter(id => !keepIds.has(id));
  const toInsert = ordered.filter(e => !e.id || !existingIds.has(e.id));

  if (toDelete.length > 0) {
    await supabase.from(table).delete().in(pkColumn, toDelete);
  }
  await Promise.all(toUpdate.map(({ id, ...updates }) =>
    supabase.from(table).update(updates).eq(pkColumn, id!)
  ));
  if (toInsert.length > 0) {
    await supabase.from(table).insert(
      toInsert.map(({ id, ...rest }) => ({ ...rest, [parentColumn]: parentId }))
    );
  }
}

export async function getPrograms(coachId: string): Promise<DBProgram[]> {
  const { data, error } = await supabase
    .from('programs')
    .select('*')
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createProgram(
  program: Omit<DBProgram, 'id' | 'created_at'>,
  exercises: ExercisePayloadEntry[] = []
): Promise<DBProgram> {
  const { data, error } = await supabase
    .from('programs')
    .insert(program)
    .select()
    .single();
  if (error) throw error;

  if (exercises.length > 0) {
    const { error: exError } = await supabase.from('program_exercises').insert(
      exercises.map(({ id, ...ex }, i) => ({ ...ex, program_id: data.id, sort_order: i }))
    );
    if (exError) throw exError;
  }
  return data;
}

export async function updateProgram(programId: string, updates: Partial<Omit<DBProgram, 'id' | 'coach_id' | 'created_at'>>) {
  const { error } = await supabase.from('programs').update(updates).eq('id', programId);
  if (error) throw error;
}

export async function getProgramExercises(programId: string): Promise<DBProgramExercise[]> {
  const { data, error } = await supabase
    .from('program_exercises')
    .select('*')
    .eq('program_id', programId)
    .order('sort_order');
  if (error) return [];
  return data ?? [];
}

export async function updateProgramExercises(programId: string, exercises: ExercisePayloadEntry[]) {
  await syncExerciseRows('program_exercises', 'exercise_id', 'program_id', programId, exercises);
}

// Deletes a program template. Refuses (with a clear error) if any trainee has
// ever been assigned a workout from it — deleting would silently orphan their
// workout's program reference, and their workout history would lose its link
// back to the template it came from.
export async function deleteProgram(programId: string) {
  const { count, error: countError } = await supabase
    .from('workouts')
    .select('id', { count: 'exact', head: true })
    .eq('program_id', programId);
  if (countError) throw countError;
  if ((count ?? 0) > 0) {
    throw new Error('This program has already been assigned to one or more trainees and can\'t be deleted.');
  }

  const { error: exError } = await supabase.from('program_exercises').delete().eq('program_id', programId);
  if (exError) throw exError;

  const { error } = await supabase.from('programs').delete().eq('id', programId);
  if (error) throw error;
}

// ── Exercise library (shared across all coaches) ──────────────────────────────

export async function getExerciseLibrary(): Promise<DBLibraryExercise[]> {
  const { data, error } = await supabase
    .from('exercise_library')
    .select('*')
    .order('category')
    .order('name');
  if (error) return [];
  return data ?? [];
}

export async function createLibraryExercise(
  exercise: Omit<DBLibraryExercise, 'id' | 'created_at'>
): Promise<DBLibraryExercise> {
  const { data, error } = await supabase
    .from('exercise_library')
    .insert(exercise)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateLibraryExercise(id: string, updates: Partial<Omit<DBLibraryExercise, 'id' | 'created_at'>>) {
  const { error } = await supabase.from('exercise_library').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteLibraryExercise(id: string) {
  const { error } = await supabase.from('exercise_library').delete().eq('id', id);
  if (error) throw error;
}

// ── Workouts ──────────────────────────────────────────────────────────────────

export async function createWorkout(
  workout: Omit<DBWorkout, 'id' | 'created_at' | 'active' | 'end_date' | 'scheduled_days' | 'duration_weeks'> & { scheduled_days?: number[] | null; duration_weeks?: number | null },
  exercises: ExercisePayloadEntry[]
): Promise<DBWorkout> {
  const { data: wData, error: wError } = await supabase
    .from('workouts')
    .insert({ scheduled_days: null, duration_weeks: null, ...workout, active: true, end_date: null })
    .select()
    .single();
  if (wError) throw wError;

  if (exercises.length > 0) {
    const { error: exError } = await supabase.from('exercises').insert(
      exercises.map(({ id, ...ex }, i) => ({ ...ex, workout_id: wData.id, sort_order: i }))
    );
    if (exError) throw exError;
  }
  return wData;
}

export async function updateWorkoutDurationWeeks(workoutId: string, weeks: number | null) {
  const { error } = await supabase.from('workouts').update({ duration_weeks: weeks }).eq('id', workoutId);
  if (error) throw error;
}

export async function updateWorkoutScheduledDays(workoutId: string, days: number[]) {
  const { error } = await supabase
    .from('workouts')
    .update({ scheduled_days: days.length > 0 ? days : null })
    .eq('id', workoutId);
  if (error) throw error;
}

// All workouts ever assigned to a trainee (active + inactive), newest first —
// a trainee can have several at once; a coach retires one by setting it
// inactive (setWorkoutActive) rather than deleting it, so it stays visible
// as history.
export async function getWorkoutsForTrainee(traineeId: string): Promise<DBWorkout[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select('*')
    .eq('trainee_id', traineeId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data ?? [];
}

// Deactivating stamps today as the end date (so a coach can see how long the
// workout actually ran); reactivating clears it since it's back in use.
export async function setWorkoutActive(workoutId: string, active: boolean) {
  const end_date = active ? null : new Date().toISOString().split('T')[0];
  const { error } = await supabase.from('workouts').update({ active, end_date }).eq('id', workoutId);
  if (error) throw error;
}

// Refuses if any session was ever logged against this workout, since that
// would silently orphan the trainee's completion history for it.
export async function deleteWorkout(workoutId: string) {
  const { count, error: countError } = await supabase
    .from('workout_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('workout_id', workoutId);
  if (countError) throw countError;
  if ((count ?? 0) > 0) {
    throw new Error('This workout has completed sessions logged against it and can\'t be deleted.');
  }

  const { error: exError } = await supabase.from('exercises').delete().eq('workout_id', workoutId);
  if (exError) throw exError;

  const { error } = await supabase.from('workouts').delete().eq('id', workoutId);
  if (error) throw error;
}

// Ids of every workout the trainee has ever completed at least one session
// for — used to lock a workout from being started a second time.
// A workout locks for the rest of today once completed, but resets and can
// be done again tomorrow — so "already done" is scoped to today only, using
// the device's local midnight as the boundary.
export async function getWorkoutIdsCompletedToday(traineeId: string): Promise<Set<string>> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('workout_id')
    .eq('trainee_id', traineeId)
    .gte('completed_at', startOfToday.toISOString());
  if (error) return new Set();
  return new Set((data ?? []).map(r => r.workout_id));
}

export async function getWorkoutWithExercises(workoutId: string) {
  const { data: workout, error: wError } = await supabase
    .from('workouts')
    .select('*')
    .eq('id', workoutId)
    .single();
  if (wError) return null;

  const { data: exercises, error: exError } = await supabase
    .from('exercises')
    .select('*')
    .eq('workout_id', workout.id)
    .order('sort_order');
  if (exError) return null;

  return { workout, exercises: exercises ?? [] };
}

export async function updateWorkoutExercises(workoutId: string, exercises: ExercisePayloadEntry[]) {
  await syncExerciseRows('exercises', 'id', 'workout_id', workoutId, exercises);
}

// ── Workout sessions ──────────────────────────────────────────────────────────

// Called once when a trainee opens a workout to start logging — records a
// real server-side timestamp (scripts/secure_gamification.sql's
// workout_session_starts) that completeWorkoutSession uses to compute the
// duration bonus itself, rather than trusting a client-reported elapsed
// time. Fire-and-forget from the caller's point of view (WorkoutScreen.tsx
// swallows failures) — worst case if this doesn't land is just no duration
// bonus for that session, not a broken workout.
export async function startWorkoutSession(workoutId: string): Promise<void> {
  const { error } = await supabase.rpc('start_workout_session', { p_workout_id: workoutId });
  if (error) throw error;
}

// Replaces the old saveWorkoutSession + recalculateStreak + evaluateAndAwardMedals
// + updateProfile({xp,level}) sequence with one atomic, server-side RPC — see
// scripts/secure_gamification.sql's own header for why: those were previously
// computed client-side and written via a plain, unrestricted update, so any
// authenticated user could set their own xp/level/streak to anything, or
// self-award any medal, by calling the API directly. The server now
// recomputes everything itself from real workout_sessions/vitals/etc. data,
// including the duration bonus (derived from startWorkoutSession's
// server-recorded timestamp, not a client-reported duration).
// `completedHourLocal` is the one remaining genuinely-client-only fact
// (device timezone) — see that script's own comment for why that one stays.
export async function completeWorkoutSession(
  workoutId: string,
  details: SessionExerciseDetail[],
  completionPct: number,
  completedHourLocal: number
): Promise<{ xpAwarded: number; newXp: number; newLevel: number; newStreak: number; newlyEarnedMedalIds: string[] }> {
  const { data, error } = await supabase.rpc('complete_workout_session', {
    p_workout_id: workoutId,
    p_details: details,
    p_completion_pct: completionPct,
    p_completed_hour_local: completedHourLocal,
  });
  if (error) throw error;
  return {
    xpAwarded: data.xp_awarded,
    newXp: data.new_xp,
    newLevel: data.new_level,
    newStreak: data.new_streak,
    newlyEarnedMedalIds: data.newly_earned_medal_ids ?? [],
  };
}

export async function getTraineeHistory(traineeId: string, limit: number = 20): Promise<(DBWorkoutSession & { workout_name: string })[]> {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('*, workouts(name)')
    .eq('trainee_id', traineeId)
    .order('completed_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map((s: any) => ({ ...s, workout_name: s.workouts?.name ?? '' }));
}

// Most recent completed session for one specific workout — lets the coach's
// Edit Workout screen show "what did they actually do last time" (reps,
// weight, effort per set) inline, without leaving Program to go check
// History and hunt for the matching session. workout_id alone is enough to
// scope this (a workout belongs to exactly one trainee), no trainee_id
// needed.
export async function getLatestSessionForWorkout(workoutId: string): Promise<DBWorkoutSession | null> {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('*')
    .eq('workout_id', workoutId)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

// ── Vitals (generic metric log: weight, steps, water, heart rate, ...) ────────
// One row per (trainee, metric_name, day). Adding a new metric never needs a
// schema change — just a new metric_name. Different metrics use different
// write patterns (overwrite the day's value vs. accumulate), handled here.

function todayDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function upsertVital(traineeId: string, metricName: string, value: number, uom: string | null) {
  const { error } = await supabase.from('vitals').upsert(
    { trainee_id: traineeId, metric_name: metricName, metric_value: value, metric_uom: uom, created_date: todayDateString() },
    { onConflict: 'trainee_id,metric_name,created_date' }
  );
  if (error) throw error;
}

async function getTodayVital(traineeId: string, metricName: string): Promise<DBVital | null> {
  const { data, error } = await supabase
    .from('vitals')
    .select('*')
    .eq('trainee_id', traineeId)
    .eq('metric_name', metricName)
    .eq('created_date', todayDateString())
    .maybeSingle();
  if (error) return null;
  return data;
}

export async function getVitalsHistory(traineeId: string, metricName: string, limit: number = 30): Promise<DBVital[]> {
  const { data, error } = await supabase
    .from('vitals')
    .select('*')
    .eq('trainee_id', traineeId)
    .eq('metric_name', metricName)
    .order('created_date', { ascending: false })
    .limit(limit);
  if (error) return [];
  return data ?? [];
}

// ── Weight (backed by vitals; keeps the DBWeightLog shape everything else
// in the app already expects) ──────────────────────────────────────────────

export async function logBodyWeight(traineeId: string, weightKg: number) {
  await upsertVital(traineeId, 'weight', weightKg, 'kg');
}

export async function getWeightLogs(traineeId: string): Promise<DBWeightLog[]> {
  const rows = await getVitalsHistory(traineeId, 'weight', 30);
  return rows.map(r => ({ id: r.id, trainee_id: r.trainee_id, weight_kg: r.metric_value, logged_at: r.created_date }));
}

// ── Steps / water / heart rate ─────────────────────────────────────────────

export interface TodayVitals {
  steps: number;
  water_ml: number;
  heart_rate: number | null;
}

export async function getTodayMetrics(traineeId: string): Promise<TodayVitals> {
  const [steps, water, hr] = await Promise.all([
    getTodayVital(traineeId, 'steps'),
    getTodayVital(traineeId, 'water'),
    getTodayVital(traineeId, 'heart_rate'),
  ]);
  return {
    steps: steps?.metric_value ?? 0,
    water_ml: water?.metric_value ?? 0,
    heart_rate: hr?.metric_value ?? null,
  };
}

// Overwrites today's step count — the phone's pedometer already reports the
// running total for the day, so there's nothing to accumulate here.
export async function setTodaySteps(traineeId: string, steps: number) {
  await upsertVital(traineeId, 'steps', steps, 'steps');
}

// Adds to today's running water total (each log is a top-up, e.g. "+250ml").
export async function addTodayWater(traineeId: string, amountMl: number): Promise<{ water_ml: number }> {
  const existing = await getTodayVital(traineeId, 'water');
  const water_ml = Math.max(0, (existing?.metric_value ?? 0) + amountMl);
  await upsertVital(traineeId, 'water', water_ml, 'ml');
  return { water_ml };
}

export async function setTodayHeartRate(traineeId: string, heartRate: number) {
  await upsertVital(traineeId, 'heart_rate', heartRate, 'bpm');
}

// ── Exercise weight logs ──────────────────────────────────────────────────────

export async function logExerciseWeight(
  traineeId: string,
  exerciseName: string,
  weight: string,
  reps: string,
  sets: number
) {
  const today = new Date().toISOString().split('T')[0];
  const { error } = await supabase.from('exercise_weight_logs').insert({
    trainee_id: traineeId,
    exercise_name: exerciseName,
    weight,
    reps,
    sets,
    logged_at: today,
  });
  if (error) throw error;
}

export async function getExerciseWeightLogs(traineeId: string, limit: number = 100): Promise<DBExerciseWeightLog[]> {
  const { data, error } = await supabase
    .from('exercise_weight_logs')
    .select('*')
    .eq('trainee_id', traineeId)
    .order('logged_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return data ?? [];
}

// ── Nutrition plans ────────────────────────────────────────────────────────────

const NUTRITION_BUCKET = 'nutrition-plans';

// A trainee can't have two plans with the same name — it's almost always a
// mistake (which one did the coach mean to edit/assign?), so it's blocked
// outright rather than just discouraged. Scoped per-trainee, not per-coach —
// different trainees reusing a common name like "Cutting Phase" is fine.
async function assertUniquePlanTitle(traineeId: string, title: string, excludePlanId?: string) {
  const { data, error } = await supabase
    .from('nutrition_plans')
    .select('id, title')
    .eq('trainee_id', traineeId);
  if (error) throw error;
  const normalized = title.trim().toLowerCase();
  const clash = (data ?? []).some(p => p.id !== excludePlanId && p.title.trim().toLowerCase() === normalized);
  if (clash) {
    throw new Error(`This trainee already has a nutrition plan named "${title.trim()}". Please use a different name.`);
  }
}

// A trainee can have at most one active plan of each *kind* at the same
// time — a template-assigned Nutrition Plan (template_id set, from the
// coach's Nutrition tab) and a calculator-built Calorie & Macro Plan
// (template_id null) are independent slots, so activating one never retires
// the other. Deactivating stamps today as the end date (same pattern as
// setWorkoutActive) so it reads as real history instead of just disappearing.
async function deactivateOtherPlans(traineeId: string, exceptPlanId: string, isCalculated: boolean) {
  const end_date = new Date().toISOString().split('T')[0];
  let query = supabase
    .from('nutrition_plans')
    .update({ active: false, end_date })
    .eq('trainee_id', traineeId)
    .eq('active', true)
    .neq('id', exceptPlanId);
  query = isCalculated ? query.is('template_id', null) : query.not('template_id', 'is', null);
  const { error } = await query;
  if (error) throw error;
}

// Quick PDF-only plan — structured targets (if any) are added/edited afterward
// via updateNutritionPlan, same as any other plan.
export async function uploadNutritionPlan(
  traineeId: string,
  coachId: string,
  fileUri: string,
  fileName: string
): Promise<DBNutritionPlan> {
  await assertUniquePlanTitle(traineeId, fileName);

  const storagePath = `${traineeId}/${Date.now()}-${fileName}`;

  await uploadFileToStorage(fileUri, NUTRITION_BUCKET, storagePath, 'application/pdf');

  const { data: urlData } = supabase.storage.from(NUTRITION_BUCKET).getPublicUrl(storagePath);

  const { data, error } = await supabase
    .from('nutrition_plans')
    .insert({
      trainee_id: traineeId,
      coach_id: coachId,
      title: fileName,
      active: true,
      file_name: fileName,
      file_url: urlData.publicUrl,
      storage_path: storagePath,
    })
    .select()
    .single();
  if (error) throw error;
  // No template_id (not template-based) — grouped with the calorie/macro kind.
  await deactivateOtherPlans(traineeId, data.id, true);
  return data;
}

// ── Nutrition plan templates (reusable, coach-owned — mirrors programs) ───────

export async function getNutritionTemplates(coachId: string): Promise<DBNutritionPlanTemplate[]> {
  const { data, error } = await supabase
    .from('nutrition_plan_templates')
    .select('*')
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data ?? [];
}

export async function createNutritionTemplate(
  coachId: string,
  fields: Pick<DBNutritionPlanTemplate, 'title' | 'notes' | 'target_calories' | 'target_protein' | 'target_carbs' | 'target_fat' | 'target_water_ml'>
): Promise<DBNutritionPlanTemplate> {
  const { data, error } = await supabase
    .from('nutrition_plan_templates')
    .insert({ coach_id: coachId, ...fields })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateNutritionTemplate(
  templateId: string,
  fields: Partial<Pick<DBNutritionPlanTemplate, 'title' | 'notes' | 'target_calories' | 'target_protein' | 'target_carbs' | 'target_fat' | 'target_water_ml'>>
): Promise<DBNutritionPlanTemplate> {
  const { data, error } = await supabase
    .from('nutrition_plan_templates')
    .update(fields)
    .eq('id', templateId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteNutritionTemplate(templateId: string) {
  const { error } = await supabase.from('nutrition_plan_templates').delete().eq('id', templateId);
  if (error) throw error;
}

// Assigning copies the template's current values into a new nutrition_plans
// row (same snapshot pattern as assigning a program copies its exercises) —
// later edits to the template don't retroactively change plans already given
// out. template_id is kept only for provenance.
export async function assignNutritionTemplate(
  traineeId: string,
  coachId: string,
  template: DBNutritionPlanTemplate
): Promise<DBNutritionPlan> {
  await assertUniquePlanTitle(traineeId, template.title);

  const { data, error } = await supabase
    .from('nutrition_plans')
    .insert({
      trainee_id: traineeId,
      coach_id: coachId,
      template_id: template.id,
      active: true,
      title: template.title,
      notes: template.notes,
      target_calories: template.target_calories,
      target_protein: template.target_protein,
      target_carbs: template.target_carbs,
      target_fat: template.target_fat,
      target_water_ml: template.target_water_ml,
    })
    .select()
    .single();
  if (error) throw error;
  await deactivateOtherPlans(traineeId, data.id, false);
  return data;
}

export async function updateNutritionPlan(
  planId: string,
  fields: Partial<
    Pick<
      DBNutritionPlan,
      | 'title'
      | 'notes'
      | 'target_calories'
      | 'target_protein'
      | 'target_carbs'
      | 'target_fat'
      | 'target_water_ml'
      | 'meal_count'
      | 'macro_split'
      | 'meals'
      | 'calc_inputs'
      | 'locked'
    >
  >
): Promise<DBNutritionPlan> {
  if (fields.title != null) {
    const { data: existing, error: fetchError } = await supabase
      .from('nutrition_plans')
      .select('trainee_id')
      .eq('id', planId)
      .single();
    if (fetchError) throw fetchError;
    await assertUniquePlanTitle(existing.trainee_id, fields.title, planId);
  }

  const { data, error } = await supabase
    .from('nutrition_plans')
    .update(fields)
    .eq('id', planId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// A trainee can have several nutrition plans; a coach retires one by setting
// it inactive rather than deleting it, so it stays visible as history.
// Deactivating stamps today as the end date (mirrors setWorkoutActive);
// reactivating clears it. Since a trainee can only ever have one active plan
// per kind (see deactivateOtherPlans), reactivating this one only deactivates
// whatever else of the *same* kind was active.
export async function setNutritionPlanActive(planId: string, active: boolean) {
  const end_date = active ? null : new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('nutrition_plans')
    .update({ active, end_date })
    .eq('id', planId)
    .select('trainee_id, template_id')
    .single();
  if (error) throw error;
  if (active) {
    await deactivateOtherPlans(data.trainee_id, planId, data.template_id == null);
  }
}

export async function getNutritionPlans(traineeId: string): Promise<DBNutritionPlan[]> {
  const { data, error } = await supabase
    .from('nutrition_plans')
    .select('*')
    .eq('trainee_id', traineeId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data ?? [];
}

export async function deleteNutritionPlan(planId: string, storagePath: string | null) {
  if (storagePath) {
    await supabase.storage.from(NUTRITION_BUCKET).remove([storagePath]);
  }
  const { error } = await supabase.from('nutrition_plans').delete().eq('id', planId);
  if (error) throw error;
}

// ── Calculated calorie/macro plans (biometric-driven, generator-built) ────────

// Builds a new custom nutrition_plans row from the calorie calculator flow —
// not template-based, so no template_id. Starts unlocked; the caller locks
// it via updateNutritionPlan once the coach finalizes.
export async function createCalculatedNutritionPlan(
  traineeId: string,
  coachId: string,
  fields: Pick<
    DBNutritionPlan,
    | 'title'
    | 'notes'
    | 'target_calories'
    | 'target_protein'
    | 'target_carbs'
    | 'target_fat'
    | 'target_water_ml'
    | 'meal_count'
    | 'macro_split'
    | 'meals'
    | 'calc_inputs'
  >
): Promise<DBNutritionPlan> {
  await assertUniquePlanTitle(traineeId, fields.title);

  const { data, error } = await supabase
    .from('nutrition_plans')
    .insert({ trainee_id: traineeId, coach_id: coachId, active: true, locked: false, ...fields })
    .select()
    .single();
  if (error) throw error;
  await deactivateOtherPlans(traineeId, data.id, true);
  return data;
}

export async function getFoodLogEntries(traineeId: string, limit: number = 200): Promise<DBFoodLogEntry[]> {
  const { data, error } = await supabase
    .from('food_log_entries')
    .select('*')
    .eq('trainee_id', traineeId)
    .order('logged_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return data ?? [];
}

export async function addFoodLogEntry(traineeId: string, foodName: string, calories: number | null): Promise<DBFoodLogEntry> {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('food_log_entries')
    .insert({ trainee_id: traineeId, food_name: foodName, calories, logged_at: today })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteFoodLogEntry(id: string) {
  const { error } = await supabase.from('food_log_entries').delete().eq('id', id);
  if (error) throw error;
}

// ── Meal completion tracking (per plan meal slot, per day) ────────────────────

export async function getMealCompletions(
  traineeId: string,
  planId: string,
  limitDays: number = 30
): Promise<DBMealCompletion[]> {
  const { data, error } = await supabase
    .from('meal_completions')
    .select('*')
    .eq('trainee_id', traineeId)
    .eq('nutrition_plan_id', planId)
    .order('log_date', { ascending: false })
    .limit(limitDays * 10); // up to ~10 meal slots/day of history
  if (error) return [];
  return data ?? [];
}

// One row per (trainee, plan, meal slot, day) — overwrites if the trainee
// changes their mind about today's status for that meal.
export async function upsertMealCompletion(
  traineeId: string,
  planId: string,
  mealSlot: number,
  logDate: string,
  status: DBMealCompletion['status'],
  substituteNote: string | null
): Promise<DBMealCompletion> {
  const { data, error } = await supabase
    .from('meal_completions')
    .upsert(
      {
        trainee_id: traineeId,
        nutrition_plan_id: planId,
        meal_slot: mealSlot,
        log_date: logDate,
        status,
        substitute_note: substituteNote,
      },
      { onConflict: 'trainee_id,nutrition_plan_id,meal_slot,log_date' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Coach ↔ Trainee requests ────────────────────────────────────────────────

// Admins can also act as coaches (via "Switch to Coach View"), so they're
// discoverable here too, not just role='coach' accounts.
export async function searchCoaches(query: string, excludeId: string): Promise<DBUser[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .in('role', ['coach', 'admin'])
    .neq('id', excludeId)
    .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
    .limit(10);
  if (error) return [];
  return data ?? [];
}

export async function searchUnassignedTrainees(query: string): Promise<DBUser[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('role', 'trainee')
    .is('coach_id', null)
    .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
    .limit(10);
  if (error) return [];
  return data ?? [];
}

export async function sendCoachRequest(coachId: string, traineeId: string, initiatedBy: 'coach' | 'trainee') {
  const { error } = await supabase
    .from('coach_requests')
    .insert({ coach_id: coachId, trainee_id: traineeId, initiated_by: initiatedBy, status: 'pending' });
  if (error) throw error;

  // Notify the coach — otherwise a trainee-initiated request just sits
  // invisible in the "Requests" section of CoachTrainees.tsx until the coach
  // happens to check it. Reuses the same in-app messages-table mechanism as
  // the workout-completion notification (see Coach Notifications in
  // CLAUDE.md), so it shows up in the coach's notification bell like any
  // other. Isolated in its own try/catch so a failure here never blocks the
  // request itself from being sent.
  if (initiatedBy === 'trainee') {
    try {
      const trainee = await getProfile(traineeId);
      if (trainee) {
        await sendMessage(traineeId, coachId, `👋 ${trainee.name} wants to connect with you as their coach`);
      }
    } catch (e) {
      console.warn('sendCoachRequest: failed to notify coach', e);
    }
  }
}

export async function getCoachRequestStatus(coachId: string, traineeId: string): Promise<'none' | 'pending' | 'accepted'> {
  const { data } = await supabase
    .from('coach_requests')
    .select('status')
    .eq('coach_id', coachId)
    .eq('trainee_id', traineeId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data || data.status === 'declined') return 'none';
  return data.status;
}

export async function getAllCoachRequestsForCoach(coachId: string): Promise<DBCoachRequest[]> {
  const { data, error } = await supabase
    .from('coach_requests')
    .select('*')
    .eq('coach_id', coachId);
  if (error) return [];
  return data ?? [];
}

export async function getIncomingCoachRequests(coachId: string): Promise<(DBCoachRequest & { trainee: DBUser })[]> {
  const { data, error } = await supabase
    .from('coach_requests')
    .select('*, trainee:users!coach_requests_trainee_id_fkey(*)')
    .eq('coach_id', coachId)
    .eq('initiated_by', 'trainee')
    .eq('status', 'pending');
  if (error) return [];
  return (data ?? []) as any;
}

export async function getOutgoingCoachRequests(coachId: string): Promise<(DBCoachRequest & { trainee: DBUser })[]> {
  const { data, error } = await supabase
    .from('coach_requests')
    .select('*, trainee:users!coach_requests_trainee_id_fkey(*)')
    .eq('coach_id', coachId)
    .eq('initiated_by', 'coach')
    .eq('status', 'pending');
  if (error) return [];
  return (data ?? []) as any;
}

export async function getIncomingCoachRequestForTrainee(traineeId: string): Promise<(DBCoachRequest & { coach: DBUser }) | null> {
  const { data, error } = await supabase
    .from('coach_requests')
    .select('*, coach:users!coach_requests_coach_id_fkey(*)')
    .eq('trainee_id', traineeId)
    .eq('initiated_by', 'coach')
    .eq('status', 'pending')
    .maybeSingle();
  if (error) return null;
  return data as any;
}

export async function getOutgoingCoachRequestForTrainee(traineeId: string): Promise<(DBCoachRequest & { coach: DBUser }) | null> {
  const { data, error } = await supabase
    .from('coach_requests')
    .select('*, coach:users!coach_requests_coach_id_fkey(*)')
    .eq('trainee_id', traineeId)
    .eq('initiated_by', 'trainee')
    .eq('status', 'pending')
    .maybeSingle();
  if (error) return null;
  return data as any;
}

// Accepting a request has to flip the trainee's coach_id even though the
// accepting party (whichever side didn't initiate) doesn't own that row
// under RLS yet — that's exactly what this call is establishing. Done via
// accept_coach_request, a SECURITY DEFINER RPC that re-validates the request
// row itself (coach_id/trainee_id, status='pending', caller is one of the
// two parties) rather than trusting these client-supplied ids directly.
// Returns whether the "Coach Connected" medal was newly awarded (as opposed
// to already held) — callers running on the trainee's own device (as
// opposed to the coach's, which can also call this) use it to fire a local
// achievement notification; see ProfileScreen.tsx.
export async function acceptCoachRequest(requestId: string, coachId: string, traineeId: string): Promise<boolean> {
  const { error } = await supabase.rpc('accept_coach_request', { p_request_id: requestId });
  if (error) throw error;
  // "Coach Connected" achievement — awarded here (the moment a connection is
  // actually made) rather than in evaluateAndAwardMedals, since a trainee
  // can't have completed any workout at all without a coach already
  // assigned, so checking it at workout-completion time would always
  // co-fire with "First Step" and never mean anything on its own. Goes
  // through claim_coach_connected_medal (a SECURITY DEFINER RPC) rather than
  // a direct client write — see scripts/secure_gamification.sql.
  try {
    const { data, error: medalError } = await supabase.rpc('claim_coach_connected_medal', { p_trainee_id: traineeId });
    if (medalError) throw medalError;
    return !!data?.newly_earned;
  } catch (e) {
    console.warn('acceptCoachRequest: failed to award Coach Connected medal', e);
    return false;
  }
}

export async function declineCoachRequest(requestId: string) {
  const { error } = await supabase.from('coach_requests').update({ status: 'declined' }).eq('id', requestId);
  if (error) throw error;
}

export async function getAllUserFriendships(userId: string): Promise<DBFriendship[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`);
  if (error) return [];
  return data ?? [];
}

// ── Messages ──────────────────────────────────────────────────────────────────

export async function getMessages(userId: string, otherId: string): Promise<DBMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(`and(from_id.eq.${userId},to_id.eq.${otherId}),and(from_id.eq.${otherId},to_id.eq.${userId})`)
    .order('created_at', { ascending: true });
  if (error) return [];
  return data ?? [];
}

export async function sendMessage(fromId: string, toId: string, message: string) {
  const { error } = await supabase.from('messages').insert({ from_id: fromId, to_id: toId, message });
  if (error) throw error;
}

export async function markMessagesRead(toId: string, fromId: string) {
  await supabase
    .from('messages')
    .update({ read: true })
    .eq('to_id', toId)
    .eq('from_id', fromId)
    .eq('read', false);
}

export async function markMessageRead(messageId: string) {
  await supabase.from('messages').update({ read: true }).eq('id', messageId);
}

export async function getUnreadMessagesForCoach(coachId: string): Promise<(DBMessage & { fromUser?: DBUser })[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('to_id', coachId)
    .eq('read', false)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  const fromIds = Array.from(new Set(data.map(m => m.from_id)));
  if (fromIds.length === 0) return data.map(m => ({ ...m, fromUser: undefined }));
  const { data: users } = await supabase.from('users').select('*').in('id', fromIds);
  const userMap = new Map((users ?? []).map(u => [u.id, u]));
  return data.map(m => ({ ...m, fromUser: userMap.get(m.from_id) }));
}

// All notifications a coach has ever received (read + unread), for a persistent
// notifications list — unlike getUnreadMessagesForCoach, entries don't vanish
// once marked read.
export async function getMessagesForCoach(coachId: string, limit: number = 50): Promise<(DBMessage & { fromUser?: DBUser })[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('to_id', coachId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  const fromIds = Array.from(new Set(data.map(m => m.from_id)));
  if (fromIds.length === 0) return data.map(m => ({ ...m, fromUser: undefined }));
  const { data: users } = await supabase.from('users').select('*').in('id', fromIds);
  const userMap = new Map((users ?? []).map(u => [u.id, u]));
  return data.map(m => ({ ...m, fromUser: userMap.get(m.from_id) }));
}

export async function deleteMessage(messageId: string) {
  const { error } = await supabase.from('messages').delete().eq('id', messageId);
  if (error) throw error;
}

// ── Medals ────────────────────────────────────────────────────────────────────

export async function getUserMedals(userId: string): Promise<DBUserMedal[]> {
  const { data, error } = await supabase.from('user_medals').select('*').eq('user_id', userId);
  if (error) return [];
  return data ?? [];
}

// Everything below this point used to compute XP/streak/medal-eligibility
// client-side and write it via a plain, unrestricted update/upsert — any
// authenticated user could set their own xp/level/streak to anything, or
// self-award any medal, by calling the API directly with their own valid
// session. Replaced with thin wrappers around SECURITY DEFINER RPCs that
// recompute everything server-side from real data — see
// scripts/secure_gamification.sql for the full implementation/reasoning.
// The RPCs always operate on auth.uid() internally; none of them accept a
// caller-supplied trainee id, so this can't be used to award someone else's
// account either.

// Re-evaluates the objectively computable medal rules (profile completeness
// right now, mainly — "New Adventure"/"Profile Complete") against current
// stats and awards any newly-qualified ones. Called after saving the
// biometric profile so those two don't wait for the trainee's next workout;
// workout completion evaluates the full medal set itself, server-side, as
// part of completeWorkoutSession below.
export async function evaluateAndAwardMedals(): Promise<{ newlyEarned: string[]; newXp: number; newLevel: number }> {
  const { data, error } = await supabase.rpc('evaluate_and_award_medals');
  if (error) throw error;
  return {
    newlyEarned: data?.newly_earned ?? [],
    newXp: data?.new_xp ?? 0,
    newLevel: data?.new_level ?? 1,
  };
}

// Recomputes the trainee's streak from their full activity history and
// persists it. Call after any streak-eligible event that ISN'T a workout
// completion (which recalculates it itself, server-side) — currently just
// nutrition tracking (FoodLogScreen's meal-status buttons).
export async function recalculateStreak(): Promise<number> {
  const { data, error } = await supabase.rpc('recalculate_streak');
  if (error) throw error;
  return data ?? 0;
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export async function getLeaderboard(): Promise<DBUser[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('role', 'trainee')
    .gt('xp', 0)
    .order('xp', { ascending: false })
    .limit(50);
  if (error) return [];
  return data ?? [];
}

// Unlike getLeaderboard's Global tab (which deliberately hides 0-XP users to
// avoid a giant list of nobodies), a gym is a small, coach-curated roster —
// every member the coach added should show up here regardless of XP. Was
// previously filtered the same way as Global, which silently dropped any
// newly-assigned member who hadn't logged XP yet.
export async function getGymLeaderboard(gymId: string): Promise<DBUser[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('gym_id', gymId)
    .order('xp', { ascending: false });
  if (error) return [];
  return data ?? [];
}

// ── Friends ───────────────────────────────────────────────────────────────────

export async function getFriends(userId: string): Promise<DBUser[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
    .eq('status', 'accepted');
  if (error || !data) return [];

  const friendIds = data.map((f: DBFriendship) =>
    f.user_id === userId ? f.friend_id : f.user_id
  );
  if (friendIds.length === 0) return [];

  const { data: users, error: uError } = await supabase
    .from('users')
    .select('*')
    .in('id', friendIds)
    .order('xp', { ascending: false });
  if (uError) return [];
  return users ?? [];
}

export async function searchUsers(query: string, excludeId: string): Promise<DBUser[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('role', 'trainee')
    .neq('id', excludeId)
    .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
    .limit(10);
  if (error) return [];
  return data ?? [];
}

export async function sendFriendRequest(userId: string, targetId: string) {
  const { error } = await supabase
    .from('friendships')
    .insert({ user_id: userId, friend_id: targetId, status: 'pending' });
  if (error) throw error;
}

// Accepting a friend request used to flip the friendships row via a plain
// client update, then separately write "Invite a Friend" XP onto the
// ORIGINAL SENDER's row (requesterId) — a different user than the caller —
// via another plain client update. That second write only worked at all
// because it had to be broadly permitted for the feature to function, which
// meant nothing stopped anyone from calling it directly to inflate an
// arbitrary account's XP. Both steps now happen atomically inside
// accept_friend_request (SECURITY DEFINER), which re-validates a genuine
// pending request exists before crediting anyone — see
// scripts/secure_gamification.sql.
export async function acceptFriendRequest(requesterId: string) {
  const { error } = await supabase.rpc('accept_friend_request', { p_requester_id: requesterId });
  if (error) throw error;
}

export async function getPendingFriendRequests(userId: string): Promise<(DBFriendship & { from: DBUser })[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('*, from:users!friendships_user_id_fkey(*)')
    .eq('friend_id', userId)
    .eq('status', 'pending');
  if (error) return [];
  return (data ?? []) as any;
}

export async function getFriendshipStatus(userId: string, targetId: string): Promise<'none' | 'pending' | 'accepted'> {
  const { data } = await supabase
    .from('friendships')
    .select('status')
    .or(`and(user_id.eq.${userId},friend_id.eq.${targetId}),and(user_id.eq.${targetId},friend_id.eq.${userId})`)
    .single();
  if (!data) return 'none';
  return data.status;
}

// ── Gyms ─────────────────────────────────────────────────────────────────────

export async function createGym(name: string, coachId: string): Promise<DBGym> {
  const { data, error } = await supabase
    .from('gyms')
    .insert({ name, coach_id: coachId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getCoachGym(coachId: string): Promise<DBGym | null> {
  const { data, error } = await supabase
    .from('gyms')
    .select('*')
    .eq('coach_id', coachId)
    .single();
  if (error) return null;
  return data;
}

export async function addToGym(userId: string, gymId: string) {
  const { error } = await supabase
    .from('users')
    .update({ gym_id: gymId })
    .eq('id', userId);
  if (error) throw error;
}

export async function removeFromGym(userId: string) {
  const { error } = await supabase
    .from('users')
    .update({ gym_id: null })
    .eq('id', userId);
  if (error) throw error;
}

// ── Admin ────────────────────────────────────────────────────────────────────

export async function getAllUsers(): Promise<DBUser[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return data ?? [];
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — easy to read aloud/type
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function createCoachInvite(adminId: string): Promise<DBCoachInvite> {
  const { data, error } = await supabase
    .from('coach_invites')
    .insert({ code: generateInviteCode(), created_by: adminId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getCoachInvites(): Promise<DBCoachInvite[]> {
  const { data, error } = await supabase
    .from('coach_invites')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return data ?? [];
}

// Refuses to revoke an invite that's already been redeemed — that coach
// account was already created, revoking the code after the fact wouldn't
// undo anything, it would just make the invite's history disappear.
export async function revokeCoachInvite(inviteId: string) {
  const { error } = await supabase
    .from('coach_invites')
    .delete()
    .eq('id', inviteId)
    .is('used_by', null);
  if (error) throw error;
}

// ── Trainee invites (coach → trainee, mirrors the coach-invite trio above) ──

export async function createTraineeInvite(coachId: string): Promise<DBTraineeInvite> {
  const { data, error } = await supabase
    .from('trainee_invites')
    .insert({ code: generateInviteCode(), created_by: coachId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getMyTraineeInvites(coachId: string): Promise<DBTraineeInvite[]> {
  const { data, error } = await supabase
    .from('trainee_invites')
    .select('*')
    .eq('created_by', coachId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data ?? [];
}

export async function revokeTraineeInvite(inviteId: string) {
  const { error } = await supabase
    .from('trainee_invites')
    .delete()
    .eq('id', inviteId)
    .is('used_by', null);
  if (error) throw error;
}

