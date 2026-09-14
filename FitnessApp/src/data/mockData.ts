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

// XP needed for each level (level * 500)
export const getXpForNextLevel = (level: number) => level * 500;
export const getCurrentLevelXp = (xp: number) => xp % 500;
export const computeLevelFromXp = (xp: number) => Math.floor(xp / 500) + 1;

// XP rewards are scaled 10-50 across the whole catalog (common lowest,
// ultra_rare highest) — previously ranged 50-3000, wildly out of proportion
// with a single workout's own XP. 'First Workout' and 'New Adventure' are no
// longer auto-awarded (evaluateAndAwardMedals in db.ts) since they're
// single-workout achievements; kept here only so a trainee who already
// earned one keeps seeing it on their profile.
export const mockMedals: Medal[] = [
  {
    id: '1',
    name: 'First Workout',
    description: 'Complete your first workout',
    icon: 'fitness',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
  {
    id: '2',
    name: '7-Day Streak',
    description: 'Work out 7 days in a row',
    icon: 'flame',
    earned: false,
    rarity: 'rare',
    xpReward: 25,
  },
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
    rarity: 'rare',
    xpReward: 35,
  },
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
    id: '6',
    name: 'Early Bird',
    description: 'Complete 10 morning workouts',
    icon: 'sunny',
    earned: false,
    rarity: 'common',
    xpReward: 15,
  },
  {
    id: '7',
    name: 'New Adventure',
    description: 'Welcome! You started your fitness journey',
    icon: 'rocket',
    earned: false,
    rarity: 'common',
    xpReward: 10,
  },
];
