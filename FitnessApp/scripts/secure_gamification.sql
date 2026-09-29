-- ============================================================================
-- Moves gamification writes (XP, level, streak, medal awards) fully
-- server-side. Closes a real gap found during a security review: these were
-- previously computed client-side (WorkoutScreen.tsx, ProfileScreen.tsx,
-- db.ts's acceptCoachRequest/acceptFriendRequest) and written via a plain,
-- unrestricted `users`/`user_medals` update/upsert — any authenticated user
-- could set their own xp/level/streak to anything, or self-award any of the
-- 100 medals (and the XP bundled with them), by calling the Supabase REST
-- API directly with their own valid session — no exploit tooling needed.
--
-- Run this whole file once in the Supabase SQL Editor, THEN deploy the
-- matching app changes in this same commit (db.ts/WorkoutScreen.tsx/
-- ProfileScreen.tsx now call these RPCs instead of computing+writing
-- directly) — the two need to land together, since the REVOKEs at the
-- bottom of this file make the OLD client-side write path fail outright.
--
-- Idempotent (safe to re-run) — CREATE OR REPLACE / DROP IF EXISTS
-- throughout, and the seed INSERT upserts on conflict.
--
-- Known, deliberate scope limits (see CLAUDE.md's "gaming stuff" security
-- section for the full reasoning):
-- 1. A workout's per-set reps/weight/effort (`details` jsonb) stay entirely
--    client-reported — a server can't independently verify what a person
--    physically did, same trust model as any fitness app. Not a security
--    boundary this migration tries to close.
-- 2. Early Bird / Night Owl (first morning/evening workout) now check only
--    THIS session's client-reported local hour, not every session ever (the
--    server has no record of any past session's local time, only its own
--    UTC timestamp) — a one-time, low-stakes behavior change on two purely
--    cosmetic medals, not a security concern either way.
--
-- (A third limit — the duration bonus trusting a client-reported elapsed-
-- time value — was closed in a follow-up: complete_workout_session no
-- longer accepts an elapsed-minutes parameter at all; see
-- start_workout_session / workout_session_starts below, which record a real
-- server timestamp the moment a workout is opened and derive elapsed time
-- from that at completion instead.)
-- ============================================================================

-- ── 1. Reference table: XP reward per medal ─────────────────────────────────
-- Scoped to exactly the ~39 medal ids these RPCs can ever award — the
-- objectively-computable subset of the 100-medal catalog (see
-- evaluateAndAwardMedals in db.ts, being ported below). The other ~61 need a
-- feature this app doesn't have yet (see CLAUDE.md's "Deferred
-- achievements") and are never inserted by anything, client or server.
create table if not exists public.medal_xp_rewards (
  medal_id text primary key,
  xp_reward int not null
);

insert into public.medal_xp_rewards (medal_id, xp_reward) values
  ('1', 10), ('23', 10), ('28', 10), ('34', 10), ('42', 10), ('91', 10),
  ('6', 10), ('8', 10), ('9', 10), ('7', 10), ('11', 10), ('79', 10), ('25', 10),
  ('12', 15), ('13', 15), ('14', 15), ('15', 15), ('81', 15),
  ('2', 20), ('16', 20), ('29', 20), ('44', 20), ('95', 20), ('17', 20), ('82', 20),
  ('18', 30), ('19', 30), ('20', 30), ('30', 30), ('45', 30), ('84', 30),
  ('3', 50), ('4', 50), ('32', 50), ('97', 50), ('21', 50), ('31', 50), ('22', 50),
  ('10', 10)
on conflict (medal_id) do update set xp_reward = excluded.xp_reward;

revoke all on public.medal_xp_rewards from public;
grant select on public.medal_xp_rewards to authenticated;

-- ── 2. Leveling formula — exact port of computeLevelFromXp (mockData.ts) ───
create or replace function public.cumulative_xp_for_level(p_level int)
returns int
language sql
immutable
as $$
  select case
    when p_level <= 1 then 0
    when p_level <= 10 then (array[0,20,56,124,228,376,576,836,1166,1576])[p_level]
    else round(1576 + 20 * power(p_level - 1, 1.5) - 20 * power(9, 1.5))::int
  end;
$$;

create or replace function public.compute_level_from_xp(p_xp int)
returns int
language plpgsql
immutable
as $$
declare
  v_level int := 1;
begin
  while public.cumulative_xp_for_level(v_level + 1) <= p_xp loop
    v_level := v_level + 1;
  end loop;
  return v_level;
end;
$$;

-- ── 3. Streak — exact port of getStreakActiveDays + computeStreakFromActiveDays ──
-- Internal (no grant below, same convention as _evaluate_and_award_medals) —
-- being SECURITY DEFINER, this bypasses RLS on the tables it reads
-- regardless of who calls it, so exposing it directly to clients with an
-- arbitrary p_trainee_id would let anyone probe any other user's streak.
-- Only reachable via the two self-scoped wrappers below/elsewhere in this
-- file, both of which hardcode auth.uid() as the id passed in.
create or replace function public._compute_streak(p_trainee_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days date[];
  v_count int := 0;
  v_cursor date := (now() at time zone 'utc')::date;
begin
  select array_agg(distinct d) into v_days from (
    select (completed_at at time zone 'utc')::date as d
    from public.workout_sessions where trainee_id = p_trainee_id
    union
    select log_date::date from public.meal_completions where trainee_id = p_trainee_id
    union
    select logged_at::date from public.food_log_entries where trainee_id = p_trainee_id
  ) t;

  if v_days is null then return 0; end if;

  while v_cursor = any(v_days) loop
    v_count := v_count + 1;
    v_cursor := v_cursor - 1;
  end loop;

  return case when v_count >= 2 then v_count else 0 end;
end;
$$;

revoke all on function public._compute_streak(uuid) from public;

-- Standalone entry point for streak-only recalculation, used after
-- nutrition tracking (FoodLogScreen.tsx's meal-status buttons) — workout
-- completion recalculates it as part of complete_workout_session below
-- instead. Always self.
create or replace function public.recalculate_streak()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_streak int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  v_streak := public._compute_streak(v_uid);
  update public.users set streak = v_streak where id = v_uid;
  return v_streak;
end;
$$;

revoke all on function public.recalculate_streak() from public;
grant execute on function public.recalculate_streak() to authenticated;

-- ── 4. Medal evaluation — exact port of evaluateAndAwardMedals (db.ts) ─────
-- Internal (not directly callable by clients — no grant below); always
-- operates on p_trainee_id as passed by a TRUSTED caller (the two RPCs
-- below, both of which hardcode it to auth.uid(), never a client-supplied
-- id) so this can't be used to award medals to someone else's account.
create or replace function public._evaluate_and_award_medals(p_trainee_id uuid, p_completed_hour_local int default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.users%rowtype;
  v_session_count int;
  v_active_days int;
  v_max_steps int;
  v_weight_count int;
  v_workouts_assigned int;
  v_is_morning boolean;
  v_is_evening boolean;
  v_profile_complete boolean;
  v_newly_earned text[] := '{}';
  v_xp_awarded int := 0;
  v_reward int;
  rec record;
begin
  select * into v_profile from public.users where id = p_trainee_id;
  if not found then
    return jsonb_build_object('newly_earned', '[]'::jsonb, 'xp_awarded', 0);
  end if;

  select count(*) into v_session_count from public.workout_sessions where trainee_id = p_trainee_id;
  select count(distinct (completed_at at time zone 'utc')::date) into v_active_days from public.workout_sessions where trainee_id = p_trainee_id;
  select coalesce(max(metric_value), 0)::int into v_max_steps from public.vitals where trainee_id = p_trainee_id and metric_name = 'steps';
  select count(*) into v_weight_count from public.vitals where trainee_id = p_trainee_id and metric_name = 'weight';
  select count(*) into v_workouts_assigned from public.workouts where trainee_id = p_trainee_id;
  v_profile_complete := v_profile.birth_year is not null and v_profile.sex is not null
                     and v_profile.height_cm is not null and v_profile.activity_level is not null;
  v_is_morning := p_completed_hour_local is not null and p_completed_hour_local >= 0 and p_completed_hour_local < 12;
  v_is_evening := p_completed_hour_local is not null and p_completed_hour_local >= 18 and p_completed_hour_local < 24;

  for rec in
    select medal_id, qualifies from (values
      ('1', v_session_count >= 1), ('23', v_session_count >= 1), ('28', v_session_count >= 1),
      ('34', v_session_count >= 1), ('42', v_session_count >= 1), ('91', v_session_count >= 1),
      ('6', v_is_morning), ('8', v_is_evening),
      ('9', v_profile_complete), ('7', v_profile_complete),
      ('11', v_weight_count >= 1), ('79', v_weight_count >= 1),
      ('25', v_workouts_assigned >= 1),
      ('12', v_profile.streak >= 3), ('13', v_session_count >= 5),
      ('14', v_max_steps >= 10000), ('15', v_active_days >= 10),
      ('2', v_profile.streak >= 7),
      ('16', v_session_count >= 10), ('29', v_session_count >= 10), ('44', v_session_count >= 10),
      ('81', v_session_count >= 10), ('95', v_session_count >= 10),
      ('17', v_workouts_assigned >= 2),
      ('18', v_profile.streak >= 14), ('19', v_profile.streak >= 21),
      ('20', v_session_count >= 25), ('30', v_session_count >= 25),
      ('45', v_session_count >= 25), ('82', v_session_count >= 25),
      ('3', v_profile.streak >= 30),
      ('4', v_session_count >= 100), ('32', v_session_count >= 100), ('97', v_session_count >= 100),
      ('21', v_session_count >= 50), ('31', v_session_count >= 50), ('84', v_session_count >= 50),
      ('22', v_active_days >= 100)
    ) as t(medal_id, qualifies)
  loop
    if rec.qualifies then
      insert into public.user_medals (user_id, medal_id)
        values (p_trainee_id, rec.medal_id)
        on conflict (user_id, medal_id) do nothing;
      if found then
        v_newly_earned := array_append(v_newly_earned, rec.medal_id);
        select xp_reward into v_reward from public.medal_xp_rewards where medal_id = rec.medal_id;
        v_xp_awarded := v_xp_awarded + coalesce(v_reward, 0);
      end if;
    end if;
  end loop;

  if v_xp_awarded > 0 then
    update public.users
      set xp = xp + v_xp_awarded,
          level = public.compute_level_from_xp(xp + v_xp_awarded)
      where id = p_trainee_id;
  end if;

  select xp, level into v_profile.xp, v_profile.level from public.users where id = p_trainee_id;
  return jsonb_build_object(
    'newly_earned', to_jsonb(v_newly_earned),
    'xp_awarded', v_xp_awarded,
    'new_xp', v_profile.xp,
    'new_level', v_profile.level
  );
end;
$$;

revoke all on function public._evaluate_and_award_medals(uuid, int) from public;

-- Public entry point — used after saving the biometric profile (New
-- Adventure / Profile Complete can fire there without waiting for the next
-- workout). Always self — p_trainee_id is never exposed as a parameter.
create or replace function public.evaluate_and_award_medals()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  return public._evaluate_and_award_medals(auth.uid(), null);
end;
$$;

revoke all on function public.evaluate_and_award_medals() from public;
grant execute on function public.evaluate_and_award_medals() to authenticated;

-- ── 5a. Real server-side workout-start tracking, for the duration bonus ────
-- Records when a trainee actually opened a workout, so complete_workout_session
-- can compute real elapsed time itself instead of trusting a client-reported
-- number — closes the gap this migration originally only clamped/bounded (a
-- fabricated "elapsed minutes" could farm the +2-XP-per-10-min bonus up to
-- its 180-minute cap). No client write path onto this table at all —
-- started_at is always `now()`, set by the RPC itself, never a value the
-- caller can supply, so there's nothing left to fake.
create table if not exists public.workout_session_starts (
  trainee_id uuid not null references public.users(id) on delete cascade,
  workout_id uuid not null references public.workouts(id) on delete cascade,
  started_at timestamptz not null,
  primary key (trainee_id, workout_id)
);

revoke all on public.workout_session_starts from public, authenticated, anon;

-- Called once, when the trainee opens a workout to start logging (replaces
-- WorkoutScreen.tsx's old client-side sessionStartedAt ref, now removed
-- entirely — this table is the only place that timestamp lives now). Safe
-- to call repeatedly for the same workout in one sitting (e.g. leaving and
-- reopening the screen) — each call resets the clock to `now()`, same as
-- the old client-side ref did.
create or replace function public.start_workout_session(p_workout_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.workouts where id = p_workout_id and trainee_id = v_uid) then
    raise exception 'Workout not found';
  end if;
  insert into public.workout_session_starts (trainee_id, workout_id, started_at)
  values (v_uid, p_workout_id, now())
  on conflict (trainee_id, workout_id) do update set started_at = excluded.started_at;
end;
$$;

revoke all on function public.start_workout_session(uuid) from public;
grant execute on function public.start_workout_session(uuid) to authenticated;

-- ── 5b. Workout completion — replaces saveWorkoutSession + recalculateStreak
--       + evaluateAndAwardMedals + the xp/level updateProfile call, atomically ──
-- Drops the earlier 5-arg version (p_elapsed_minutes numeric) explicitly —
-- `create or replace` only replaces an EXACT signature match, so without
-- this, re-running this file after having run an earlier copy of it would
-- leave both the old (client-reported-duration) and new versions callable
-- side by side instead of the old one actually going away.
drop function if exists public.complete_workout_session(uuid, jsonb, int, numeric, int);

create or replace function public.complete_workout_session(
  p_workout_id uuid,
  p_details jsonb,
  p_completion_pct int,
  p_completed_hour_local int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_already_today boolean;
  v_started_at timestamptz;
  v_elapsed_minutes numeric;
  v_workout_xp int;
  v_daily_streak_xp int := 0;
  v_medal_result jsonb;
  v_medal_xp int;
  v_new_streak int;
  v_total_xp int;
  v_new_xp int;
  v_new_level int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (select 1 from public.workouts where id = p_workout_id and trainee_id = v_uid) then
    raise exception 'Workout not found';
  end if;

  if exists (
    select 1 from public.workout_sessions
    where trainee_id = v_uid and workout_id = p_workout_id
      and (completed_at at time zone 'utc')::date = (now() at time zone 'utc')::date
  ) then
    raise exception 'This workout has already been completed today';
  end if;

  select exists (
    select 1 from public.workout_sessions
    where trainee_id = v_uid
      and (completed_at at time zone 'utc')::date = (now() at time zone 'utc')::date
  ) into v_already_today;

  -- Real elapsed time, derived from the server-recorded start (5a above) —
  -- no client-reported duration accepted anymore. No start on file (e.g. the
  -- trainee never actually "opened" it through the normal flow) means no
  -- duration bonus, not a guessed default.
  select started_at into v_started_at
    from public.workout_session_starts
    where trainee_id = v_uid and workout_id = p_workout_id;
  if v_started_at is not null then
    v_elapsed_minutes := extract(epoch from (now() - v_started_at)) / 60.0;
  else
    v_elapsed_minutes := 0;
  end if;

  v_workout_xp := 10 + floor(least(greatest(v_elapsed_minutes, 0), 180) / 10) * 2;
  if not v_already_today then
    v_daily_streak_xp := 2;
  end if;

  insert into public.workout_sessions (trainee_id, workout_id, completion_pct, xp_awarded, details)
  values (v_uid, p_workout_id, greatest(0, least(100, coalesce(p_completion_pct, 0))), v_workout_xp, p_details);

  delete from public.workout_session_starts where trainee_id = v_uid and workout_id = p_workout_id;

  v_new_streak := public._compute_streak(v_uid);
  update public.users set streak = v_new_streak where id = v_uid;

  v_medal_result := public._evaluate_and_award_medals(v_uid, p_completed_hour_local);
  v_medal_xp := coalesce((v_medal_result->>'xp_awarded')::int, 0);

  v_total_xp := v_workout_xp + v_daily_streak_xp;
  update public.users
    set xp = xp + v_total_xp,
        level = public.compute_level_from_xp(xp + v_total_xp)
    where id = v_uid
    returning xp, level into v_new_xp, v_new_level;

  return jsonb_build_object(
    'xp_awarded', v_total_xp + v_medal_xp,
    'new_xp', v_new_xp,
    'new_level', v_new_level,
    'new_streak', v_new_streak,
    'newly_earned_medal_ids', v_medal_result->'newly_earned'
  );
end;
$$;

revoke all on function public.complete_workout_session(uuid, jsonb, int, int) from public;
grant execute on function public.complete_workout_session(uuid, jsonb, int, int) to authenticated;

-- ── 6. "Coach Connected" medal — replaces the awardMedalIfNew call in
--      acceptCoachRequest (db.ts). Doesn't touch/replace the existing
--      accept_coach_request RPC itself (its exact current body isn't
--      available to safely re-derive) — this is called right after it
--      succeeds, same as the old client flow, just through a secure path.
--      Takes p_trainee_id (not self-scoped) since acceptCoachRequest can be
--      called from EITHER side of the connection — the trainee accepting a
--      coach-initiated request, or the coach accepting a trainee-initiated
--      one — and the medal always belongs to the trainee either way. Only
--      awards if the caller is genuinely that trainee themselves, OR the
--      coach that trainee is NOW actually connected to (re-checked fresh
--      from the users row, never trusted from the caller) — a coach can't
--      claim this for someone else's trainee, and a trainee can't claim it
--      without a real coach connection. ──
create or replace function public.claim_coach_connected_medal(p_trainee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_target_coach_id uuid;
  v_reward int;
  v_new_xp int;
  v_new_level int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select coach_id into v_target_coach_id from public.users where id = p_trainee_id;

  if v_target_coach_id is null or not (p_trainee_id = v_uid or v_target_coach_id = v_uid) then
    return jsonb_build_object('newly_earned', false, 'xp_awarded', 0);
  end if;

  insert into public.user_medals (user_id, medal_id) values (p_trainee_id, '10')
    on conflict (user_id, medal_id) do nothing;

  if not found then
    return jsonb_build_object('newly_earned', false, 'xp_awarded', 0);
  end if;

  select xp_reward into v_reward from public.medal_xp_rewards where medal_id = '10';
  update public.users
    set xp = xp + coalesce(v_reward, 0),
        level = public.compute_level_from_xp(xp + coalesce(v_reward, 0))
    where id = p_trainee_id
    returning xp, level into v_new_xp, v_new_level;

  return jsonb_build_object('newly_earned', true, 'xp_awarded', coalesce(v_reward, 0), 'new_xp', v_new_xp, 'new_level', v_new_level);
end;
$$;

revoke all on function public.claim_coach_connected_medal(uuid) from public;
grant execute on function public.claim_coach_connected_medal(uuid) to authenticated;

-- ── 7. Friend-request acceptance — replaces the direct friendships.update +
--      updateProfile(requesterId, {xp,...}) pair in acceptFriendRequest
--      (db.ts), which had the accepter writing XP onto ANOTHER user's row
--      via a plain client call. Validates a real pending request exists
--      before crediting anyone. ──
create or replace function public.accept_friend_request(p_requester_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_reward int := 2; -- INVITE_FRIEND_XP, mirrors db.ts's constant of the same name
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  update public.friendships
    set status = 'accepted'
    where user_id = p_requester_id and friend_id = v_uid and status = 'pending';

  if not found then
    raise exception 'No pending friend request from that user';
  end if;

  update public.users
    set xp = xp + v_reward,
        level = public.compute_level_from_xp(xp + v_reward)
    where id = p_requester_id;
end;
$$;

revoke all on function public.accept_friend_request(uuid) from public;
grant execute on function public.accept_friend_request(uuid) to authenticated;

-- ── 8. Lock the old direct-write paths — the actual fix. Column/table-level
--      REVOKE, not an RLS policy: RLS can express "is this my row", never
--      "was this value actually earned", so the only correct tool here is
--      removing the privilege to write at all via a plain client request.
--      SECURITY DEFINER functions are entirely unaffected (they run as the
--      function owner, not as `authenticated`), so every RPC above keeps
--      working.
--
--      workout_sessions needs the same treatment as users/user_medals, not
--      just those two: session rows now only exist via
--      complete_workout_session, but a plain client INSERT there was never
--      itself blocked before this — and _evaluate_and_award_medals COUNTS
--      workout_sessions rows to decide the 10/25/50/100-workout medals, so a
--      hand-crafted extra row would still have poisoned that count on the
--      NEXT legitimate award check even with xp/level/user_medals already
--      locked down. SELECT stays open (trainee's own history, and a coach's
--      view of their trainee's) — only writes are revoked. ──
revoke update (xp, level, streak) on public.users from authenticated, anon;
revoke insert, update, delete on public.workout_sessions from authenticated, anon;
revoke insert, update, delete on public.user_medals from authenticated, anon;
