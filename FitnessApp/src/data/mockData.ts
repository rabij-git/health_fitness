export type UserRole = 'admin' | 'coach' | 'trainer';

export interface Trainer {
  id: string;
  name: string;
  avatar: string;
  program: string;
  lastActive: string;
  progress: number;
  level: number;
  xp: number;
  streak: number;
}

export interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: string;
  weight?: string;
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

export interface Medal {
  id: string;
  name: string;
  description: string;
  icon: string;
  earned: boolean;
  rarity: 'common' | 'rare' | 'ultra_rare';
  xpReward: number;
}

export interface LeaderboardUser {
  id: string;
  rank: number;
  name: string;
  xp: number;
  level: number;
  title: string;
  titleRarity: 'common' | 'rare' | 'ultra_rare';
  isCurrentUser: boolean;
  gym: string;
  rankChange?: number; // positive = moved up, negative = moved down, 0 = no change
}

export interface TraineeNotification {
  id: string;
  type: 'program_updated' | 'new_program';
  message: string;
  read: boolean;
  time: string;
}

export interface ExerciseWeightLog {
  exerciseId: string;
  exerciseName: string;
  entries: { date: string; weight: string; reps: string; sets: number }[];
}

export interface CoachMessage {
  id: string;
  from: string;
  message: string;
  time: string;
  isCoach: boolean;
}

export interface BiometricEntry {
  date: string;
  weight: number;
}

export interface SyncLog {
  id: string;
  service: string;
  status: 'success' | 'error' | 'pending';
  time: string;
  records: number;
}

export interface Program {
  id: string;
  name: string;
  description: string;
  duration: string;
  difficulty: string;
}

export interface TraineeAccount {
  id: string;
  name: string;
  email: string;
  avatar: string;
  status: 'pending' | 'assigned';
  programId?: string;
  programName?: string;
  assignedWorkout?: Workout;
  level?: number;
  xp?: number;
  notifications?: TraineeNotification[];
}

// Mock Trainers
export const mockTrainers: Trainer[] = [
  {
    id: '1',
    name: 'Alex Johnson',
    avatar: 'AJ',
    program: 'Strength Builder Pro',
    lastActive: '2 hours ago',
    progress: 75,
    level: 12,
    xp: 4250,
    streak: 14,
  },
  {
    id: '2',
    name: 'Sarah Martinez',
    avatar: 'SM',
    program: 'HIIT Cardio Blast',
    lastActive: '30 min ago',
    progress: 90,
    level: 18,
    xp: 7800,
    streak: 30,
  },
  {
    id: '3',
    name: 'Mike Chen',
    avatar: 'MC',
    program: 'Hypertrophy Max',
    lastActive: '1 day ago',
    progress: 45,
    level: 8,
    xp: 2100,
    streak: 5,
  },
  {
    id: '4',
    name: 'Emma Davis',
    avatar: 'ED',
    program: 'Strength Builder Pro',
    lastActive: '3 hours ago',
    progress: 60,
    level: 10,
    xp: 3300,
    streak: 7,
  },
];

// Mock Current User (Trainer)
export const mockCurrentUser: Trainer = {
  id: 'me',
  name: 'Jordan Lee',
  avatar: 'JL',
  program: 'Strength Builder Pro',
  lastActive: 'Now',
  progress: 68,
  level: 14,
  xp: 5480,
  streak: 12,
};

// XP needed for each level (level * 500)
export const getXpForNextLevel = (level: number) => level * 500;
export const getCurrentLevelXp = (xp: number) => xp % 500;
export const getXpProgress = (xp: number) => {
  const level = Math.floor(xp / 500);
  const currentXp = xp - level * 500;
  return currentXp / 500;
};

// Mock Workout
export const mockWorkout: Workout = {
  id: '1',
  name: 'Push Day A',
  description: 'Upper body strength focused on chest, shoulders and triceps',
  duration: '60 min',
  difficulty: 'Intermediate',
  exercises: [
    {
      id: '1',
      name: 'Barbell Bench Press',
      sets: 4,
      reps: '8',
      weight: '80kg',
      completed: false,
    },
    {
      id: '2',
      name: 'Overhead Press',
      sets: 3,
      reps: '10',
      weight: '50kg',
      completed: false,
    },
    {
      id: '3',
      name: 'Incline Dumbbell Flyes',
      sets: 3,
      reps: '12',
      weight: '20kg',
      completed: false,
    },
    {
      id: '4',
      name: 'Tricep Dips',
      sets: 3,
      reps: '15',
      completed: false,
    },
    {
      id: '5',
      name: 'Cable Lateral Raises',
      sets: 3,
      reps: '15',
      weight: '10kg',
      completed: false,
    },
  ],
};

// Mock Medals
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

// Mock Leaderboard
export const mockLeaderboard: LeaderboardUser[] = [
  { id: '1', rank: 1, name: 'Chris Power', xp: 15200, level: 30, title: 'Iron Legend', titleRarity: 'ultra_rare', isCurrentUser: false, gym: 'FitPro Downtown', rankChange: 0 },
  { id: '2', rank: 2, name: 'Sarah Martinez', xp: 12800, level: 25, title: 'Cardio King', titleRarity: 'rare', isCurrentUser: false, gym: 'FitPro Downtown', rankChange: 2 },
  { id: '3', rank: 3, name: 'Tyler Beast', xp: 11500, level: 23, title: 'Strength Master', titleRarity: 'rare', isCurrentUser: false, gym: 'FitPro East', rankChange: -1 },
  { id: '4', rank: 4, name: 'Maya Torres', xp: 10200, level: 20, title: 'Elite Athlete', titleRarity: 'rare', isCurrentUser: false, gym: 'FitPro Downtown', rankChange: 1 },
  { id: '5', rank: 5, name: 'Alex Johnson', xp: 8900, level: 17, title: 'Rising Star', titleRarity: 'common', isCurrentUser: false, gym: 'FitPro West', rankChange: -2 },
  { id: '6', rank: 6, name: 'Ryan Flex', xp: 7500, level: 15, title: 'Grinder', titleRarity: 'common', isCurrentUser: false, gym: 'FitPro East', rankChange: 0 },
  { id: 'me', rank: 7, name: 'Jordan Lee', xp: 5480, level: 14, title: 'Consistent', titleRarity: 'common', isCurrentUser: true, gym: 'FitPro Downtown', rankChange: 3 },
  { id: '8', rank: 8, name: 'Dana Swift', xp: 4800, level: 9, title: 'Newcomer', titleRarity: 'common', isCurrentUser: false, gym: 'FitPro West', rankChange: -1 },
  { id: '9', rank: 9, name: 'Tom Builder', xp: 4100, level: 8, title: 'Newcomer', titleRarity: 'common', isCurrentUser: false, gym: 'FitPro Downtown', rankChange: 0 },
  { id: '10', rank: 10, name: 'Lisa Strong', xp: 3500, level: 7, title: 'Newcomer', titleRarity: 'common', isCurrentUser: false, gym: 'FitPro East', rankChange: -2 },
];

// Mock Biometrics
export const mockBiometrics: BiometricEntry[] = [
  { date: 'Jun 13', weight: 82.5 },
  { date: 'Jun 14', weight: 82.2 },
  { date: 'Jun 15', weight: 82.0 },
  { date: 'Jun 16', weight: 81.8 },
  { date: 'Jun 17', weight: 81.9 },
  { date: 'Jun 18', weight: 81.5 },
  { date: 'Jun 19', weight: 81.3 },
];

// Mock Sync Logs
export const mockSyncLogs: SyncLog[] = [
  {
    id: '1',
    service: 'Apple Health',
    status: 'success',
    time: '10 min ago',
    records: 247,
  },
  {
    id: '2',
    service: 'Garmin Connect',
    status: 'success',
    time: '1 hour ago',
    records: 89,
  },
  {
    id: '3',
    service: 'MyFitnessPal',
    status: 'error',
    time: '2 hours ago',
    records: 0,
  },
  {
    id: '4',
    service: 'Apple Health',
    status: 'success',
    time: '6 hours ago',
    records: 312,
  },
  {
    id: '5',
    service: 'Garmin Connect',
    status: 'pending',
    time: 'Just now',
    records: 0,
  },
];

// Mock Programs
export const mockPrograms: Program[] = [
  {
    id: '1',
    name: 'Strength Builder Pro',
    description: '12-week powerlifting focused program for intermediate athletes',
    duration: '12 weeks',
    difficulty: 'Intermediate',
  },
  {
    id: '2',
    name: 'HIIT Cardio Blast',
    description: '8-week high intensity interval training for fat loss and conditioning',
    duration: '8 weeks',
    difficulty: 'Advanced',
  },
  {
    id: '3',
    name: 'Hypertrophy Max',
    description: '16-week muscle building program with progressive overload principles',
    duration: '16 weeks',
    difficulty: 'Intermediate',
  },
];

// Admin stats
export const mockAdminStats = {
  totalUsers: 1247,
  activeTrainers: 89,
  syncedToday: 342,
};

export const mockPendingTrainees: TraineeAccount[] = [
  { id: 'p1', name: 'James Wilson', email: 'james@fitpro.com', avatar: 'JW', status: 'pending' },
  { id: 'p2', name: 'Priya Patel', email: 'priya@fitpro.com', avatar: 'PP', status: 'pending' },
  { id: 'p3', name: 'Luca Rossi', email: 'luca@fitpro.com', avatar: 'LR', status: 'pending' },
  { id: 'p4', name: 'Sofia Andersen', email: 'sofia@fitpro.com', avatar: 'SA', status: 'pending' },
];

// Exercise weight history logs
export const mockExerciseWeightLogs: ExerciseWeightLog[] = [
  {
    exerciseId: '1',
    exerciseName: 'Barbell Bench Press',
    entries: [
      { date: 'Jun 20', weight: '75kg', reps: '8', sets: 4 },
      { date: 'Jun 22', weight: '77.5kg', reps: '8', sets: 4 },
      { date: 'Jun 25', weight: '80kg', reps: '8', sets: 4 },
      { date: 'Jun 27', weight: '80kg', reps: '9', sets: 4 },
      { date: 'Jul 1', weight: '82.5kg', reps: '8', sets: 4 },
    ],
  },
  {
    exerciseId: '2',
    exerciseName: 'Overhead Press',
    entries: [
      { date: 'Jun 20', weight: '45kg', reps: '10', sets: 3 },
      { date: 'Jun 22', weight: '47.5kg', reps: '10', sets: 3 },
      { date: 'Jun 25', weight: '50kg', reps: '10', sets: 3 },
      { date: 'Jul 1', weight: '52.5kg', reps: '8', sets: 3 },
    ],
  },
  {
    exerciseId: '3',
    exerciseName: 'Incline Dumbbell Flyes',
    entries: [
      { date: 'Jun 20', weight: '18kg', reps: '12', sets: 3 },
      { date: 'Jun 25', weight: '20kg', reps: '12', sets: 3 },
      { date: 'Jul 1', weight: '20kg', reps: '13', sets: 3 },
    ],
  },
  {
    exerciseId: '4',
    exerciseName: 'Tricep Dips',
    entries: [
      { date: 'Jun 22', weight: 'BW', reps: '15', sets: 3 },
      { date: 'Jun 27', weight: 'BW+5kg', reps: '12', sets: 3 },
      { date: 'Jul 1', weight: 'BW+10kg', reps: '10', sets: 3 },
    ],
  },
  {
    exerciseId: '5',
    exerciseName: 'Cable Lateral Raises',
    entries: [
      { date: 'Jun 20', weight: '8kg', reps: '15', sets: 3 },
      { date: 'Jun 25', weight: '10kg', reps: '15', sets: 3 },
      { date: 'Jul 1', weight: '10kg', reps: '15', sets: 3 },
    ],
  },
];

// Coach messages mock
export const mockCoachMessages: CoachMessage[] = [
  { id: '1', from: 'Coach Mike', message: 'Great work this week! Keep pushing on the bench press.', time: '2h ago', isCoach: true },
  { id: '2', from: 'You', message: 'Thanks! Felt really strong today.', time: '1h ago', isCoach: false },
  { id: '3', from: 'Coach Mike', message: "I've updated your program — added some pull variations for balance. Check your Workout tab.", time: '30m ago', isCoach: true },
];