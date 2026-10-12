-- ============================================================================
-- Third achievement pass — FULL REPLACEMENT of the catalog, not another
-- addition. Per explicit instruction: "remove all achievements and only use
-- these ones" — the entire previous catalog (the first 103-item pass and
-- the second 45-item pass) is gone, replaced with exactly the 117-item list
-- (ids 2-118) now in mockData.ts's mockMedals, using exactly the XP values
-- given there. This file is the server-side half of that: it REPLACES
-- _evaluate_and_award_medals' body outright (not appends to it) and
-- rebuilds medal_xp_rewards from scratch.
--
-- RUN THIS AFTER secure_gamification.sql AND achievements_expansion.sql
-- (both already applied — this only replaces what they created, it doesn't
-- redo the schema/column work: workout_sessions.duration_minutes,
-- _active_days(), _compute_streak(), complete_workout_session's signature
-- are all untouched and reused as-is). Idempotent — safe to re-run.
--
-- *** DESTRUCTIVE STEP, READ BEFORE RUNNING ***
-- Step 1 below WIPES every row in public.user_medals. This is deliberate,
-- not accidental: medal ids were NOT simply appended this time, several
-- were reused for a DIFFERENT achievement than before (e.g. the old catalog's
-- id '10' meant "Coach Connected" — that achievement doesn't exist in the
-- new list at all, and the new list's id '10' means "14-Day Streak"
-- instead). Leaving old user_medals rows in place would make trainees
-- appear to have earned achievements they never actually did under the new
-- catalog's meaning for that id. A trainee's xp/level/streak are NOT
-- touched — only the user_medals rows (the individual earned-badge
-- records) are cleared; nobody's total XP or level changes, and every
-- medal re-evaluates itself fresh the next time a trainee completes a
-- workout or saves their profile, so legitimately-still-true achievements
-- (e.g. an active streak) reappear immediately.
--
-- "Coach Connected" is also fully retired client-side — db.ts's
-- acceptCoachRequest no longer calls claim_coach_connected_medal at all.
-- That function is left in place in the database (harmless, unused) rather
-- than dropped, to keep this migration additive/low-risk rather than
-- requiring a DROP FUNCTION this environment can't verify is safe.
--
-- Of the 117 items, 55 have a real computed trigger below; the other 62
-- are catalog-only (visible, never auto-awarded) for the same reasons as
-- every prior pass — see CLAUDE.md's Medals section for the full per-item
-- breakdown of which is which and why.
-- ============================================================================

-- ── 1. Wipe existing earned-medal records — see the big comment above ──────
delete from public.user_medals;

-- ── 2. Rebuild medal_xp_rewards from scratch for the new catalog ──────────
delete from public.medal_xp_rewards;

insert into public.medal_xp_rewards (medal_id, xp_reward) values
  ('2', 5), ('3', 5), ('6', 10), ('7', 10), ('8', 5), ('9', 10), ('10', 15),
  ('11', 15), ('12', 20), ('13', 10), ('14', 15), ('15', 15), ('16', 25),
  ('17', 15), ('18', 5), ('21', 5), ('22', 5), ('23', 10), ('24', 15),
  ('25', 10), ('31', 5), ('36', 15), ('39', 5), ('45', 5), ('46', 20),
  ('55', 5), ('56', 5), ('58', 5), ('59', 10), ('60', 10), ('61', 15),
  ('66', 5), ('67', 5), ('68', 10), ('69', 25), ('70', 10), ('71', 20),
  ('78', 10), ('81', 20), ('85', 5), ('87', 5), ('88', 5), ('89', 5),
  ('92', 5), ('93', 5), ('94', 5), ('95', 15), ('96', 15), ('97', 10),
  ('98', 5), ('99', 5), ('101', 5), ('106', 10), ('111', 15), ('118', 10);

-- ── 3. Medal evaluation — full body replacement, same signature as
--      achievements_expansion.sql's version (p_trainee_id, p_completed_
--      hour_local, p_completed_date_local, p_workout_id, p_details), so a
--      plain CREATE OR REPLACE is enough — no DROP needed, nothing about
--      the parameter list is changing here, only the VALUES list inside
--      the body. Every computed variable below is reused almost verbatim
--      from the second pass; only the id→condition mapping changed, plus
--      Seasonal Charger's threshold (20 → 40, per the new list's own
--      wording: "at least 40 workouts"). ──
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
  v_is_morning boolean;
  v_is_evening boolean;
  v_newly_earned text[] := '{}';
  v_xp_awarded int := 0;
  v_reward int;
  rec record;

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

  -- ── Seasonal Charger — 40+ sessions inside one (year, season) bucket ──
  select bool_or(c >= 40) into v_seasonal_charger from (
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

  -- ── This-completion-only local calendar facts (client-reported) ──
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
      ('2', v_session_count >= 1), ('21', v_session_count >= 1),
      ('3', true),
      ('6', v_is_morning), ('7', v_is_evening),
      ('8', v_profile.streak >= 3), ('9', v_profile.streak >= 7),
      ('10', v_profile.streak >= 14), ('11', v_profile.streak >= 21), ('12', v_profile.streak >= 30),
      ('13', v_session_count >= 10), ('22', v_session_count >= 10), ('66', v_session_count >= 10),
      ('14', v_session_count >= 25), ('23', v_session_count >= 25), ('67', v_session_count >= 25),
      ('15', v_session_count >= 50), ('68', v_session_count >= 50),
      ('16', v_session_count >= 100), ('69', v_session_count >= 100),
      ('17', v_gap_any),
      ('18', v_session_count >= 5),
      ('24', v_latest_weight is not null and v_latest_weight > 0
        and v_session_max_weight_kg is not null and v_session_max_weight_kg >= 2 * v_latest_weight),
      ('25', v_session_max_weight_kg is not null and v_session_max_weight_kg > 100),
      ('31', v_max_steps >= 10000),
      ('36', v_max_duration > 120),
      ('39', v_step_up),
      ('45', v_active_days >= 10),
      ('46', v_active_days >= 100),
      ('55', v_weight_count >= 1), ('56', v_weight_count >= 1),
      ('58', v_session_count >= 10), ('59', v_session_count >= 25),
      ('60', v_weight_count >= 30),
      ('61', v_session_count >= 50),
      ('70', v_total_minutes >= 6000), ('88', v_total_minutes >= 6000),
      ('71', v_total_minutes >= 15000),
      ('78', v_gap_14 and v_profile.streak >= 7),
      ('81', v_session_volume_kg is not null and v_session_volume_kg >= 10000),
      ('85', v_hydration_hero),
      ('87', v_is_friday and v_after_8pm),
      ('89', p_completed_hour_local is not null and p_completed_hour_local in (11, 12, 13)),
      ('92', v_weekend_plus), ('93', v_midweek_grind),
      ('94', v_is_month_start),
      ('95', v_whole_year_round),
      ('96', v_seasonal_charger),
      ('97', v_holiday_hustle),
      ('98', v_is_jan1), ('99', v_is_dec31),
      ('101', v_bodyweight_workout),
      ('106', v_prompt_student),
      ('111', v_early_riser),
      ('118', v_is_last_hour)
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
