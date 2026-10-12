import { ExerciseSetTarget } from '../lib/supabase';

export type UserRole = 'admin' | 'coach' | 'trainer';

export interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: string;
  weight?: string;
  time?: string;
  restSeconds?: number; // rest period between sets, in seconds; 0/undefined = no rest timer
  completed: boolean;
  // Optional per-set breakdown — when present, each set has its own target
  // reps/weight/time/rest instead of sharing the exercise-level values
  // above uniformly. See scripts/exercises_set_details.sql.
  setDetails?: ExerciseSetTarget[] | null;
}

export interface Workout {
  id: string;
  name: string;
  description: string;
  exercises: Exercise[];
  duration: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
}

// Medal catalog — static definitions (name/description/icon/rarity/xp) for
// every medal that can be earned. Real per-user earned status comes from the
// user_medals table and is merged in at render time (see GamificationScreen).
export interface Medal {
  id: string;
  name: string;
  description: string;
  icon: string;
  earned: boolean;
  rarity: 'common' | 'rare' | 'ultra_rare';
  xpReward: number;
}

export interface ExerciseWeightLog {
  exerciseId: string;
  exerciseName: string;
  entries: { date: string; weight: string; reps: string; sets: number }[];
}

// ── Leveling system ──────────────────────────────────────────────────────────
// Per the "Gamification & Leveling System" spec: 10 named levels (Rookie
// Mover → Apex Legend), each requiring a specific hand-tuned amount of
// cumulative XP. LEVEL_TABLE_CUMULATIVE below is NOT derived from the spec's
// own stated formula ("Total XP Required = 20 * (Level-1)^1.5") — that
// formula doesn't actually reproduce the spec's own table past Level 3 (e.g.
// it gives 540 for Level 10, not the table's 1,576). The table's own
// per-level increments ARE internally consistent (they sum to its own
// cumulative totals exactly), so they're hardcoded here as the source of
// truth for Levels 1-10; the formula is used only to extend leveling past
// Level 10, where the table has no data (per explicit direction: "use the
// literal formula from Level 11 on", accepting that it's a gentler curve
// than Levels 1-10 were).
export const LEVEL_TITLES: string[] = [
  'Rookie Mover',
  'Stride Starter',
  'Pace Setter',
  'Rhythm Runner',
  'Endurance Cadet',
  'Fitness Crusader',
  'Iron Athlete',
  'Peak Performer',
  'Vanguard',
  'Apex Legend',
];

// Cumulative XP required to REACH each level — index 0 is Level 1 (0 XP).
const LEVEL_TABLE_CUMULATIVE = [0, 20, 56, 124, 228, 376, 576, 836, 1166, 1576];

// Cumulative XP required to reach `level`. For level > 10 (past the named
// table), continues using the spec's own formula for each additional
// level's *increment*, anchored onto Level 10's real total (1,576) rather
// than restarting from the formula's own much-lower absolute value — using
// the raw absolute formula here would mean Level 11 requires LESS total XP
// than Level 10 (the formula alone gives ~632 for "Level 11", well under
// 1,576), which would let a trainee jump ~9 levels in a single instant the
// moment they cross 1,576 XP. Telescopes to a closed form:
// 1576 + [20*(level-1)^1.5 - 20*9^1.5].
export function cumulativeXpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level <= LEVEL_TABLE_CUMULATIVE.length) return LEVEL_TABLE_CUMULATIVE[level - 1];
  const anchor = LEVEL_TABLE_CUMULATIVE[LEVEL_TABLE_CUMULATIVE.length - 1];
  const anchorLevel = LEVEL_TABLE_CUMULATIVE.length; // 10
  return Math.round(anchor + 20 * Math.pow(level - 1, 1.5) - 20 * Math.pow(anchorLevel - 1, 1.5));
}

export function computeLevelFromXp(xp: number): number {
  let level = 1;
  while (cumulativeXpForLevel(level + 1) <= xp) level++;
  return level;
}

// XP needed to go from `level` to `level + 1` — used as the XP bar's
// denominator on Profile/Home/Gamification screens.
export function getXpForNextLevel(level: number): number {
  return cumulativeXpForLevel(level + 1) - cumulativeXpForLevel(level);
}

// Progress within the current level (numerator for the same XP bar) —
// callers already know their own `level` (from users.level), so this
// re-derives it from `xp` independently; the two are kept in sync by every
// XP-writing call site always updating `level` alongside `xp`.
export function getCurrentLevelXp(xp: number): number {
  return xp - cumulativeXpForLevel(computeLevelFromXp(xp));
}

// Display name for a level — the 10 hand-named titles, or a generic
// "Level N" beyond that (the spec's table only defines names through
// Level 10 / Apex Legend).
export function getLevelTitle(level: number): string {
  if (level >= 1 && level <= LEVEL_TITLES.length) return LEVEL_TITLES[level - 1];
  return `Level ${level}`;
}

// ── Achievement catalog (THIRD pass — full replacement) ─────────────────────
// Per explicit instruction: the entire previous catalog (everything from the
// first 103-item pass and the second 45-item pass) is gone. This is now the
// ONLY achievement list in the app — exactly the 117 items (ids 2-118) from
// the user-provided list, with exactly the XP values given there. Nothing
// added, nothing carried over, including "Coach Connected" (not in this
// list at all — see CLAUDE.md's Medals section for what that means for
// `acceptCoachRequest` in db.ts, which used to award it).
//
// Ids are the list's own numbers (as strings), not renumbered — there's no
// item "1" in the source list (it starts at 2), and this catalog doesn't
// invent one. Rarity is inferred from the given XP (not specified in the
// source list) on a simple band: 5-10 XP = common, 15-20 XP = rare, 25+ XP
// = ultra_rare.
//
// Same split as every prior pass: achievements with a real, directly-
// computed trigger (see scripts/achievements_v3_replace.sql) vs. catalog-
// only ones needing a feature this app doesn't have — see CLAUDE.md for the
// full per-item reasoning. 55 of the 117 are automated; the other 62 are
// visible but honestly not-yet-earned, same "no fake progress" rule as
// every prior pass.
export const mockMedals: Medal[] = [
  // ── Automated (55) ──
  {
    id: '2',
    name: 'Welcome Aboard',
    description: 'Complete your first coached workout',
    icon: 'hand-left',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '3',
    name: 'New Adventures',
    description: 'Log in and complete all sign up',
    icon: 'rocket-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5, // unconditional — awarded the first time evaluateAndAwardMedals ever runs for this account
  },
  {
    id: '6',
    name: 'Early Bird',
    description: 'Complete a workout before 7 AM',
    icon: 'sunny',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '7',
    name: 'Night Owl',
    description: 'Complete a workout after 10 PM',
    icon: 'moon',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '8',
    name: '3-Day Streak',
    description: 'Train for 3 consecutive days',
    icon: 'flame-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '9',
    name: '7-Day Streak',
    description: 'Stay active for 7 consecutive days',
    icon: 'flame',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '10',
    name: '14-Day Streak',
    description: 'Stay active for 14 consecutive days',
    icon: 'flame',
    earned: false,
    rarity: 'rare',
    xpReward: 15,
  },
  {
    id: '11',
    name: '21-Day Streak',
    description: 'Stay active for 21 consecutive days',
    icon: 'flame',
    earned: false,
    rarity: 'rare',
    xpReward: 15,
  },
  {
    id: '12',
    name: '30-Day Streak',
    description: 'Stay active for 30 consecutive days',
    icon: 'trophy',
    earned: false,
    rarity: 'rare',
    xpReward: 20,
  },
  {
    id: '13',
    name: 'Consistency King',
    description: 'Complete 10 planned workouts',
    icon: 'flame',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '14',
    name: 'Consistency Pro',
    description: 'Complete 25 planned workouts',
    icon: 'flame',
    earned: false,
    rarity: 'rare',
    xpReward: 15,
  },
  {
    id: '15',
    name: 'Halfway There',
    description: 'Complete 50 planned workouts',
    icon: 'trending-up',
    earned: false,
    rarity: 'rare',
    xpReward: 15,
  },
  {
    id: '16',
    name: 'Century Club',
    description: 'Complete 100 workouts',
    icon: 'trophy-outline',
    earned: false,
    rarity: 'ultra_rare',
    xpReward: 25,
  },
  {
    id: '17',
    name: 'Never Miss Twice',
    description: 'Return to training after missing a planned session',
    icon: 'refresh',
    earned: false,
    rarity: 'rare',
    xpReward: 15,
  },
  {
    id: '18',
    name: 'Plan Follower',
    description: 'Complete 5 scheduled workouts',
    icon: 'checkmark-done',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '21',
    name: 'First Rep',
    description: 'Complete your first strength workouts',
    icon: 'barbell-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5, // same trigger as '2' Welcome Aboard — every workout here is strength-based
  },
  {
    id: '22',
    name: 'Strength Builder',
    description: 'Complete 10 strength workouts',
    icon: 'barbell',
    earned: false,
    rarity: 'common',
    xpReward: 5, // same trigger as '13' Consistency King
  },
  {
    id: '23',
    name: 'Strength Machine',
    description: 'Complete 25 strength workouts',
    icon: 'barbell',
    earned: false,
    rarity: 'common',
    xpReward: 10, // same trigger as '14' Consistency Pro
  },
  {
    id: '24',
    name: 'Another You',
    description: 'Lift twice your body weight on a single set',
    icon: 'body',
    earned: false,
    rarity: 'rare',
    xpReward: 15,
  },
  {
    id: '25',
    name: 'Triple Digits',
    description: 'Lift a weight above 100kg',
    icon: 'barbell',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '31',
    name: '10K Steps',
    description: 'Reach 10,000 steps in one day',
    icon: 'walk',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '36',
    name: 'Long Haul',
    description: 'Complete a workout above 120 minutes',
    icon: 'hourglass-outline',
    earned: false,
    rarity: 'rare',
    xpReward: 15,
  },
  {
    id: '39',
    name: 'Step Up',
    description: 'Beat your daily step average',
    icon: 'walk',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '45',
    name: 'Daily Doer',
    description: 'Log activity for 10 different days',
    icon: 'calendar-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '46',
    name: 'Always Moving',
    description: 'Accumulate 100 active days',
    icon: 'infinite',
    earned: false,
    rarity: 'rare',
    xpReward: 20,
  },
  {
    id: '55',
    name: 'Progress Logged',
    description: 'Record your first progress measurement',
    icon: 'scale',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '56',
    name: 'Progress Check',
    description: 'Complete your first progress check-in',
    icon: 'clipboard-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5, // same trigger as '55' Progress Logged
  },
  {
    id: '58',
    name: 'Data Driven',
    description: 'Log 10 workouts with complete data',
    icon: 'stats-chart-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '59',
    name: 'Tracking Pro',
    description: 'Log 25 workouts with complete data',
    icon: 'stats-chart',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '60',
    name: 'Progress Month',
    description: 'Track your progress for 30 days',
    icon: 'calendar',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '61',
    name: 'Data Devotee',
    description: 'Log 50 workouts',
    icon: 'server-outline',
    earned: false,
    rarity: 'rare',
    xpReward: 15,
  },
  {
    id: '66',
    name: '10 Workouts Strong',
    description: 'Complete 10 total workouts',
    icon: 'barbell',
    earned: false,
    rarity: 'common',
    xpReward: 5, // same trigger as '13' Consistency King
  },
  {
    id: '67',
    name: '25 Workouts Strong',
    description: 'Complete 25 total workouts',
    icon: 'barbell',
    earned: false,
    rarity: 'common',
    xpReward: 5, // same trigger as '14' Consistency Pro
  },
  {
    id: '68',
    name: '50 Workouts Strong',
    description: 'Complete 50 total workouts',
    icon: 'barbell',
    earned: false,
    rarity: 'common',
    xpReward: 10, // same trigger as '15' Halfway There
  },
  {
    id: '69',
    name: '100 Workouts Strong',
    description: 'Complete 100 total workouts',
    icon: 'trophy',
    earned: false,
    rarity: 'ultra_rare',
    xpReward: 25, // same trigger as '16' Century Club
  },
  {
    id: '70',
    name: '100 Hours',
    description: 'Accumulate 100 hours of training',
    icon: 'time',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '71',
    name: '250 Hours',
    description: 'Accumulate 250 hours of training',
    icon: 'time',
    earned: false,
    rarity: 'rare',
    xpReward: 20,
  },
  {
    id: '78',
    name: 'The Comeback Kid',
    description: 'Return and complete a full week of training after a gap of 14+ days',
    icon: 'refresh-circle',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '81',
    name: 'Volume Master',
    description: 'Lift a total cumulative volume of 10,000kg in a single workout session',
    icon: 'layers',
    earned: false,
    rarity: 'rare',
    xpReward: 20,
  },
  {
    id: '85',
    name: 'Hydration Hero',
    description: 'Hit your daily hydration target 7 days in a row',
    icon: 'water',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '87',
    name: 'Unstoppable',
    description: 'Log a workout on a Friday night (after 8:00 PM)',
    icon: 'flash',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '88',
    name: 'The Century Club (Time)',
    description: 'Reach 100 total hours logged across all exercise types',
    icon: 'time',
    earned: false,
    rarity: 'common',
    xpReward: 5, // same trigger as '70' 100 Hours — the source list gives these two different XP for the same threshold, kept as specified
  },
  {
    id: '89',
    name: 'Midday Crusher',
    description: 'Complete a full workout during lunch hours (11:30 AM – 1:30 PM)',
    icon: 'sunny',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '92',
    name: 'Weekend Warrior Plus',
    description: 'Complete workouts on both Friday and Saturday in the same weekend',
    icon: 'calendar',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '93',
    name: 'Midweek Grind',
    description: 'Complete workouts on Tuesday, Wednesday, and Thursday uninterrupted',
    icon: 'calendar',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '94',
    name: 'New Month, New Goals',
    description: 'Log a workout on the 1st day of the calendar month',
    icon: 'calendar-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '95',
    name: 'Whole Year Round',
    description: 'Log a workout on the 1st day of all 12 calendar months',
    icon: 'planet',
    earned: false,
    rarity: 'rare',
    xpReward: 15,
  },
  {
    id: '96',
    name: 'Seasonal Charger',
    description: 'Complete at least 40 workouts during a single season (Spring, Summer, Autumn, Winter)',
    icon: 'leaf',
    earned: false,
    rarity: 'rare',
    xpReward: 15,
  },
  {
    id: '97',
    name: 'Holiday Hustle',
    description: 'Log 5 workouts during the last two weeks of December',
    icon: 'gift',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '98',
    name: 'First One',
    description: 'Log a workout on the 1st of January',
    icon: 'sparkles',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '99',
    name: 'Last One',
    description: 'Log a workout on the 31st of December',
    icon: 'sparkles-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '101',
    name: 'Bodyweight Boss',
    description: 'Complete a workout consisting entirely of bodyweight exercises',
    icon: 'man',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '106',
    name: 'Prompt Student',
    description: 'Log a workout within 12 hours of your coach assigning it',
    icon: 'alarm',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '111',
    name: 'Early Riser Streak',
    description: 'Complete 4 workouts before 7:00 AM in a single week',
    icon: 'sunny',
    earned: false,
    rarity: 'rare',
    xpReward: 15,
  },
  {
    id: '118',
    name: "Procrastinator's Victory",
    description: 'Start and finish a scheduled workout with less than 1 hour left in the day',
    icon: 'hourglass',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },

  // ── Catalog-only — visible, but not yet auto-awarded (62) ──
  // Needs a feature this app doesn't have: fitness goals, coach check-ins/
  // feedback/challenges/coach-set targets as trackable events, weight-based
  // PRs (coach-assigned weight is display-only for the trainee — see
  // CLAUDE.md), workout-type/muscle-group categorization (every workout is
  // just "a workout"), distance/running/GPS, sleep tracking, progress
  // photos/video upload, continuous heart-rate zones, elevation, stairs,
  // weather/location, an "app opened" timestamp, calorie-burn tracking,
  // weekly/monthly schedule-adherence percentages, long-horizon tenure
  // states, or matching specific named lifts (exercise names are coach-typed
  // free text, no canonical "Squat"/"Bench Press"/"Deadlift" identity).
  // Honest "not yet earned" cards, no fabricated progress — see CLAUDE.md's
  // Medals section for the full per-item reasoning.
  {
    id: '4',
    name: 'Goal Setter',
    description: 'Set your first goal!',
    icon: 'flag-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '5',
    name: 'First Week',
    description: 'Complete your first week of training',
    icon: 'calendar',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '19',
    name: 'Perfect Month',
    description: 'Complete every scheduled workout for one month',
    icon: 'checkmark-done-circle',
    earned: false,
    rarity: 'rare',
    xpReward: 15,
  },
  {
    id: '20',
    name: 'Committed',
    description: 'Complete 12 weeks of structured training',
    icon: 'ribbon',
    earned: false,
    rarity: 'ultra_rare',
    xpReward: 25,
  },
  {
    id: '26',
    name: 'Stronger Than Before',
    description: 'Beat a previous performance',
    icon: 'trending-up',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '27',
    name: 'Personal Best',
    description: 'Set your first personal record',
    icon: 'star-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '28',
    name: 'Stronger Together',
    description: 'Beat a performance target set by your coach',
    icon: 'people-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '29',
    name: 'First Mile',
    description: 'Complete your first mile or kilometer goal',
    icon: 'footsteps-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '30',
    name: 'Cardio Starter',
    description: 'Complete your first cardio workout',
    icon: 'heart-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '32',
    name: '5K Finisher',
    description: 'Complete your first 5K',
    icon: 'ribbon-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '33',
    name: '10K Finisher',
    description: 'Complete your first 10K',
    icon: 'ribbon',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '34',
    name: 'Cardio Regular',
    description: 'Complete 20 cardio sessions',
    icon: 'heart',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '35',
    name: 'Distance Builder',
    description: 'Reach a new distance record',
    icon: 'map-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '37',
    name: 'Go The Distance',
    description: 'Beat a distance goal set by your coach',
    icon: 'map',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '38',
    name: 'Move More',
    description: 'Reach your daily activity goal',
    icon: 'walk-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '40',
    name: 'Weekend Warrior',
    description: 'Hit your activity target on a weekend',
    icon: 'calendar-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '41',
    name: '7-Day Mover',
    description: 'Reach your activity goal every day for a week',
    icon: 'walk',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '42',
    name: 'Movement Month',
    description: 'Reach your activity goal for 30 days in a row',
    icon: 'walk',
    earned: false,
    rarity: 'rare',
    xpReward: 20,
  },
  {
    id: '43',
    name: 'Walk It Out',
    description: 'Complete your first dedicated walking session',
    icon: 'footsteps',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '44',
    name: 'Active Hour',
    description: 'Reach your hourly movement target',
    icon: 'time-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '47',
    name: 'Stretch Starter',
    description: 'Complete your first mobility session',
    icon: 'body-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '48',
    name: 'Recovery Pro',
    description: 'Complete 10 recovery sessions',
    icon: 'bandage-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '49',
    name: 'Rest Day Respect',
    description: 'Complete a planned rest day',
    icon: 'bed-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '50',
    name: 'Recovery Matters',
    description: "Follow your coach's recovery recommendation",
    icon: 'medkit-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '51',
    name: 'Sleep Champion',
    description: 'Meet your sleep target',
    icon: 'moon-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '52',
    name: 'Sleep Streak',
    description: 'Meet your sleep target for 7 nights in a row',
    icon: 'moon',
    earned: false,
    rarity: 'rare',
    xpReward: 15,
  },
  {
    id: '53',
    name: 'Recovery Streak',
    description: 'Complete a full week of planned recovery',
    icon: 'bandage',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '54',
    name: 'Balance Builder',
    description: 'Complete training, recovery, and rest in the same week',
    icon: 'sync-outline',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '57',
    name: 'Photo Finish',
    description: 'Upload your first progress photo',
    icon: 'camera-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '62',
    name: 'Progress Revealed',
    description: 'Complete your first progress review with your coach',
    icon: 'eye-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '63',
    name: 'Proof of Progress',
    description: 'Beat a baseline measurement or performance benchmark',
    icon: 'checkmark-circle',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '64',
    name: 'Coach Is Challenged',
    description: 'Challenge your coach and win',
    icon: 'flash-outline',
    earned: false,
    rarity: 'rare',
    xpReward: 15,
  },
  {
    id: '65',
    name: "Coach's Milestone",
    description: 'Reach a milestone chosen by your coach',
    icon: 'flag',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '72',
    name: 'Transformation Journey',
    description: 'Complete 6 months of consistent training',
    icon: 'sparkles-outline',
    earned: false,
    rarity: 'ultra_rare',
    xpReward: 40,
  },
  {
    id: '73',
    name: 'One Year Strong',
    description: 'Stay active and engaged for one year',
    icon: 'calendar',
    earned: false,
    rarity: 'ultra_rare',
    xpReward: 50,
  },
  {
    id: '74',
    name: 'Level Up',
    description: 'Reach a major goal set at the beginning of your journey',
    icon: 'arrow-up-circle',
    earned: false,
    rarity: 'rare',
    xpReward: 15,
  },
  {
    id: '75',
    name: 'Fitness Lifestyle',
    description: 'Complete 12 months of consistent training, tracking, and coaching',
    icon: 'diamond',
    earned: false,
    rarity: 'ultra_rare',
    xpReward: 50,
  },
  {
    id: '76',
    name: 'Iron Will',
    description: 'Complete a scheduled workout on a national holiday or major personal milestone',
    icon: 'shield',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '77',
    name: 'Rain or Shine',
    description: 'Log workouts in 3 different weather conditions or locations',
    icon: 'rainy-outline',
    earned: false,
    rarity: 'rare',
    xpReward: 15,
  },
  {
    id: '79',
    name: 'Clockwork',
    description: 'Log a workout within the exact same 30-minute window 5 days in a row',
    icon: 'time',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '80',
    name: 'PR Buster',
    description: 'Break 3 personal records across any lift or distance in a single month',
    icon: 'star',
    earned: false,
    rarity: 'rare',
    xpReward: 15,
  },
  {
    id: '82',
    name: 'Pace Setter',
    description: 'Maintain your target heart rate zone for 80%+ of a cardio session',
    icon: 'heart-circle',
    earned: false,
    rarity: 'rare',
    xpReward: 15,
  },
  {
    id: '83',
    name: 'Elevation Explorer',
    description: 'Accumulate 500 meters of vertical gain across outdoor or treadmill sessions',
    icon: 'trending-up',
    earned: false,
    rarity: 'rare',
    xpReward: 15,
  },
  {
    id: '84',
    name: 'Negative Split',
    description: 'Complete the second half of a run faster than the first half',
    icon: 'speedometer',
    earned: false,
    rarity: 'rare',
    xpReward: 15,
  },
  {
    id: '86',
    name: 'Wind-Down Warrior',
    description: 'Complete an evening mobility or stretching routine within 1 hour of bedtime',
    icon: 'bed',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '90',
    name: 'Master of All Trades',
    description: 'Complete a strength session, a cardio workout, and a mobility routine all in the same week',
    icon: 'shuffle',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '91',
    name: 'Core Crusher',
    description: 'Accumulate 30 total minutes of core-focused exercises in a single week',
    icon: 'fitness',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '100',
    name: 'Heart Rate Zone Master',
    description: 'Spend at least 60 minutes in Zone 3 or Zone 4 during a single cardio session',
    icon: 'pulse',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '102',
    name: 'Barbell Scholar',
    description: 'Perform the "Big Three" (Squat, Bench Press, Deadlift) in the same week',
    icon: 'school',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '103',
    name: 'Isometric Hold',
    description: 'Accumulate 5 total minutes in plank or wall-sit holds over one week',
    icon: 'hourglass',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '104',
    name: 'Grip Strength',
    description: 'Complete a total hang time of 3 minutes across hanging exercises',
    icon: 'hand-left',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '105',
    name: 'Stress Reliever',
    description: 'Log a breathing or light mobility routine after a high-stress day',
    icon: 'leaf-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '107',
    name: 'Video Verified',
    description: 'Upload a form-check video for your coach to review',
    icon: 'videocam',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '108',
    name: 'Goal Crusher',
    description: 'Complete a custom long-term target (e.g. a 3-month weight or strength goal) set with your coach',
    icon: 'trophy',
    earned: false,
    rarity: 'rare',
    xpReward: 20,
  },
  {
    id: '109',
    name: 'Accountability Partner',
    description: "Send a high-five or supportive reaction to a fellow user's completed activity",
    icon: 'thumbs-up',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '110',
    name: 'Midnight Oil',
    description: 'Start and finish a workout that spans across midnight',
    icon: 'moon',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '112',
    name: 'Overachiever',
    description: 'Exceed your weekly workout goal by at least 2 extra sessions',
    icon: 'rocket',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '113',
    name: 'Sore Today, Strong Tomorrow',
    description: 'Log a mobility or light walk session the day after setting a personal record',
    icon: 'walk',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '114',
    name: 'Workout Outfit On',
    description: 'Log an activity within 5 minutes of opening the app',
    icon: 'shirt',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '115',
    name: 'Earned the Slice',
    description: 'Burn a target amount of calories in an intense session before a weekend meal',
    icon: 'pizza',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '116',
    name: 'Stair Mastered',
    description: 'Skip the elevator and log 20 flights of stairs in a single day',
    icon: 'layers-outline',
    earned: false,
    rarity: 'common',
    xpReward: 5,
  },
  {
    id: '117',
    name: 'Red-Eye Runner',
    description: 'Complete a run between 5:00 AM and 6:00 AM before the sun fully rises',
    icon: 'moon-outline',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
];
