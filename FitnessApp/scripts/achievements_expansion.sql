-- ============================================================================
-- Second achievement pass — 45 new named achievements from a user-provided
-- 119-item list, plus moving a handful of ALREADY-catalogued ids (33, 62,
-- 83, 98, 99, 7) from "catalog-only" to genuinely auto-awarded, and
-- tightening two existing ones (6 Early Bird, 8 Night Owl) to the specific
-- clock-hour rule the list gave them. See mockData.ts's "Second achievement
-- pass" comment block and CLAUDE.md's Medals section for the full mapping
-- of which of the 119 is which.
--
-- RUN THIS AFTER scripts/secure_gamification.sql (it CREATE OR REPLACEs two
-- of that file's functions and appends new trailing parameters with
-- defaults — no DROP needed, Postgres allows this for a plain append, the
-- function keeps the same OID so its existing REVOKE/GRANT state carries
-- over; this file re-asserts them anyway, out of the same paranoia that
-- file's own header documents). Idempotent — safe to re-run.
--
-- What unlocked the biggest chunk of these: workout_sessions didn't persist
-- how long a session actually took — the elapsed-time value was computed
-- for the XP duration bonus and then thrown away. Persisting it as
-- `duration_minutes` (still server-measured, from the same
-- workout_session_starts timestamp complete_workout_session already
-- trusted — never a client-reported number) is what makes Long Haul (>120
-- min), 100 Hours, 250 Hours, and The Century Club (Time) real instead of
-- catalog-only.
--
-- Deliberately NOT attempted here (stayed catalog-only — see CLAUDE.md for
-- the full per-item reasoning): anything needing weather/location, sleep,
-- progress photos, video upload, GPS/distance, continuous heart-rate zones,
-- elevation, stairs-climbed, an "app opened" timestamp, calorie-burn
-- tracking, workout-type/muscle-group categorization (every workout is just
-- "a workout" — no Strength/Cardio/Mobility/Core tagging exists on an
-- exercise instance), a coach-set "target"/goal/check-in/feedback as a
-- trackable event, PR tracking (same reasoning as the first pass — weight
-- is coach-assigned and display-only for the trainee, so a weight-based PR
-- would reward the coach's decision, not the trainee's own effort), or
-- matching specific named lifts like "Squat"/"Bench Press"/"Deadlift" (
-- exercise names are free text typed by the coach — no canonical identity
-- to match against reliably).
--
-- Calendar/time-of-day achievements split into two tiers of honesty:
--   - A SINGLE completion's own local date/hour (First One on Jan 1, Last
--     One on Dec 31, New Month New Goals, Unstoppable, Midday Crusher,
--     Procrastinator's Victory) uses the same already-established pattern
--     as Early Bird/Night Owl: a client-reported LOCAL fact about THIS
--     completion only (now `p_completed_date_local` alongside the existing
--     `p_completed_hour_local`), never persisted, never used to re-judge a
--     past session.
--   - Anything that aggregates ACROSS multiple past sessions (Seasonal
--     Charger, Weekend Warrior Plus, Midweek Grind, Whole Year Round,
--     Holiday Hustle, Early Riser Streak) has no local-time history to read
--     — only this app's one real persisted timestamp, workout_sessions'
--     own server `completed_at` (UTC), is available after the fact. These
--     use that directly. This can occasionally disagree with a trainee's
--     own calendar near a day boundary depending on timezone — the same
--     category of approximation this codebase already accepted for
--     Early Bird/Night Owl's server-side half (see secure_gamification.sql's
--     header, point 2) — not a new honesty compromise, just the same one
--     applied to more cards.
-- ============================================================================

-- ── 1. Persist real session duration ───────────────────────────────────────
alter table public.workout_sessions add column if not exists duration_minutes integer;

-- ── 2. Extract the active-days computation out of _compute_streak so the
--      new gap-detection achievements (Never Miss Twice, The Comeback Kid)
--      can reuse the exact same "which calendar days were active" query
--      instead of duplicating it. ──
create or replace function public._active_days(p_trainee_id uuid)
returns date[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days date[];
begin
  select array_agg(distinct d order by d) into v_days from (
    select (completed_at at time zone 'utc')::date as d
    from public.workout_sessions where trainee_id = p_trainee_id
    union
    select log_date::date from public.meal_completions where trainee_id = p_trainee_id
    union
    select logged_at::date from public.food_log_entries where trainee_id = p_trainee_id
  ) t;
  return v_days;
end;
$$;

revoke all on function public._active_days(uuid) from public;

create or replace function public._compute_streak(p_trainee_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days date[] := public._active_days(p_trainee_id);
  v_count int := 0;
  v_cursor date := (now() at time zone 'utc')::date;
begin
  if v_days is null then return 0; end if;

  while v_cursor = any(v_days) loop
    v_count := v_count + 1;
    v_cursor := v_cursor - 1;
  end loop;

  return case when v_count >= 2 then v_count else 0 end;
end;
$$;

revoke all on function public._compute_streak(uuid) from public;

-- ── 3. Medal evaluation — full replacement, old checks + the new ones.
--      New trailing params (all default null, so the existing call from
--      evaluate_and_award_medals() with just 2 args keeps working): a local
--      calendar date for THIS completion, and the workout id + details jsonb
--      so the lift-weight/volume/bodyweight checks can read the session that
--      was just logged without a second round trip.
--
--      DROP first, same reason secure_gamification.sql's own header
--      explains for its complete_workout_session change: Postgres resolves
--      CREATE OR REPLACE by (name, exact IN-parameter type list) — adding a
--      new trailing parameter, even with a default, is a DIFFERENT
--      signature, so OR REPLACE alone would leave the old 2-arg overload
--      callable side by side with this one instead of actually replacing
--      it. ──
drop function if exists public._evaluate_and_award_medals(uuid, int);

create or replace function public._evaluate_and_award_medals(
  p_trainee_id uuid,
  p_completed_hour_local int default null,
  p_completed_date_local date default null,
  p_workout_id uuid default null,
  p_details jsonb default null
)
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

  -- Second-pass additions
  v_days date[];
  v_gap_any boolean := false;
  v_gap_14 boolean := false;
  v_latest_weight numeric;
  v_session_max_weight_kg numeric;
  v_session_volume_kg numeric;
  v_bodyweight_workout boolean := false;
  v_total_minutes numeric;
  v_max_duration numeric;
  v_steps_today numeric;
  v_steps_avg_prior numeric;
  v_step_up boolean := false;
  v_water_target numeric;
  v_hydration_hero boolean := false;
  v_weekend_plus boolean := false;
  v_midweek_grind boolean := false;
  v_whole_year_round boolean := false;
  v_seasonal_charger boolean := false;
  v_holiday_hustle boolean := false;
  v_early_riser boolean := false;
  v_prompt_student boolean := false;
  v_is_friday boolean := false;
  v_is_jan1 boolean := false;
  v_is_dec31 boolean := false;
  v_is_month_start boolean := false;
  v_is_last_hour boolean := false;
  v_after_8pm boolean := false;
  i int;
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
  v_is_morning := p_completed_hour_local is not null and p_completed_hour_local >= 0 and p_completed_hour_local < 7;
  v_is_evening := p_completed_hour_local is not null and p_completed_hour_local >= 22;

  -- ── Active-day gap detection (Never Miss Twice / The Comeback Kid) ──
  v_days := public._active_days(p_trainee_id);
  if v_days is not null and array_length(v_days, 1) >= 2 then
    for i in 1 .. array_length(v_days, 1) - 1 loop
      if v_days[i+1] - v_days[i] > 1 then
        v_gap_any := true;
      end if;
      if v_days[i+1] - v_days[i] >= 14 then
        v_gap_14 := true;
      end if;
    end loop;
  end if;

  -- ── Lift weight / volume / bodyweight, from the session just logged ──
  select metric_value into v_latest_weight from public.vitals
    where trainee_id = p_trainee_id and metric_name = 'weight'
    order by created_date desc limit 1;

  if p_details is not null then
    select
      max(nullif(regexp_replace(st->>'weight', '[^0-9.]', '', 'g'), '')::numeric),
      sum(
        nullif(regexp_replace(st->>'weight', '[^0-9.]', '', 'g'), '')::numeric
        * nullif(regexp_replace(st->>'reps', '[^0-9.]', '', 'g'), '')::numeric
      )
    into v_session_max_weight_kg, v_session_volume_kg
    from jsonb_array_elements(p_details) ex,
         jsonb_array_elements(ex->'sets') st
    where st->>'effort' is not null and st->>'effort' <> 'null';
  end if;

  if p_workout_id is not null and p_details is not null and jsonb_array_length(p_details) > 0 then
    v_bodyweight_workout := exists (select 1 from public.exercises where workout_id = p_workout_id)
      and not exists (
        select 1 from public.exercises
        where workout_id = p_workout_id and weight is not null and weight <> ''
      );
  end if;

  -- ── Cumulative training time (100/250 Hours, The Century Club (Time), Long Haul) ──
  select coalesce(sum(duration_minutes), 0), coalesce(max(duration_minutes), 0)
    into v_total_minutes, v_max_duration
    from public.workout_sessions where trainee_id = p_trainee_id;

  -- ── Step Up — today's steps vs. the average of every prior day ──
  select metric_value into v_steps_today from public.vitals
    where trainee_id = p_trainee_id and metric_name = 'steps' and created_date = (now() at time zone 'utc')::date;
  select avg(metric_value) into v_steps_avg_prior from public.vitals
    where trainee_id = p_trainee_id and metric_name = 'steps' and created_date < (now() at time zone 'utc')::date;
  v_step_up := v_steps_today is not null and v_steps_avg_prior is not null and v_steps_today > v_steps_avg_prior;

  -- ── Hydration Hero — 7 straight days hitting an active plan's water target ──
  select target_water_ml into v_water_target
    from public.nutrition_plans
    where trainee_id = p_trainee_id and active = true and target_water_ml is not null
    order by (template_id is null) desc
    limit 1;
  if v_water_target is not null then
    select count(*) = 7 into v_hydration_hero from generate_series(
      (now() at time zone 'utc')::date - 6, (now() at time zone 'utc')::date, interval '1 day'
    ) d
    where exists (
      select 1 from public.vitals
      where trainee_id = p_trainee_id and metric_name = 'water'
        and created_date = d::date and metric_value >= v_water_target
    );
  end if;

  -- ── Weekend Warrior Plus / Midweek Grind — same ISO week, specific weekdays ──
  select bool_or(has_fri and has_sat) into v_weekend_plus from (
    select bool_or(extract(dow from completed_at) = 5) has_fri,
           bool_or(extract(dow from completed_at) = 6) has_sat
    from public.workout_sessions where trainee_id = p_trainee_id
    group by date_trunc('week', completed_at)
  ) t;

  select bool_or(has_tue and has_wed and has_thu) into v_midweek_grind from (
    select bool_or(extract(dow from completed_at) = 2) has_tue,
           bool_or(extract(dow from completed_at) = 3) has_wed,
           bool_or(extract(dow from completed_at) = 4) has_thu
    from public.workout_sessions where trainee_id = p_trainee_id
    group by date_trunc('week', completed_at)
  ) t;

  -- ── Whole Year Round — logged a workout on the 1st for every one of the 12 months ──
  select count(distinct extract(month from completed_at)) >= 12 into v_whole_year_round
    from public.workout_sessions
    where trainee_id = p_trainee_id and extract(day from completed_at) = 1;

  -- ── Seasonal Charger — 20+ sessions inside one (year, season) bucket ──
  select bool_or(c >= 20) into v_seasonal_charger from (
    select count(*) c from public.workout_sessions
    where trainee_id = p_trainee_id
    group by extract(year from completed_at),
      case
        when extract(month from completed_at) in (12, 1, 2) then 'winter'
        when extract(month from completed_at) in (3, 4, 5) then 'spring'
        when extract(month from completed_at) in (6, 7, 8) then 'summer'
        else 'autumn'
      end
  ) t;

  -- ── Holiday Hustle — 5+ sessions in the last two weeks of December ──
  select count(*) >= 5 into v_holiday_hustle
    from public.workout_sessions
    where trainee_id = p_trainee_id
      and extract(month from completed_at) = 12 and extract(day from completed_at) >= 18;

  -- ── Early Riser Streak — 4+ distinct days before 7am (UTC) in one ISO week ──
  select bool_or(c >= 4) into v_early_riser from (
    select count(distinct (completed_at at time zone 'utc')::date) c
    from public.workout_sessions
    where trainee_id = p_trainee_id and extract(hour from completed_at) < 7
    group by date_trunc('week', completed_at)
  ) t;

  -- ── Prompt Student — logged within 12 hours of that workout's own assignment ──
  select exists (
    select 1 from public.workout_sessions s
    join public.workouts w on w.id = s.workout_id
    where s.trainee_id = p_trainee_id and s.completed_at - w.created_at <= interval '12 hours'
  ) into v_prompt_student;

  -- ── This-completion-only local calendar facts (client-reported, see header) ──
  if p_completed_date_local is not null then
    v_is_friday := extract(dow from p_completed_date_local) = 5;
    v_is_jan1 := extract(month from p_completed_date_local) = 1 and extract(day from p_completed_date_local) = 1;
    v_is_dec31 := extract(month from p_completed_date_local) = 12 and extract(day from p_completed_date_local) = 31;
    v_is_month_start := extract(day from p_completed_date_local) = 1;
  end if;
  v_is_last_hour := p_completed_hour_local is not null and p_completed_hour_local >= 23;
  v_after_8pm := p_completed_hour_local is not null and p_completed_hour_local >= 20;

  for rec in
    select medal_id, qualifies from (values
      ('1', v_session_count >= 1), ('23', v_session_count >= 1), ('28', v_session_count >= 1),
      ('34', v_session_count >= 1), ('42', v_session_count >= 1), ('91', v_session_count >= 1),
      ('6', v_is_morning), ('8', v_is_evening),
      ('9', v_profile_complete), ('7', true),
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
      ('22', v_active_days >= 100),
      ('33', v_gap_any), ('62', v_step_up), ('83', v_weight_count >= 30),
      ('98', v_total_minutes >= 6000), ('99', v_total_minutes >= 15000),
      ('59', v_max_duration > 120),
      ('104', v_latest_weight is not null and v_latest_weight > 0
        and v_session_max_weight_kg is not null and v_session_max_weight_kg >= 2 * v_latest_weight),
      ('105', v_session_max_weight_kg is not null and v_session_max_weight_kg > 100),
      ('111', v_session_volume_kg is not null and v_session_volume_kg >= 10000),
      ('131', v_bodyweight_workout),
      ('108', v_gap_14 and v_profile.streak >= 7),
      ('115', v_hydration_hero),
      ('122', v_weekend_plus), ('123', v_midweek_grind),
      ('125', v_whole_year_round), ('126', v_seasonal_charger), ('127', v_holiday_hustle),
      ('141', v_early_riser), ('136', v_prompt_student),
      ('117', v_is_friday and v_after_8pm),
      ('118', v_total_minutes >= 6000),
      ('119', p_completed_hour_local is not null and p_completed_hour_local in (11, 12, 13)),
      ('124', v_is_month_start),
      ('128', v_is_jan1), ('129', v_is_dec31),
      ('148', v_is_last_hour)
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

revoke all on function public._evaluate_and_award_medals(uuid, int, date, uuid, jsonb) from public;

-- ── 4. Workout completion — same body as secure_gamification.sql's version,
--      plus: persists duration_minutes, accepts the new local-date param,
--      and forwards workout id + details into the evaluator above so it can
--      read the session that was just logged. Dropped first for the exact
--      same reason as step 3 above — this appends a 5th parameter. ──
drop function if exists public.complete_workout_session(uuid, jsonb, int, int);

create or replace function public.complete_workout_session(
  p_workout_id uuid,
  p_details jsonb,
  p_completion_pct int,
  p_completed_hour_local int default null,
  p_completed_date_local date default null
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

  insert into public.workout_sessions (trainee_id, workout_id, completion_pct, xp_awarded, details, duration_minutes)
  values (v_uid, p_workout_id, greatest(0, least(100, coalesce(p_completion_pct, 0))), v_workout_xp, p_details, round(greatest(v_elapsed_minutes, 0)));

  delete from public.workout_session_starts where trainee_id = v_uid and workout_id = p_workout_id;

  v_new_streak := public._compute_streak(v_uid);
  update public.users set streak = v_new_streak where id = v_uid;

  v_medal_result := public._evaluate_and_award_medals(v_uid, p_completed_hour_local, p_completed_date_local, p_workout_id, p_details);
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

revoke all on function public.complete_workout_session(uuid, jsonb, int, int, date) from public;
grant execute on function public.complete_workout_session(uuid, jsonb, int, int, date) to authenticated;
grant execute on function public.evaluate_and_award_medals() to authenticated;
grant execute on function public.recalculate_streak() to authenticated;

-- ── 5. XP rewards for every newly-automated id (upsert — idempotent) ───────
insert into public.medal_xp_rewards (medal_id, xp_reward) values
  ('33', 15), ('62', 15), ('83', 30), ('98', 50), ('99', 50), ('7', 10), ('59', 20),
  ('104', 50), ('105', 30), ('111', 50), ('131', 15), ('108', 20),
  ('115', 20), ('122', 20), ('123', 20), ('125', 50), ('126', 30),
  ('127', 20), ('141', 20), ('136', 10), ('117', 10), ('118', 50),
  ('119', 10), ('124', 10), ('128', 10), ('129', 10), ('148', 10)
on conflict (medal_id) do update set xp_reward = excluded.xp_reward;
