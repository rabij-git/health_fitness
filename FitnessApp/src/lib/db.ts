import { supabase, DBUser, DBProgram, DBWorkout, DBExercise, DBWeightLog, DBExerciseWeightLog, DBMessage, DBWorkoutSession, DBGym, DBFriendship } from './supabase';

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

export async function getPrograms(coachId: string): Promise<DBProgram[]> {
  const { data, error } = await supabase
    .from('programs')
    .select('*')
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createProgram(program: Omit<DBProgram, 'id' | 'created_at'>): Promise<DBProgram> {
  const { data, error } = await supabase
    .from('programs')
    .insert(program)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Workouts ──────────────────────────────────────────────────────────────────

export async function createWorkout(
  workout: Omit<DBWorkout, 'id' | 'created_at'>,
  exercises: Omit<DBExercise, 'id' | 'workout_id'>[]
): Promise<DBWorkout> {
  const { data: wData, error: wError } = await supabase
    .from('workouts')
    .insert(workout)
    .select()
    .single();
  if (wError) throw wError;

  if (exercises.length > 0) {
    const { error: exError } = await supabase.from('exercises').insert(
      exercises.map((ex, i) => ({ ...ex, workout_id: wData.id, sort_order: i }))
    );
    if (exError) throw exError;
  }
  return wData;
}

export async function getWorkoutWithExercises(traineeId: string) {
  const { data: workout, error: wError } = await supabase
    .from('workouts')
    .select('*')
    .eq('trainee_id', traineeId)
    .order('created_at', { ascending: false })
    .limit(1)
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

export async function updateWorkoutExercises(
  workoutId: string,
  exercises: Omit<DBExercise, 'id' | 'workout_id'>[]
) {
  // Delete old exercises and re-insert
  await supabase.from('exercises').delete().eq('workout_id', workoutId);
  if (exercises.length > 0) {
    const { error } = await supabase.from('exercises').insert(
      exercises.map((ex, i) => ({ ...ex, workout_id: workoutId, sort_order: i }))
    );
    if (error) throw error;
  }
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
