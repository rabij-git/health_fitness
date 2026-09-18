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

// Achievement catalog — every one of the 100 named achievements from the
// "100 Achievements" list is represented here, so all 100 are visible in
// the Medal Collection screen. They split into three groups (see the
// section comments below): (1) achievements with their own directly-
// computed trigger, (2) achievements that are genuinely the SAME event as
// one of those under this app's current model (no coached/self-directed or
// strength/cardio workout-type distinction exists, etc.) — awarded together
// via evaluateAndAwardMedals (db.ts) the moment the shared condition fires,
// and (3) achievements needing a feature the app doesn't have yet (weight-
// based PRs, coach check-ins/feedback/challenges, fitness goals, sleep
// tracking, progress photos, mobility/recovery/rest-day session types,
// distance/running, cumulative training hours, weekly/monthly schedule-
// adherence percentages, long-horizon tenure) — visible but never
// auto-awarded until that feature exists; see CLAUDE.md's Medals section
// for the reasoning behind each one. XP tiers per the spec: 10 (quick wins/
// onboarding), 15 (building momentum), 20 (streaks & consistency), 30
// (advanced effort), 50 (major milestones).
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
  // ── Auto-awarded, reusing an EXISTING check's trigger ──
  // These names/descriptions come from the "100 Achievements" list but map
  // to a condition the app already evaluates for a differently-named medal
  // above (no separate coached/self-directed or strength/cardio workout
  // types exist here, so several distinctly-named achievements are
  // genuinely the same event under this app's model). evaluateAndAwardMedals
  // (db.ts) awards all matching ids together the moment their shared
  // condition is met, rather than picking just one representative name —
  // per explicit direction, every one of the 100 named achievements should
  // be visible/earnable in the app, even where several share a trigger.
  {
    id: '23',
    name: 'Welcome Aboard',
    description: 'Complete your first coached workout',
    icon: 'hand-left',
    earned: false,
    rarity: 'common',
    xpReward: 10, // same trigger as '1' First Step
  },
  {
    id: '25',
    name: 'Plan Activated',
    description: 'Start your first training plan',
    icon: 'play-circle',
    earned: false,
    rarity: 'common',
    xpReward: 10, // new check: first workout ever ASSIGNED (not completed)
  },
  {
    id: '28',
    name: 'Logged & Done',
    description: 'Log your first completed workout',
    icon: 'checkmark-circle-outline',
    earned: false,
    rarity: 'common',
    xpReward: 10, // same trigger as '1' First Step
  },
  {
    id: '34',
    name: 'Plan Starter',
    description: 'Complete your first scheduled workout',
    icon: 'flag',
    earned: false,
    rarity: 'common',
    xpReward: 10, // same trigger as '1' First Step
  },
  {
    id: '42',
    name: 'First Rep',
    description: 'Complete your first strength workout',
    icon: 'barbell-outline',
    earned: false,
    rarity: 'common',
    xpReward: 10, // same trigger as '1' First Step — every workout here is strength-based
  },
  {
    id: '91',
    name: 'Coach Approved',
    description: 'Complete a workout specifically assigned by your coach',
    icon: 'ribbon-outline',
    earned: false,
    rarity: 'common',
    xpReward: 10, // same trigger as '1' First Step — every workout is coach-assigned
  },
  {
    id: '29',
    name: 'Consistency King',
    description: 'Complete 10 planned workouts',
    icon: 'flame',
    earned: false,
    rarity: 'rare',
    xpReward: 20, // same trigger as '16' 10 Workouts Strong
  },
  {
    id: '44',
    name: 'Strength Builder',
    description: 'Complete 10 strength workouts',
    icon: 'barbell',
    earned: false,
    rarity: 'rare',
    xpReward: 20, // same trigger as '16' 10 Workouts Strong
  },
  {
    id: '81',
    name: 'Data Driven',
    description: 'Log 10 workouts with complete data',
    icon: 'stats-chart-outline',
    earned: false,
    rarity: 'common',
    xpReward: 15, // same trigger (sessionsCount >= 10) as '16' 10 Workouts Strong — the spec gives these two different XP for the same threshold, kept as specified
  },
  {
    id: '95',
    name: 'Coached Consistency',
    description: 'Complete 10 coached workouts',
    icon: 'people-circle-outline',
    earned: false,
    rarity: 'rare',
    xpReward: 20, // same trigger as '16' 10 Workouts Strong — every workout is coached
  },
  {
    id: '30',
    name: 'Consistency Pro',
    description: 'Complete 25 planned workouts',
    icon: 'flame',
    earned: false,
    rarity: 'rare',
    xpReward: 30, // same trigger as '20' 25 Workouts Strong
  },
  {
    id: '45',
    name: 'Strength Machine',
    description: 'Complete 25 strength workouts',
    icon: 'barbell',
    earned: false,
    rarity: 'rare',
    xpReward: 30, // same trigger as '20' 25 Workouts Strong
  },
  {
    id: '82',
    name: 'Tracking Pro',
    description: 'Log 25 workouts with complete data',
    icon: 'stats-chart',
    earned: false,
    rarity: 'rare',
    xpReward: 20, // same trigger as '20' 25 Workouts Strong
  },
  {
    id: '31',
    name: 'Halfway There',
    description: 'Complete 50 planned workouts',
    icon: 'trending-up',
    earned: false,
    rarity: 'ultra_rare',
    xpReward: 50, // same trigger as '21' 50 Workouts Strong
  },
  {
    id: '84',
    name: 'Data Devotee',
    description: 'Log 50 workouts',
    icon: 'server-outline',
    earned: false,
    rarity: 'rare',
    xpReward: 30, // same trigger as '21' 50 Workouts Strong
  },
  {
    id: '32',
    name: 'Century Club',
    description: 'Complete 100 workouts',
    icon: 'trophy-outline',
    earned: false,
    rarity: 'ultra_rare',
    xpReward: 50, // same trigger as '4' 100 Workouts
  },
  {
    id: '97',
    name: '100 Workouts Strong',
    description: 'Complete 100 total workouts',
    icon: 'trophy',
    earned: false,
    rarity: 'ultra_rare',
    xpReward: 50, // same trigger as '4' 100 Workouts
  },
  {
    id: '79',
    name: 'Progress Check',
    description: 'Complete your first progress check-in',
    icon: 'clipboard-outline',
    earned: false,
    rarity: 'common',
    xpReward: 10, // same trigger as '11' Progress Logged
  },

  // ── Catalog-only — visible, but not yet auto-awarded ──
  // These need a feature the app doesn't have (weight-based PRs, coach
  // check-ins/feedback/challenges as trackable events, fitness goals, sleep
  // tracking, progress photos, mobility/recovery/rest-day session types,
  // distance/running, cumulative training hours, weekly/monthly schedule-
  // adherence percentages, or long-horizon tenure states). Added per
  // explicit request so every one of the 100 named achievements is at least
  // visible in the Medal Collection (an honest "not yet earned" — nothing
  // here fabricates progress toward them) — see CLAUDE.md's Medals section
  // for the reasoning behind each group.
  {
    id: '24',
    name: 'Goal Setter',
    description: 'Set your first fitness goal',
    icon: 'flag-outline',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '26',
    name: 'First Check-In',
    description: 'Complete your first coach check-in',
    icon: 'chatbox-ellipses-outline',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '27',
    name: 'First Week',
    description: 'Complete your first week of training',
    icon: 'calendar',
    earned: false,
    rarity: 'common',
    xpReward: 15,
  },
  {
    id: '33',
    name: 'Never Miss Twice',
    description: 'Return to training after missing a planned session',
    icon: 'refresh',
    earned: false,
    rarity: 'common',
    xpReward: 15,
  },
  {
    id: '35',
    name: 'On Track',
    description: 'Complete 90% of your scheduled workouts in a week',
    icon: 'speedometer-outline',
    earned: false,
    rarity: 'common',
    xpReward: 15,
  },
  {
    id: '36',
    name: 'Perfect Week',
    description: 'Complete every scheduled workout for one week',
    icon: 'checkmark-done-circle-outline',
    earned: false,
    rarity: 'rare',
    xpReward: 20,
  },
  {
    id: '37',
    name: 'Perfect Month',
    description: 'Complete every scheduled workout for one month',
    icon: 'checkmark-done-circle',
    earned: false,
    rarity: 'ultra_rare',
    xpReward: 50,
  },
  {
    id: '38',
    name: 'Week Warrior',
    description: 'Complete all weekly training targets',
    icon: 'shield-checkmark-outline',
    earned: false,
    rarity: 'rare',
    xpReward: 20,
  },
  {
    id: '39',
    name: 'Month Master',
    description: 'Complete all monthly training targets',
    icon: 'shield-checkmark',
    earned: false,
    rarity: 'rare',
    xpReward: 30,
  },
  {
    id: '40',
    name: 'Plan Complete',
    description: 'Finish your first training plan',
    icon: 'flag',
    earned: false,
    rarity: 'ultra_rare',
    xpReward: 50,
  },
  {
    id: '41',
    name: 'Committed',
    description: 'Complete 12 weeks of structured training',
    icon: 'ribbon',
    earned: false,
    rarity: 'rare',
    xpReward: 30,
  },
  {
    id: '43',
    name: 'Iron Beginner',
    description: 'Complete 5 strength workouts',
    icon: 'barbell-outline',
    earned: false,
    rarity: 'common',
    xpReward: 15,
  },
  {
    id: '46',
    name: 'Progressive',
    description: 'Increase weight on an exercise',
    icon: 'trending-up-outline',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '47',
    name: 'Stronger Than Before',
    description: 'Beat a previous performance',
    icon: 'trending-up',
    earned: false,
    rarity: 'common',
    xpReward: 15,
  },
  {
    id: '48',
    name: 'Personal Best',
    description: 'Set your first personal record',
    icon: 'star-outline',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '49',
    name: 'PR Hunter',
    description: 'Set 5 personal records',
    icon: 'star-half',
    earned: false,
    rarity: 'rare',
    xpReward: 20,
  },
  {
    id: '50',
    name: 'PR Collector',
    description: 'Set 10 personal records',
    icon: 'star',
    earned: false,
    rarity: 'rare',
    xpReward: 30,
  },
  {
    id: '51',
    name: 'Stronger Together',
    description: 'Beat a performance target set by your coach',
    icon: 'people-outline',
    earned: false,
    rarity: 'rare',
    xpReward: 20,
  },
  {
    id: '52',
    name: 'First Mile',
    description: 'Complete your first mile or kilometer goal',
    icon: 'footsteps-outline',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '53',
    name: 'Cardio Starter',
    description: 'Complete your first cardio workout',
    icon: 'heart-outline',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '54',
    name: '5K Finisher',
    description: 'Complete your first 5K',
    icon: 'ribbon-outline',
    earned: false,
    rarity: 'rare',
    xpReward: 20,
  },
  {
    id: '55',
    name: '10K Finisher',
    description: 'Complete your first 10K',
    icon: 'ribbon',
    earned: false,
    rarity: 'rare',
    xpReward: 30,
  },
  {
    id: '56',
    name: 'Endurance Builder',
    description: 'Complete 5 cardio sessions',
    icon: 'heart',
    earned: false,
    rarity: 'common',
    xpReward: 15,
  },
  {
    id: '57',
    name: 'Cardio Regular',
    description: 'Complete 20 cardio sessions',
    icon: 'heart',
    earned: false,
    rarity: 'rare',
    xpReward: 30,
  },
  {
    id: '58',
    name: 'Distance Builder',
    description: 'Reach a new distance record',
    icon: 'map-outline',
    earned: false,
    rarity: 'rare',
    xpReward: 20,
  },
  {
    id: '59',
    name: 'Long Haul',
    description: 'Complete your longest workout yet',
    icon: 'hourglass-outline',
    earned: false,
    rarity: 'rare',
    xpReward: 20,
  },
  {
    id: '60',
    name: 'Go The Distance',
    description: 'Beat a distance goal set by your coach',
    icon: 'map',
    earned: false,
    rarity: 'rare',
    xpReward: 20,
  },
  {
    id: '61',
    name: 'Move More',
    description: 'Reach your daily activity goal',
    icon: 'walk-outline',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '62',
    name: 'Step Up',
    description: 'Beat your daily step average',
    icon: 'walk',
    earned: false,
    rarity: 'common',
    xpReward: 15,
  },
  {
    id: '63',
    name: 'Active Day',
    description: 'Record activity on a previously inactive day',
    icon: 'sunny-outline',
    earned: false,
    rarity: 'common',
    xpReward: 15,
  },
  {
    id: '64',
    name: 'Weekend Warrior',
    description: 'Hit your activity target on a weekend',
    icon: 'calendar-outline',
    earned: false,
    rarity: 'common',
    xpReward: 15,
  },
  {
    id: '65',
    name: '7-Day Mover',
    description: 'Reach your activity goal every day for a week',
    icon: 'walk',
    earned: false,
    rarity: 'rare',
    xpReward: 20,
  },
  {
    id: '66',
    name: 'Movement Month',
    description: 'Reach your activity goal for 30 days',
    icon: 'walk',
    earned: false,
    rarity: 'rare',
    xpReward: 30,
  },
  {
    id: '67',
    name: 'Walk It Out',
    description: 'Complete your first dedicated walking session',
    icon: 'footsteps',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '68',
    name: 'Active Hour',
    description: 'Reach your hourly movement target',
    icon: 'time-outline',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '69',
    name: 'Stretch Starter',
    description: 'Complete your first mobility session',
    icon: 'body-outline',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '70',
    name: 'Flexible Future',
    description: 'Complete 5 mobility sessions',
    icon: 'body',
    earned: false,
    rarity: 'common',
    xpReward: 15,
  },
  {
    id: '71',
    name: 'Recovery Pro',
    description: 'Complete 10 recovery sessions',
    icon: 'bandage-outline',
    earned: false,
    rarity: 'rare',
    xpReward: 20,
  },
  {
    id: '72',
    name: 'Cool Down',
    description: 'Complete your first post-workout cooldown',
    icon: 'snow-outline',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '73',
    name: 'Rest Day Respect',
    description: 'Complete a planned rest day',
    icon: 'bed-outline',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '74',
    name: 'Recovery Matters',
    description: "Follow your coach's recovery recommendation",
    icon: 'medkit-outline',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '75',
    name: 'Sleep Champion',
    description: 'Meet your sleep target',
    icon: 'moon-outline',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '76',
    name: 'Sleep Streak',
    description: 'Meet your sleep target for 7 nights',
    icon: 'moon',
    earned: false,
    rarity: 'rare',
    xpReward: 20,
  },
  {
    id: '77',
    name: 'Recovery Streak',
    description: 'Complete a full week of planned recovery',
    icon: 'bandage',
    earned: false,
    rarity: 'rare',
    xpReward: 20,
  },
  {
    id: '78',
    name: 'Balance Builder',
    description: 'Complete training, recovery, and rest in the same week',
    icon: 'sync-outline',
    earned: false,
    rarity: 'rare',
    xpReward: 20,
  },
  {
    id: '80',
    name: 'Photo Finish',
    description: 'Upload your first progress photo',
    icon: 'camera-outline',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '83',
    name: 'Progress Month',
    description: 'Track your progress for 30 days',
    icon: 'calendar',
    earned: false,
    rarity: 'rare',
    xpReward: 30,
  },
  {
    id: '85',
    name: 'Trend Setter',
    description: 'Improve one tracked metric for 4 weeks',
    icon: 'trending-up',
    earned: false,
    rarity: 'rare',
    xpReward: 30,
  },
  {
    id: '86',
    name: 'Progress Revealed',
    description: 'Complete your first progress review with your coach',
    icon: 'eye-outline',
    earned: false,
    rarity: 'rare',
    xpReward: 30,
  },
  {
    id: '87',
    name: 'Proof of Progress',
    description: 'Beat a baseline measurement or performance benchmark',
    icon: 'checkmark-circle',
    earned: false,
    rarity: 'rare',
    xpReward: 30,
  },
  {
    id: '88',
    name: 'Coach Check-In',
    description: 'Complete 5 coach check-ins',
    icon: 'chatbubbles-outline',
    earned: false,
    rarity: 'rare',
    xpReward: 20,
  },
  {
    id: '89',
    name: 'Feedback Friend',
    description: 'Send your first training feedback',
    icon: 'chatbox-outline',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '90',
    name: 'Question Asked',
    description: 'Ask your coach your first training question',
    icon: 'help-circle-outline',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '92',
    name: 'Feedback Applied',
    description: 'Successfully apply coach feedback to a workout',
    icon: 'checkmark-done',
    earned: false,
    rarity: 'common',
    xpReward: 15,
  },
  {
    id: '93',
    name: "Coach's Challenge",
    description: 'Complete your first coach-assigned challenge',
    icon: 'trophy-outline',
    earned: false,
    rarity: 'common',
    xpReward: 15,
  },
  {
    id: '94',
    name: 'Team Player',
    description: 'Complete 5 coach-assigned challenges',
    icon: 'people',
    earned: false,
    rarity: 'rare',
    xpReward: 20,
  },
  {
    id: '96',
    name: "Coach's Milestone",
    description: 'Reach a milestone chosen by your coach',
    icon: 'flag',
    earned: false,
    rarity: 'rare',
    xpReward: 30,
  },
  {
    id: '98',
    name: '100 Hours',
    description: 'Accumulate 100 hours of training',
    icon: 'time',
    earned: false,
    rarity: 'ultra_rare',
    xpReward: 50,
  },
  {
    id: '99',
    name: '250 Hours',
    description: 'Accumulate 250 hours of training',
    icon: 'time',
    earned: false,
    rarity: 'ultra_rare',
    xpReward: 50,
  },
  {
    id: '100',
    name: 'Transformation Journey',
    description: 'Complete 6 months of consistent training',
    icon: 'sparkles-outline',
    earned: false,
    rarity: 'ultra_rare',
    xpReward: 50,
  },
  {
    id: '101',
    name: 'One Year Strong',
    description: 'Stay active and engaged for one year',
    icon: 'calendar',
    earned: false,
    rarity: 'ultra_rare',
    xpReward: 50,
  },
  {
    id: '102',
    name: 'Level Up',
    description: 'Reach a major goal set at the beginning of your journey',
    icon: 'arrow-up-circle',
    earned: false,
    rarity: 'ultra_rare',
    xpReward: 50,
  },
  {
    id: '103',
    name: 'Fitness Lifestyle',
    description: 'Complete 12 months of consistent training, tracking, and coaching',
    icon: 'diamond',
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
