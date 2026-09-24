-- ============================================================================
-- Reset one trainee's activity data back to a clean slate for testing.
-- Keeps the trainee's account (users row, login, coach connection) intact —
-- only clears workout/nutrition/vitals/chat/medal/XP data linked to them.
--
-- Edit v_email below to confirm/change which trainee before running.
-- ============================================================================
do $$
declare
  v_email text := 'yardena.rabi@gmail.com'; -- <-- confirm/change this
  v_trainee_id uuid;
begin
  select id into v_trainee_id from public.users where email = v_email and role = 'trainee';
  if v_trainee_id is null then
    raise exception 'No trainee found with email %', v_email;
  end if;

  -- Programs: workouts (+ their exercises), completion history, per-exercise logs
  delete from public.exercises where workout_id in (select id from public.workouts where trainee_id = v_trainee_id);
  delete from public.workout_sessions where trainee_id = v_trainee_id;
  delete from public.exercise_weight_logs where trainee_id = v_trainee_id;
  delete from public.workouts where trainee_id = v_trainee_id;

  -- Nutrition: assigned plans + meal tracking + manual food log
  -- (not nutrition_plan_templates — those are the coach's, shared across trainees)
  delete from public.meal_completions where trainee_id = v_trainee_id;
  delete from public.food_log_entries where trainee_id = v_trainee_id;
  delete from public.nutrition_plans where trainee_id = v_trainee_id;

  -- Vitals: steps / water / heart rate / weight — all one table
  delete from public.vitals where trainee_id = v_trainee_id;

  -- Chats with their coach
  delete from public.messages where from_id = v_trainee_id or to_id = v_trainee_id;

  -- Scores: earned medals/achievements
  delete from public.user_medals where user_id = v_trainee_id;

  -- Levels: reset on the account itself, not deleted
  update public.users set xp = 0, level = 1, streak = 0 where id = v_trainee_id;

  raise notice 'Reset complete for trainee % (%)', v_email, v_trainee_id;
end $$;
