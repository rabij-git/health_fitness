-- Tracks when a coach last edited an already-assigned workout's exercises —
-- separate from `created_at` (when it was first assigned). Combined with
-- `duration_weeks` via getProgramWeekProgress() (src/lib/workoutDuration.ts),
-- this lets the coach see "Modified in Week 2" on an 8-week program instead
-- of only ever seeing the original assignment date. Null = never edited
-- since assignment (don't show a "modified" badge at all in that case).
alter table public.workouts
  add column if not exists exercises_updated_at timestamptz null;
