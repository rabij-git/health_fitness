-- ============================================================================
-- Permanently delete every trainee account EXCEPT the one kept below —
-- full account deletion (public.users row + auth login), not just a data
-- reset like reset_trainee_test_data.sql. Irreversible.
--
-- Run the PREVIEW query first and check the list before running the DO
-- block. Edit v_keep_email if you want to keep a different trainee.
-- ============================================================================

-- ── PREVIEW: run this first, review the list, then run the block below ──
select id, name, email, coach_id, created_at
from public.users
where role = 'trainee'
  and lower(email) <> lower('yardena.rabi@gmail.com'); -- <-- confirm/change this

-- ── DELETE: only run once you've confirmed the preview list above ──
do $$
declare
  v_keep_email text := 'yardena.rabi@gmail.com'; -- <-- confirm/change this
  v_trainee record;
  v_count int := 0;
begin
  for v_trainee in
    select id, email from public.users
    where role = 'trainee' and lower(email) <> lower(v_keep_email)
  loop
    -- Programs: workouts (+ their exercises), completion history, per-exercise logs
    delete from public.exercises where workout_id in (select id from public.workouts where trainee_id = v_trainee.id);
    delete from public.workout_sessions where trainee_id = v_trainee.id;
    delete from public.exercise_weight_logs where trainee_id = v_trainee.id;
    delete from public.workouts where trainee_id = v_trainee.id;

    -- Nutrition: assigned plans + meal tracking + manual food log
    delete from public.meal_completions where trainee_id = v_trainee.id;
    delete from public.food_log_entries where trainee_id = v_trainee.id;
    delete from public.nutrition_plans where trainee_id = v_trainee.id;

    -- Vitals: steps / water / heart rate / weight — all one table
    delete from public.vitals where trainee_id = v_trainee.id;

    -- Chats (either direction)
    delete from public.messages where from_id = v_trainee.id or to_id = v_trainee.id;

    -- Medals/achievements
    delete from public.user_medals where user_id = v_trainee.id;

    -- Social: friendships (either side) and coach connection requests
    delete from public.friendships where user_id = v_trainee.id or friend_id = v_trainee.id;
    delete from public.coach_requests where trainee_id = v_trainee.id;

    -- If they signed up via a trainee invite code, clear the reference so
    -- deleting them doesn't hit trainee_invites' FK on used_by — the invite
    -- row itself (and its "used" history) is left in place.
    update public.trainee_invites set used_by = null where used_by = v_trainee.id;

    -- The account itself: profile row, then the Supabase Auth login
    delete from public.users where id = v_trainee.id;
    delete from auth.users where id = v_trainee.id;

    v_count := v_count + 1;
    raise notice 'Deleted trainee % (%)', v_trainee.email, v_trainee.id;
  end loop;

  raise notice 'Done — % trainee account(s) deleted, % kept', v_count, v_keep_email;
end $$;
