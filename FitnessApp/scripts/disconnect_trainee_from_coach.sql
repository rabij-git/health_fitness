-- ============================================================================
-- Disconnect a trainee from their coach, so the coach-request/accept flow
-- (and the "Coach Connected" achievement it awards) can be tested fresh.
-- Keeps the trainee's account, workouts, nutrition, etc. untouched — pair
-- this with scripts/reset_trainee_test_data.sql if you also want a fully
-- clean slate for the workout/streak-based achievements.
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

  -- Clear the connection itself
  update public.users set coach_id = null, gym_id = null, status = 'pending' where id = v_trainee_id;

  -- Clear any prior connection requests (either direction, any status) so a
  -- fresh request can be sent/received without a stale row in the way
  delete from public.coach_requests where trainee_id = v_trainee_id;

  -- Clear the "Coach Connected" medal (id 10) specifically, so accepting a
  -- new connection actually re-awards it (awardMedalIfNew no-ops if the
  -- user_medals row already exists) — leaves every other earned medal alone
  delete from public.user_medals where user_id = v_trainee_id and medal_id = '10';

  raise notice 'Disconnected trainee % (%) from their coach', v_email, v_trainee_id;
end $$;
