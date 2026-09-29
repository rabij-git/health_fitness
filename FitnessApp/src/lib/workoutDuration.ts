// A workout's optional `duration_weeks` isn't just informational — it's the
// program's end date. `created_at` (when it was assigned) + duration_weeks
// is the last day it's usable; past that, a coach can't edit it and a
// trainee can't do it anymore (they'd need a coach to reassign/extend it).
// Compared as calendar dates (not raw timestamps) so a program assigned at
// 11pm still gets its full last day, matching this app's existing
// device-local-midnight convention for "once per day" workout completion.

interface DurationBoundWorkout {
  created_at: string;
  duration_weeks: number | null;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Exclusive cutoff — the workout is usable through the day before this.
function getExpiryCutoff(workout: DurationBoundWorkout): Date | null {
  if (workout.duration_weeks == null) return null;
  const cutoff = startOfDay(new Date(workout.created_at));
  cutoff.setDate(cutoff.getDate() + workout.duration_weeks * 7);
  return cutoff;
}

export function isWorkoutDurationExpired(workout: DurationBoundWorkout, now: Date = new Date()): boolean {
  const cutoff = getExpiryCutoff(workout);
  return cutoff != null && startOfDay(now).getTime() >= cutoff.getTime();
}

// The last day the program is actually usable (inclusive) — for display,
// e.g. "Ends Mar 14" / "Ended Mar 14".
export function getWorkoutEndDate(workout: DurationBoundWorkout): Date | null {
  const cutoff = getExpiryCutoff(workout);
  if (cutoff == null) return null;
  const end = new Date(cutoff);
  end.setDate(end.getDate() - 1);
  return end;
}

export function formatWorkoutEndDate(workout: DurationBoundWorkout): string | null {
  const end = getWorkoutEndDate(workout);
  return end ? end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
}

// Which week of the program a given moment falls in — week 1 the day it was
// assigned, incrementing every 7 days, clamped to `duration_weeks` (a
// session logged after the program's own end date still reads as the last
// week, not an out-of-range number). `atDate` defaults to now (for the
// trainee's live "Week X/Y" badge) but is passed explicitly as a session's
// own `completed_at` for the coach's History list, so a past session shows
// the week it was actually done in, not whatever week it is today.
export function getProgramWeekProgress(workout: DurationBoundWorkout, atDate: Date = new Date()): { current: number; total: number } | null {
  if (workout.duration_weeks == null) return null;
  const start = startOfDay(new Date(workout.created_at));
  const at = startOfDay(atDate);
  const diffDays = Math.floor((at.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  const current = Math.min(workout.duration_weeks, Math.max(1, Math.floor(diffDays / 7) + 1));
  return { current, total: workout.duration_weeks };
}
