-- ============================================================================
-- XP comes ONLY from the achievement list now — no other source. Per
-- explicit instruction: "there should be no flat per-workout completion
-- bonus, points are always rewarded based on the achievement list nothing
-- else." This removes every non-achievement XP grant that existed:
--   - WORKOUT_COMPLETE_XP (+10 flat, every workout finished)
--   - The duration bonus (+2 XP per full 10 minutes elapsed)
--   - DAILY_STREAK_XP (+2 XP, first completion of a calendar day)
--   - INVITE_FRIEND_XP (+2 XP to whoever sent a friend request, once
--     accepted) — not workout-related at all, but the same "not an
--     achievement" category, removed for the same reason.
--
-- RUN THIS AFTER achievements_v3_replace.sql (already applied). Only
-- replaces complete_workout_session and accept_friend_request — nothing
-- else from that file changes. Idempotent — safe to re-run.
--
-- What's explicitly KEPT, and why: `duration_minutes` is still computed
-- and persisted on every session (still real, still server-measured from
-- workout_session_starts) — it's not XP, it's the input several
-- achievements need (Long Haul >120 min, 100/250 Hours, The Century Club
-- (Time)). Streak itself (`users.streak`) is still recomputed and
-- persisted every completion too — also not XP on its own, but several
-- achievements key off of it (3/7/14/21/30-Day Streak, etc.). Only the XP
-- *grants* tied to these are gone, not the underlying data they still feed.
-- ============================================================================

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
  v_started_at timestamptz;
  v_elapsed_minutes numeric;
  v_session_id uuid;
  v_medal_result jsonb;
  v_medal_xp int;
  v_new_streak int;
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

  -- Real elapsed time, derived from the server-recorded start — not XP by
  -- itself anymore, just the input a few achievements need (Long Haul,
  -- 100/250 Hours). No start on file means no duration recorded, not a
  -- guessed default.
  select started_at into v_started_at
    from public.workout_session_starts
    where trainee_id = v_uid and workout_id = p_workout_id;
  if v_started_at is not null then
    v_elapsed_minutes := extract(epoch from (now() - v_started_at)) / 60.0;
  else
    v_elapsed_minutes := 0;
  end if;

  insert into public.workout_sessions (trainee_id, workout_id, completion_pct, xp_awarded, details, duration_minutes)
  values (v_uid, p_workout_id, greatest(0, least(100, coalesce(p_completion_pct, 0))), 0, p_details, round(greatest(v_elapsed_minutes, 0)))
  returning id into v_session_id;

  delete from public.workout_session_starts where trainee_id = v_uid and workout_id = p_workout_id;

  v_new_streak := public._compute_streak(v_uid);
  update public.users set streak = v_new_streak where id = v_uid;

  v_medal_result := public._evaluate_and_award_medals(v_uid, p_completed_hour_local, p_completed_date_local, p_workout_id, p_details);
  v_medal_xp := coalesce((v_medal_result->>'xp_awarded')::int, 0);

  -- Record what this specific completion actually earned — purely for the
  -- row's own historical record now (nothing in the app reads this column
  -- back), rather than leaving it permanently 0.
  update public.workout_sessions set xp_awarded = v_medal_xp where id = v_session_id;

  select xp, level into v_new_xp, v_new_level from public.users where id = v_uid;

  return jsonb_build_object(
    'xp_awarded', v_medal_xp,
    'new_xp', v_new_xp,
    'new_level', v_new_level,
    'new_streak', v_new_streak,
    'newly_earned_medal_ids', v_medal_result->'newly_earned'
  );
end;
$$;

revoke all on function public.complete_workout_session(uuid, jsonb, int, int, date) from public;
grant execute on function public.complete_workout_session(uuid, jsonb, int, int, date) to authenticated;

-- ── Friend-request acceptance — no XP grant anymore, just the status flip ──
create or replace function public.accept_friend_request(p_requester_id uuid)
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

  update public.friendships
    set status = 'accepted'
    where user_id = p_requester_id and friend_id = v_uid and status = 'pending';

  if not found then
    raise exception 'No pending friend request from that user';
  end if;
end;
$$;

revoke all on function public.accept_friend_request(uuid) from public;
grant execute on function public.accept_friend_request(uuid) to authenticated;
