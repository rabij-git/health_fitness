-- ============================================================================
-- Lets a signed-in trainee or coach permanently delete their OWN account and
-- data, in one atomic transaction, from inside the app — required by both
-- the App Store (Guideline 5.1.1(v)) and Google Play's Data Safety policy
-- for any app that supports in-app account creation.
--
-- Run this whole file once in the Supabase SQL Editor. Idempotent (safe to
-- re-run) — uses CREATE OR REPLACE throughout. Callable via db.ts's
-- deleteOwnAccount(), wired into ProfileScreen.tsx (trainee) and
-- CoachSettings.tsx (coach).
--
-- Irreversible, but SAFE to test: the whole function body is one Postgres
-- transaction — if any statement below hits a constraint this script didn't
-- anticipate (e.g. a NOT NULL column this project's schema turned out to
-- have that isn't documented anywhere I could check from here), the entire
-- function throws and rolls back completely rather than partially deleting
-- an account. Test with a real coach test account (not just a trainee) at
-- least once before relying on this in production — the coach path touches
-- more tables and has more that could theoretically go wrong.
-- ============================================================================

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select role into v_role from public.users where id = v_uid;
  if v_role is null then
    raise exception 'No profile found for this account';
  end if;

  if v_role = 'trainee' then
    delete from public.exercises where workout_id in (select id from public.workouts where trainee_id = v_uid);
    delete from public.workout_sessions where trainee_id = v_uid;
    delete from public.exercise_weight_logs where trainee_id = v_uid;
    delete from public.workouts where trainee_id = v_uid;

    delete from public.meal_completions where trainee_id = v_uid;
    delete from public.food_log_entries where trainee_id = v_uid;
    delete from public.nutrition_plans where trainee_id = v_uid;

    delete from public.vitals where trainee_id = v_uid;

    delete from public.messages where from_id = v_uid or to_id = v_uid;
    delete from public.user_medals where user_id = v_uid;
    delete from public.friendships where user_id = v_uid or friend_id = v_uid;
    delete from public.coach_requests where trainee_id = v_uid;

    -- used_by is nullable (mirrors disconnect_trainee_from_coach.sql /
    -- delete_other_trainees.sql) — keeps the invite code's redemption
    -- history intact without blocking this account's deletion on it.
    update public.trainee_invites set used_by = null where used_by = v_uid;

  elsif v_role = 'coach' then
    -- Disconnect (don't delete) every trainee this coach had — their
    -- account and history belong to them, not to this coach.
    update public.users set coach_id = null, gym_id = null, status = 'pending' where coach_id = v_uid;
    delete from public.coach_requests where coach_id = v_uid;

    -- Detach this coach from plans they assigned rather than deleting the
    -- plans themselves — that history belongs to the trainee who has it.
    update public.nutrition_plans set coach_id = null where coach_id = v_uid;

    -- This coach's own generated trainee-invite codes — created_by is NOT
    -- NULL, so (unlike used_by above) these rows can't be preserved by
    -- nulling a column; deleting your own generated codes as part of
    -- deleting your own account is expected behavior, not data loss.
    delete from public.trainee_invites where created_by = v_uid;
    update public.coach_invites set used_by = null where used_by = v_uid;

    -- Programs: detach any workout still pointing at one of this coach's
    -- program templates (a workout is a trainee's own copy/instance, not
    -- the coach's — deleting the template shouldn't touch it) before
    -- deleting the templates themselves.
    update public.workouts set program_id = null where program_id in (select id from public.programs where coach_id = v_uid);
    delete from public.program_exercises where program_id in (select id from public.programs where coach_id = v_uid);
    delete from public.programs where coach_id = v_uid;

    -- Nutrition templates: nutrition_plans.template_id is ON DELETE SET
    -- NULL already, so this is safe to delete directly — no detach needed.
    delete from public.nutrition_plan_templates where coach_id = v_uid;

    -- Exercise library is a shared, global resource (any coach can
    -- edit/delete any entry) — detach authorship, don't delete the entries.
    update public.exercise_library set created_by = null where created_by = v_uid;

    -- This coach's gym — every member's gym_id was already cleared above
    -- (their coach_id pointed here, so the blanket disconnect covered it).
    delete from public.gyms where coach_id = v_uid;

    delete from public.messages where from_id = v_uid or to_id = v_uid;
    delete from public.user_medals where user_id = v_uid;
    delete from public.friendships where user_id = v_uid or friend_id = v_uid;

  else
    raise exception 'Self-service deletion is not available for this account type';
  end if;

  delete from public.users where id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
