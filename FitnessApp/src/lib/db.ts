import { supabase, DBUser, DBProgram, DBWorkout, DBExercise, DBWeightLog, DBExerciseWeightLog, DBMessage, DBWorkoutSession, DBGym, DBFriendship, DBNutritionPlan, DBCoachRequest, DBProgramExercise, DBLibraryExercise, DBUserMedal, DBFoodLogEntry } from './supabase';

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function signUp(email: string, password: string, name: string, role: 'admin' | 'coach' | 'trainee') {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, role, avatar: initials },
    },
  });
  if (error) throw error;

  // Insert profile row
  if (data.user) {
    const { error: profileError } = await supabase.from('users').insert({
      id: data.user.id,
      name,
      email,
      role,
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

export async function assignTraineeToCoach(traineeId: string, coachId: string) {
  const { error } = await supabase
    .from('users')
    .update({ coach_id: coachId, status: 'assigned' })
    .eq('id', traineeId);
  if (error) throw error;
}

// ── Programs ──────────────────────────────────────────────────────────────────

export interface ExercisePayloadEntry {
  id?: string; // present only when this entry already exists in the DB — drives update-in-place
  name: string;
  sets: number;
  reps: string;
  weight?: string;
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
  workout: Omit<DBWorkout, 'id' | 'created_at' | 'active'>,
  exercises: ExercisePayloadEntry[]
): Promise<DBWorkout> {
  const { data: wData, error: wError } = await supabase
    .from('workouts')
    .insert({ ...workout, active: true })
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

export async function setWorkoutActive(workoutId: string, active: boolean) {
  const { error } = await supabase.from('workouts').update({ active }).eq('id', workoutId);
  if (error) throw error;
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

export async function saveWorkoutSession(session: Omit<DBWorkoutSession, 'id' | 'completed_at'>) {
  const { error } = await supabase.from('workout_sessions').insert(session);
  if (error) throw error;
}

export async function getTraineeHistory(traineeId: string): Promise<(DBWorkoutSession & { workout_name: string })[]> {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('*, workouts(name)')
    .eq('trainee_id', traineeId)
    .order('completed_at', { ascending: false })
    .limit(20);
  if (error) return [];
  return (data ?? []).map((s: any) => ({ ...s, workout_name: s.workouts?.name ?? '' }));
}

// ── Weight logs ───────────────────────────────────────────────────────────────

export async function logBodyWeight(traineeId: string, weightKg: number) {
  const today = new Date().toISOString().split('T')[0];
  // Upsert — one entry per day
  const { error } = await supabase.from('weight_logs').upsert(
    { trainee_id: traineeId, weight_kg: weightKg, logged_at: today },
    { onConflict: 'trainee_id,logged_at' }
  );
  if (error) throw error;
}

export async function getWeightLogs(traineeId: string): Promise<DBWeightLog[]> {
  const { data, error } = await supabase
    .from('weight_logs')
    .select('*')
    .eq('trainee_id', traineeId)
    .order('logged_at', { ascending: false })
    .limit(30);
  if (error) return [];
  return data ?? [];
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

// Quick PDF-only plan — structured targets (if any) are added/edited afterward
// via updateNutritionPlan, same as any other plan.
export async function uploadNutritionPlan(
  traineeId: string,
  coachId: string,
  fileUri: string,
  fileName: string
): Promise<DBNutritionPlan> {
  const storagePath = `${traineeId}/${Date.now()}-${fileName}`;

  const response = await fetch(fileUri);
  const blob = await response.blob();
  const { error: uploadError } = await supabase.storage
    .from(NUTRITION_BUCKET)
    .upload(storagePath, blob, { contentType: 'application/pdf' });
  if (uploadError) throw uploadError;

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
  return data;
}

// Structured plan with no PDF attachment — a coach can add one later via
// updateNutritionPlan if they also want to attach a document.
export async function createNutritionPlan(
  traineeId: string,
  coachId: string,
  fields: Pick<DBNutritionPlan, 'title' | 'notes' | 'target_calories' | 'target_protein' | 'target_carbs' | 'target_fat'>
): Promise<DBNutritionPlan> {
  const { data, error } = await supabase
    .from('nutrition_plans')
    .insert({ trainee_id: traineeId, coach_id: coachId, active: true, ...fields })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateNutritionPlan(
  planId: string,
  fields: Partial<Pick<DBNutritionPlan, 'title' | 'notes' | 'target_calories' | 'target_protein' | 'target_carbs' | 'target_fat'>>
): Promise<DBNutritionPlan> {
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
export async function setNutritionPlanActive(planId: string, active: boolean) {
  const { error } = await supabase.from('nutrition_plans').update({ active }).eq('id', planId);
  if (error) throw error;
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

// ── Coach ↔ Trainee requests ────────────────────────────────────────────────

export async function searchCoaches(query: string, excludeId: string): Promise<DBUser[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('role', 'coach')
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

export async function acceptCoachRequest(requestId: string, coachId: string, traineeId: string) {
  const { error } = await supabase.from('coach_requests').update({ status: 'accepted' }).eq('id', requestId);
  if (error) throw error;
  await assignTraineeToCoach(traineeId, coachId);
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

export async function awardMedal(userId: string, medalId: string) {
  const { error } = await supabase
    .from('user_medals')
    .upsert({ user_id: userId, medal_id: medalId }, { onConflict: 'user_id,medal_id', ignoreDuplicates: true });
  if (error) throw error;
}

// Re-evaluates the objectively computable medal rules against current stats and
// awards any newly-qualified ones. Returns the medal ids newly earned this call.
export async function evaluateAndAwardMedals(userId: string, sessionsCount: number, streak: number): Promise<string[]> {
  const existing = await getUserMedals(userId);
  const earnedIds = new Set(existing.map(m => m.medal_id));
  const checks: [string, boolean][] = [
    ['1', sessionsCount >= 1],   // First Workout
    ['7', sessionsCount >= 1],   // New Adventure
    ['2', streak >= 7],          // 7-Day Streak
    ['3', streak >= 30],         // 30-Day Streak
    ['4', sessionsCount >= 100], // 100 Workouts
  ];
  const newlyEarned: string[] = [];
  for (const [medalId, qualifies] of checks) {
    if (qualifies && !earnedIds.has(medalId)) {
      await awardMedal(userId, medalId);
      newlyEarned.push(medalId);
    }
  }
  return newlyEarned;
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

export async function getGymLeaderboard(gymId: string): Promise<DBUser[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('gym_id', gymId)
    .gt('xp', 0)
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

export async function acceptFriendRequest(userId: string, requesterId: string) {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('user_id', requesterId)
    .eq('friend_id', userId);
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
