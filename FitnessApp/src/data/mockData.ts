export type UserRole = 'admin' | 'coach' | 'trainer';

export interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: string;
  weight?: string;
  time?: string;
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

export const mockMedals: Medal[] = [
  {
    id: '1',
    name: 'First Workout',
    description: 'Complete your first workout',
    icon: 'fitness',
    earned: false,
    rarity: 'common',
    xpReward: 100,
  },
  {
    id: '2',
    name: '7-Day Streak',
    description: 'Work out 7 days in a row',
    icon: 'flame',
    earned: false,
    rarity: 'rare',
    xpReward: 500,
  },
  {
    id: '3',
    name: '30-Day Streak',
    description: 'Work out 30 days in a row',
    icon: 'trophy',
    earned: false,
    rarity: 'ultra_rare',
    xpReward: 2000,
  },
  {
    id: '4',
    name: '100 Workouts',
    description: 'Complete 100 workouts total',
    icon: 'medal',
    earned: false,
    rarity: 'rare',
    xpReward: 1000,
  },
  {
    id: '5',
    name: 'Top Ranker',
    description: 'Reach top 10 on the leaderboard',
    icon: 'star',
    earned: false,
    rarity: 'ultra_rare',
    xpReward: 3000,
  },
  {
    id: '6',
    name: 'Early Bird',
    description: 'Complete 10 morning workouts',
    icon: 'sunny',
    earned: false,
    rarity: 'common',
    xpReward: 250,
  },
  {
    id: '7',
    name: 'New Adventure',
    description: 'Welcome! You started your fitness journey',
    icon: 'rocket',
    earned: false,
    rarity: 'common',
    xpReward: 50,
  },
];
