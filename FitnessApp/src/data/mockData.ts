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

// Achievement catalog — the "buildable now" subset of the full 90-item
// "Achievements & XP Values" spec, i.e. the ones whose trigger condition can
// be computed from data the app already tracks. About half the full spec
// was deliberately left out — see CLAUDE.md's Medals section for the full
// backlog (near-duplicate entries under this app's model, and entries
// needing features that don't exist yet: coach check-ins/feedback/
// challenges as trackable events, fitness goals, sleep tracking, progress
// photos, mobility/recovery/rest-day session types, and distance/running).
// XP tiers per the spec: 10 (quick wins/onboarding), 15 (building momentum),
// 20 (streaks & consistency), 30 (advanced effort), 50 (major milestones).
export const mockMedals: Medal[] = [
  // ── 10 XP — quick wins & onboarding ──
  {
    id: '1',
    name: 'First Step',
    description: 'Complete your first workout',
    icon: 'fitness',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '6',
    name: 'Early Bird',
    description: 'Complete your first morning workout',
    icon: 'sunny',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '8',
    name: 'Night Owl',
    description: 'Complete your first evening workout',
    icon: 'moon',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '9',
    name: 'Profile Complete',
    description: 'Complete your fitness profile',
    icon: 'person-circle',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '10',
    name: 'Coach Connected',
    description: 'Connect with your coach',
    icon: 'people',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '11',
    name: 'Progress Logged',
    description: 'Record your first progress measurement',
    icon: 'scale',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  // ── 15 XP — building momentum ──
  {
    id: '12',
    name: '3-Day Streak',
    description: 'Train for 3 consecutive days',
    icon: 'flame-outline',
    earned: false,
    rarity: 'common',
    xpReward: 15,
  },
  {
    id: '13',
    name: 'Plan Follower',
    description: 'Complete 5 scheduled workouts',
    icon: 'checkmark-done',
    earned: false,
    rarity: 'common',
    xpReward: 15,
  },
  {
    id: '14',
    name: '10K Steps',
    description: 'Reach 10,000 steps in one day',
    icon: 'walk',
    earned: false,
    rarity: 'common',
    xpReward: 15,
  },
  {
    id: '15',
    name: 'Daily Doer',
    description: 'Log activity for 10 different days',
    icon: 'calendar-outline',
    earned: false,
    rarity: 'common',
    xpReward: 15,
  },
  // ── 20 XP — streaks & consistency ──
  {
    id: '2',
    name: '7-Day Streak',
    description: 'Stay active for 7 consecutive days',
    icon: 'flame',
    earned: false,
    rarity: 'rare',
    xpReward: 20,
  },
  {
    id: '16',
    name: '10 Workouts Strong',
    description: 'Complete 10 total workouts',
    icon: 'barbell',
    earned: false,
    rarity: 'rare',
    xpReward: 20,
  },
  {
    id: '17',
    name: 'Next Level',
    description: 'Start your second training plan',
    icon: 'rocket',
    earned: false,
    rarity: 'rare',
    xpReward: 20,
  },
  // ── 30 XP — advanced effort ──
  {
    id: '18',
    name: '14-Day Streak',
    description: 'Stay active for 14 consecutive days',
    icon: 'flame',
    earned: false,
    rarity: 'rare',
    xpReward: 30,
  },
  {
    id: '19',
    name: '21-Day Streak',
    description: 'Stay active for 21 consecutive days',
    icon: 'flame',
    earned: false,
    rarity: 'rare',
    xpReward: 30,
  },
  {
    id: '20',
    name: '25 Workouts Strong',
    description: 'Complete 25 total workouts',
    icon: 'barbell',
    earned: false,
    rarity: 'rare',
    xpReward: 30,
  },
  // ── 50 XP — major milestones ──
  {
    id: '3',
    name: '30-Day Streak',
    description: 'Work out 30 days in a row',
    icon: 'trophy',
    earned: false,
    rarity: 'ultra_rare',
    xpReward: 50,
  },
  {
    id: '4',
    name: '100 Workouts',
    description: 'Complete 100 workouts total',
    icon: 'medal',
    earned: false,
    rarity: 'ultra_rare',
    xpReward: 50,
  },
  {
    id: '21',
    name: '50 Workouts Strong',
    description: 'Complete 50 total workouts',
    icon: 'barbell',
    earned: false,
    rarity: 'ultra_rare',
    xpReward: 50,
  },
  {
    id: '22',
    name: 'Always Moving',
    description: 'Accumulate 100 active days',
    icon: 'infinite',
    earned: false,
    rarity: 'ultra_rare',
    xpReward: 50,
  },
  // ── Not yet automated — needs data this app doesn't compute yet ──
  {
    id: '5',
    name: 'Top Ranker',
    description: 'Reach top 10 on the leaderboard',
    icon: 'star',
    earned: false,
    rarity: 'ultra_rare',
    xpReward: 45,
  },
  {
    id: '7',
    name: 'New Adventure',
    description: 'Welcome! You started your fitness journey',
    icon: 'rocket-outline',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
];
